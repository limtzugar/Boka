// ═══════════════════════════════════════════════════════════
// BOKA OS v0.3.15 — Document AI Service
// Umowy + dokumenty księgowe/administracyjne
// Obszary prawa: rodzinne · budowlane · prawa autorskie
// ═══════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { chatCompletion, loadSettings } from '@/lib/ai-providers';
import { getFamily } from '@/lib/family-service';
import { ensureFamilySeeded } from '@/lib/auto-seed';
import { BUILT_IN_TEMPLATES, type TemplateField } from '@/lib/document-templates';

// ── Storage paths ──
const MEMORY_BASE = process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory';
const DOCUMENTS_DIR = path.join(MEMORY_BASE, 'documents');

// ── Types ──
export type LegalArea = 'family' | 'construction' | 'copyright' | 'mixed' | 'admin' | 'other';
export type DocumentKind = 'umowa' | 'akt' | 'pismo' | 'wniosek' | 'oświadczenie' | 'protokół' | 'faktura' | 'regulamin' | 'inny';

export interface DocumentAnalysis {
  summary: string;
  documentKind: string;
  legalArea: LegalArea;
  parties: string[];
  keyDates: { label: string; date: string }[];
  obligations: { party: string; obligation: string }[];
  risks: { severity: 'low' | 'medium' | 'high'; description: string; recommendation: string }[];
  keyClauses: { title: string; summary: string; concern?: string }[];
  recommendations: string[];
  redFlags: string[];
}

export interface DocumentListItem {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  documentKind: string | null;
  legalArea: LegalArea | null;
  hasAnalysis: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────
// FILE STORAGE
// ─────────────────────────────────────────────────────────

export function ensureDocumentsDir(): void {
  if (!fs.existsSync(DOCUMENTS_DIR)) {
    fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  }
}

export function getDocumentFilePath(id: string, fileType: string): string {
  return path.join(DOCUMENTS_DIR, `${id}.${fileType}`);
}

export function deleteDocumentFile(id: string, fileType: string): void {
  const p = getDocumentFilePath(id, fileType);
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
}

// ─────────────────────────────────────────────────────────
// TEXT EXTRACTION (PDF + OCR)
// ─────────────────────────────────────────────────────────

export interface ExtractionResult {
  text: string;
  engine: 'pdf-parse' | 'tesseract' | 'manual';
  confidence: number | null;
}

export async function extractTextFromPdf(filePath: string): Promise<ExtractionResult> {
  // pdf-parse reads PDF text layer (works for digitally-signed PDFs)
  try {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    const text = (data.text || '').trim();
    if (text.length > 50) {
      return { text, engine: 'pdf-parse', confidence: 0.95 };
    }
    // PDF has no text layer → needs OCR on rendered pages
    // For now, fallback to a note that OCR is needed (raster PDF)
    return {
      text: `[PDF bez warstwy tekstowej — wymaga OCR. Plik: ${path.basename(filePath)}]`,
      engine: 'pdf-parse',
      confidence: 0.0,
    };
  } catch (e) {
    return {
      text: `[Błąd ekstrakcji PDF: ${e instanceof Error ? e.message : 'unknown'}]`,
      engine: 'pdf-parse',
      confidence: 0.0,
    };
  }
}

export async function extractTextFromImage(filePath: string): Promise<ExtractionResult> {
  // Tesseract.js — pure JS OCR, no native deps
  // Polish + English language packs
  try {
    const Tesseract = await import('tesseract.js');
    const worker = await Tesseract.createWorker(['pol', 'eng']);
    const { data } = await worker.recognize(filePath);
    await worker.terminate();
    return {
      text: (data.text || '').trim(),
      engine: 'tesseract',
      confidence: data.confidence ? data.confidence / 100 : 0.7,
    };
  } catch (e) {
    return {
      text: `[Błąd OCR: ${e instanceof Error ? e.message : 'unknown'}]`,
      engine: 'tesseract',
      confidence: 0.0,
    };
  }
}

export async function extractText(filePath: string, fileType: string): Promise<ExtractionResult> {
  if (fileType === 'pdf') {
    return extractTextFromPdf(filePath);
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'tiff', 'bmp'].includes(fileType)) {
    return extractTextFromImage(filePath);
  }
  // For .txt/.md/.doc (we don't parse .doc without mammoth — fallback)
  if (fileType === 'txt' || fileType === 'md') {
    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      return { text, engine: 'manual', confidence: 1.0 };
    } catch (e) {
      return { text: '', engine: 'manual', confidence: 0.0 };
    }
  }
  return { text: `[Nieobsługiwany typ pliku: ${fileType}]`, engine: 'manual', confidence: 0.0 };
}

// ─────────────────────────────────────────────────────────
// LEGAL ANALYSIS (via LLM)
// ─────────────────────────────────────────────────────────

const LEGAL_ANALYSIS_SYSTEM_PROMPT = `Jesteś prawnikiem-specjalistą analizującym dokumenty prawne w systemie BOKA.
Twoje specjalizacje:
1. PRAWO RODZINNE — małżeństwa, rozwody, alimenty, opieka nad dziećmi, majątek wspólny, umowy majątkowe małżeńskie (intercyzy), podział majątku, przysposobienie.
2. PRAWO BUDOWLANE — pozwolenia na budowę, umowy z wykonawcami, odbiory budynku, gwarancje, rękojmi, Prawo Budowlane, warunki techniczne, participacja w kosztach drogi.
3. PRAWA AUTORSKIE — umowy o przeniesienie autorskich praw majątkowych, licencje, royalty, prawa pokrewne,creative commons, ochrona wizerunku, prawo prasowe, umowy wydawnicze.

ZASADY ANALIZY:
- Analizuj dokument RZETELNIE i OBIEKTYWNIE — wskaż silne i słabe strony.
- Identyfikuj STRONY umowy (kto, jaki adres, jaki KRS/NIP jeśli są).
- Identyfikuj KLUCZOWE DATY (data zawarcia, terminy, daty wypowiedzenia).
- Wypunktuj OBOWIĄZKI każdej strony.
- Znajdź RYZZYKA — klauzule niekorzystne, luki, niedopowiedzenia.
- Wskaż RED FLAGS — klauzule które powinny byćrenegocjowane lub odrzucone.
- Zaproponuj REKOMENDACJE — co poprawić, czego brakuje, co doprecyzować.
- Oceniaj prawdopodobną WYKONALNOŚĆ i EGZEKWOWANIE postanowień.
- Bądź ostrożny — to nie jest porada prawna, tylko analiza wstępna.

ZAWSZE w odpowiedzi używaj formatu JSON zgodnego z podanym schematem. Nie dodawaj komentarzy poza JSON.`;

export async function analyzeDocument(documentId: string): Promise<DocumentAnalysis> {
  const doc = await db.legalDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error('Dokument nie istnieje');
  if (!doc.documentText || doc.documentText.length < 30) {
    throw new Error('Za mało tekstu do analizy — sprawdź ekstrakcję OCR/PDF');
  }

  const text = doc.documentText.slice(0, 12000); // limit context for cheap models

  const userPrompt = `Przeanalizuj ten dokument prawny i zwróć WYŁĄCZNIE JSON (bez markdown, bez komentarzy, bez \`\`\`json) o strukturze:

{
  "summary": "krótkie 2-3 zdania — o czym jest dokument",
  "documentKind": "umowa|akt|pismo|wniosek|oświadczenie|protokół|faktura|regulamin|inny",
  "legalArea": "family|construction|copyright|mixed|admin|other",
  "parties": ["lista stron z identyfikacją"],
  "keyDates": [{"label":"opis","date":"data w formacie ISO lub tekst"}],
  "obligations": [{"party":"strona","obligation":"obowiązek"}],
  "risks": [{"severity":"low|medium|high","description":"opis ryzyka","recommendation":"co zrobić"}],
  "keyClauses": [{"title":"nazwa klauzuli","summary":"o czym","concern":"ewentualne obawy (opcjonalne)"}],
  "recommendations": ["lista rekomendacji dla użytkownika"],
  "redFlags": ["lista klauzul które powinny być odrzucone lub renegocjowane"]
}

DOKUMENT DO ANALIZY:
"""
${text}
"""

Zwróć TYLKO JSON.`;

  const settings = loadSettings();
  const response = await chatCompletion(
    [
      { role: 'system', content: LEGAL_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    {
      ...settings,
      maxTokens: 2000,
      temperature: 0.3, // deterministic analysis
    }
  );

  // Parse JSON (with cleanup for models that wrap in code blocks)
  let cleaned = response.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  let analysis: DocumentAnalysis;
  try {
    analysis = JSON.parse(cleaned);
  } catch (e) {
    // Fallback: store raw text as summary
    analysis = {
      summary: 'Analiza nie powiodła się — model zwrócił nieparsowalny JSON. Surowa odpowiedź w polu summary.',
      documentKind: 'inny',
      legalArea: 'other',
      parties: [],
      keyDates: [],
      obligations: [],
      risks: [],
      keyClauses: [],
      recommendations: [response.slice(0, 500)],
      redFlags: [],
    };
  }

  // Save analysis to DB
  await db.legalDocument.update({
    where: { id: documentId },
    data: {
      analysisJson: JSON.stringify(analysis),
      analyzedAt: new Date(),
      documentKind: analysis.documentKind || doc.documentKind,
      legalArea: analysis.legalArea || doc.legalArea,
    },
  });

  return analysis;
}

// ─────────────────────────────────────────────────────────
// Q&A with document (RAG over single document)
// ─────────────────────────────────────────────────────────

export async function askDocument(documentId: string, question: string): Promise<string> {
  const doc = await db.legalDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error('Dokument nie istnieje');
  if (!doc.documentText) throw new Error('Dokument nie ma tekstu');

  const contextText = doc.documentText.slice(0, 10000);

  const sysPrompt = `Jesteś asystentem prawniczym BOKA. Odpowiadasz na pytania użytkownika na podstawie konkretnego dokumentu prawnego.

ZASADY:
- Odpowiadaj WYŁĄCZNIE na podstawie treści dokumentu poniżej. Jeśli dokument nie zawiera odpowiedzi — powiedz to wprost.
- Cytuj konkretne fragmenty (krótkie cytaty w cudzysłowach).
- Bądź precyzyjny — wskaż klauzulę/paragraf jeśli jest numeracja.
- Jeśli pytanie dotyczy konsekwencji prawnych spoza dokumentu — powiedz że to wymaga porady adwokata.
- Odpowiedź po polsku, max 5-8 zdań.

DOKUMENT: "${doc.title}"
TREŚĆ:
"""
${contextText}
"""`;

  const settings = loadSettings();
  const answer = await chatCompletion(
    [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: question },
    ],
    {
      ...settings,
      maxTokens: 800,
      temperature: 0.4,
    }
  );

  // Save Q&A pair
  await db.documentQA.create({
    data: {
      documentId,
      familyId: doc.familyId,
      question,
      answer,
    },
  });

  return answer;
}

// ─────────────────────────────────────────────────────────
// DOCUMENT GENERATION (from template or scratch)
// ─────────────────────────────────────────────────────────

const GENERATION_SYSTEM_PROMPT = `Jesteś prawnikiem-draftsmanem systemu BOKA. Generujesz dokumenty prawne w języku polskim zgodnie z obowiązującym prawem.

SPECJALIZACJE:
1. PRAWO RODZINNE — umowy majątkowe małżeńskie (intercyzy), umowy o podział majątku, porozumienia o opiece, alimentach, kontaktach z dziećmi, przysposobienia.
2. PRAWO BUDOWLANE — umowy z wykonawcami, umowy o dzieło roboty budowlane, protokoły odbioru, gwarancje, projekty umów o współpracy inwestycyjnej.
3. PRAWA AUTORSKIE — umowy o przeniesienie autorskich praw majątkowych, licencje niewyłączne, umowy wydawnicze, umowy o dzieło z prawami autorskimi, cesje praw.

ZASADY:
- Używaj poprawnej terminologii prawnej (Kodeks cywilny, Kodeks rodzinny i opiekuńczy, Prawo budowlane, Prawo autorskie).
- Pisz formalnym, precyzyjnym językiem prawniczym.
- Struktura: TYTUŁ → STRONY → POSTANOWIENIA OGÓLNE → POSTANOWIENIA SZCZEGÓŁOWE → POSTANOWIENIA KOŃCOWE → PODPISY.
- Numeruj paragrafy (§1, §2, ...).
- Wstaw pola w nawiasach kwadratowych [NAZWA STRONY], [ADRES], [NIP], [DATA] jeśli dane nie zostały podane.
- Uwzględnij klauzule obowiązkowe: właściwość sądu, prawo właściwe, kodyfikacje.
- Dodaj miejsce na datę i podpisy.
- NIE dodawaj komentarzy poza treścią dokumentu.`;

export async function generateDocument(params: {
  templateId?: string;
  legalArea: LegalArea;
  documentKind: string;
  title: string;
  fieldsValues: Record<string, string>;
  customInstructions?: string;
}): Promise<{ id: string; finalText: string }> {
  const { templateId, legalArea, documentKind, title, fieldsValues, customInstructions } = params;

  await ensureFamilySeeded();
  const family = await getFamily();

  let templateBody = '';
  let templateKey: string | null = null;

  if (templateId) {
    const tpl = await db.documentTemplate.findUnique({ where: { id: templateId } });
    if (tpl) {
      templateBody = tpl.templateBody;
      templateKey = tpl.templateKey;
      // Increment usage
      await db.documentTemplate.update({
        where: { id: templateId },
        data: { usageCount: { increment: 1 } },
      });
    }
  }

  // Build the user prompt
  const fieldsList = Object.entries(fieldsValues)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');

  const userPrompt = templateBody
    ? `Wygeneruj dokument na podstawie poniższego szablonu i podanych danych.

TYTUŁ DOKUMENTU: ${title}
OBSZAR PRAWA: ${legalArea}
TYP DOKUMENTU: ${documentKind}

DANE PODANE PRZEZ UŻYTKOWNIKA:
${fieldsList}

${customInstructions ? `DODATKOWE INSTRUKCJE: ${customInstructions}` : ''}

SZABLON:
"""
${templateBody}
"""

Zwróć gotowy dokument z wypełnionymi polami. Zachowaj strukturę szablonu, ale uzupełnij go o dane usera. Jeśli brakuje danych — użyj placeholderów [DO UZUPEŁNIENIA: opis].`
    : `Wygeneruj dokument od zera na podstawie poniższych danych.

TYTUŁ DOKUMENTU: ${title}
OBSZAR PRAWA: ${legalArea}
TYP DOKUMENTU: ${documentKind}

DANE PODANE PRZEZ UŻYTKOWNIKA:
${fieldsList}

${customInstructions ? `DODATKOWE INSTRUKCJE: ${customInstructions}` : ''}

Zwróć kompletny, formalny dokument prawny w języku polskim. Używaj odpowiednich paragrafów, klauzul prawnych, miejsc na podpisy. Jeśli brakuje kluczowych danych — wstaw [DO UZUPEŁNIENIA: opis].`;

  const settings = loadSettings();
  const finalText = await chatCompletion(
    [
      { role: 'system', content: GENERATION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    {
      ...settings,
      maxTokens: 3500,
      temperature: 0.4,
    }
  );

  // Save generated doc
  const gen = await db.generatedDocument.create({
    data: {
      familyId: family.id,
      templateId: templateId || null,
      templateKey,
      title,
      legalArea,
      documentKind,
      finalText: finalText.trim(),
      fieldsValues: JSON.stringify(fieldsValues),
    },
  });

  return { id: gen.id, finalText: finalText.trim() };
}

// ─────────────────────────────────────────────────────────
// LIST / GET / DELETE
// ─────────────────────────────────────────────────────────

export async function listDocuments(familyId: string, includeArchived = false): Promise<DocumentListItem[]> {
  const docs = await db.legalDocument.findMany({
    where: {
      familyId,
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: { createdAt: 'desc' },
  });
  return docs.map(d => ({
    id: d.id,
    title: d.title,
    fileName: d.fileName,
    fileType: d.fileType,
    fileSize: d.fileSize,
    documentKind: d.documentKind,
    legalArea: d.legalArea as LegalArea,
    hasAnalysis: !!d.analysisJson,
    tags: safeParseArray(d.tags),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}

export async function getDocument(id: string) {
  const doc = await db.legalDocument.findUnique({
    where: { id },
    include: { qaHistory: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!doc) return null;
  return {
    ...doc,
    tags: safeParseArray(doc.tags),
    analysis: doc.analysisJson ? safeParseJSON(doc.analysisJson) : null,
  };
}

export async function deleteDocument(id: string): Promise<void> {
  const doc = await db.legalDocument.findUnique({ where: { id } });
  if (!doc) return;
  deleteDocumentFile(id, doc.fileType);
  await db.legalDocument.delete({ where: { id } });
}

// ─────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────

export async function ensureBuiltinTemplates(): Promise<void> {
  const existing = await db.documentTemplate.findMany({ where: { isBuiltIn: true } });
  const existingKeys = new Set(existing.map(t => t.templateKey));

  for (const tpl of BUILT_IN_TEMPLATES) {
    if (!existingKeys.has(tpl.templateKey)) {
      await db.documentTemplate.create({
        data: {
          familyId: null,
          templateKey: tpl.templateKey,
          title: tpl.title,
          description: tpl.description,
          legalArea: tpl.legalArea,
          documentKind: tpl.documentKind,
          templateBody: tpl.templateBody,
          fieldsJson: JSON.stringify(tpl.fields),
          isBuiltIn: true,
        },
      });
    }
  }
}

export async function listTemplates(familyId?: string, legalArea?: LegalArea): Promise<{
  id: string;
  templateKey: string;
  title: string;
  description: string | null;
  legalArea: string;
  documentKind: string;
  fields: TemplateField[];
  isBuiltIn: boolean;
  usageCount: number;
}[]> {
  const where: any = {
    isArchived: false,
    ...(legalArea ? { legalArea } : {}),
    OR: [
      { isBuiltIn: true },
      ...(familyId ? [{ familyId }] : []),
    ],
  };
  const tpls = await db.documentTemplate.findMany({
    where,
    orderBy: [{ isBuiltIn: 'desc' }, { title: 'asc' }],
  });
  return tpls.map(t => ({
    id: t.id,
    templateKey: t.templateKey,
    title: t.title,
    description: t.description,
    legalArea: t.legalArea,
    documentKind: t.documentKind,
    fields: safeParseJSON(t.fieldsJson) || [],
    isBuiltIn: t.isBuiltIn,
    usageCount: t.usageCount,
  }));
}

export async function getTemplate(id: string) {
  const tpl = await db.documentTemplate.findUnique({ where: { id } });
  if (!tpl) return null;
  return {
    ...tpl,
    fields: safeParseJSON(tpl.fieldsJson) || [],
  };
}

export async function listGeneratedDocuments(familyId: string, includeArchived = false) {
  return db.generatedDocument.findMany({
    where: {
      familyId,
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getGeneratedDocument(id: string) {
  return db.generatedDocument.findUnique({ where: { id } });
}

export async function deleteGeneratedDocument(id: string): Promise<void> {
  await db.generatedDocument.delete({ where: { id } });
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function safeParseArray(s: string | null): string[] {
  if (!s) return [];
  try { return JSON.parse(s) || []; } catch { return []; }
}
function safeParseJSON(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

export function detectFileType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'tiff', 'bmp', 'gif'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  if (['txt', 'md'].includes(ext)) return ext;
  return ext;
}

export function isSupportedFileType(fileType: string): boolean {
  return ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'tiff', 'bmp', 'txt', 'md'].includes(fileType);
}

export function getMaxUploadSize(): number {
  return 15 * 1024 * 1024; // 15 MB
}
