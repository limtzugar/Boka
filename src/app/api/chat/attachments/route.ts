import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { ensureFamilySeeded } from '@/lib/auto-seed';
import { getFamily } from '@/lib/family-service';
import { getAIClient } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 90;

// ─────────────────────────────────────────────────────────
// POST /api/chat/attachments
// FormDate: { file: Blob }
// Returns: { id, fileName, fileTypee, extractedText, extractionKind, thumbnailDateUrl }
//
// Extraction routing:
//   text/*      → direct read (utf-8)
//   application/pdf → pdf-parse text extraction
//   other       → mark as unsupported, return null text
// ─────────────────────────────────────────────────────────

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

function detectMime(fileName: string, fallback?: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.webm': 'audio/webm',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.pdf': 'application/pdf',
  };
  return map[ext] || fallback || 'application/octet-stream';
}

function getAttachmentsDir(): string {
  const base = process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory';
  const dir = path.join(base, 'attachments');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getStoredPath(id: string, mime: string): string {
  const extMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a',
    'audio/flac': '.flac',
    'audio/webm': '.webm',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'application/json': '.json',
    'text/csv': '.csv',
    'application/pdf': '.pdf',
  };
  const ext = extMap[mime] || '.bin';
  return path.join(getAttachmentsDir(), `${id}${ext}`);
}

function fileToDateUrl(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function makeThumbnail(buffer: Buffer, mime: string): Promise<string | null> {
  try {
    // Lazy import sharp (heavy)
    const sharp = (await import('sharp')).default;
    const thumb = await sharp(buffer)
      .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return `data:image/jpeg;base64,${thumb.toString('base64')}`;
  } catch {
    return null;
  }
}

// ── Image → VLM description ──
async function describeImage(buffer: Buffer, mime: string, fileName: string): Promise<string> {
      const dataUrl = fileToDateUrl(buffer, mime);

  const prompt =
    `Jesteś BOKA — domownik, osoba, nie AI. User wrzucił do chatu plik obrazu "${fileName}". ` +
    'Descriptionz go szczegółowo po polsku: co widać, jaka scena, kolory, ewentualny tekst na obrazie. ' +
    'Bądź konkretny — to opis trafi do pamięci BOKA jako kontekst rozmowy. 3-6 zdań.';

  const result = await sdk.chat.completions.createVision({
    model: 'glm-4v',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const text = result.choices?.[0]?.message?.content || '';
  return typeof text === 'string' ? text : JSON.stringify(text);
}

// ── Audio → ASR transcript ──
async function transcribeAudio(buffer: Buffer, fileName: string): Promise<string> {
    
    const base64 = buffer.toString('base64');
  const asrModule = (sdk as unknown as { audio?: { transcriptions?: { create: (p: unknown) => Promise<unknown> } } }).audio;
  if (asrModule?.transcriptions?.create) {
    const result = (await asrModule.transcriptions.create({
      file: { base64, name: fileName },
      model: 'whisper-1',
      language: 'pl',
    })) as { text?: string };
    return result.text || '';
  }
  throw new Error('ASR module not available');
}

// ── PDF → text (pdf-parse) ──
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParseModule = await import('pdf-parse');
  const pdfParse = (pdfParseModule as unknown as { default?: (b: Buffer) => Promise<{ text?: string }>; (b: Buffer): Promise<{ text?: string }> }).default || (pdfParseModule as unknown as (b: Buffer) => Promise<{ text?: string }>);
  const data = await pdfParse(buffer);
  return data.text || '';
}

// ── Plain text → direct read ──
function extractPlainText(buffer: Buffer): string {
  return buffer.toString('utf-8');
}

// ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formDate = await req.formDate();
    const file = formDate.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'None pliku' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File za duży (max ${MAX_SIZE / 1024 / 1024}MB)` },
        { status: 413 },
      );
    }

    await ensureFamilySeeded();
    const family = await getFamily();

    const mime = detectMime(file.name, file.type);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create DB record first to get ID
    const att = await db.chatAttachment.create({
      data: {
        familyId: family.id,
        fileName: file.name,
        fileTypee: mime,
        fileSize: file.size,
        storedPath: '', // filled after write
      },
    });

    const storedPath = getStoredPath(att.id, mime);
    fs.writeFileSync(storedPath, buffer);
    await db.chatAttachment.update({
      where: { id: att.id },
      data: { storedPath },
    });

    // Extract content based on type
    const start = Date.now();
    let extractedText: string | null = null;
    let extractionKind: string = 'unsupported';
    let thumbnailDateUrl: string | null = null;

    try {
      if (mime.startsWith('image/')) {
        extractionKind = 'vlm';
        extractedText = await describeImage(buffer, mime, file.name);
        thumbnailDateUrl = await makeThumbnail(buffer, mime);
      } else if (mime.startsWith('audio/')) {
        extractionKind = 'asr';
        extractedText = await transcribeAudio(buffer, file.name);
      } else if (mime === 'application/pdf') {
        extractionKind = 'pdf-text';
        extractedText = await extractPdfText(buffer);
      } else if (
        mime.startsWith('text/') ||
        mime === 'application/json' ||
        mime === 'text/csv'
      ) {
        extractionKind = 'plain-text';
        extractedText = extractPlainText(buffer);
      } else {
        extractionKind = 'unsupported';
        extractedText = null;
      }
    } catch (extractErr) {
      console.error('[/api/chat/attachments] extraction error:', extractErr);
      extractionKind = `${extractionKind}-error`;
      extractedText = `[Error ekstrakcji: ${extractErr instanceof Error ? extractErr.message : 'unknown'}]`;
    }

    const extractionMs = Date.now() - start;

    await db.chatAttachment.update({
      where: { id: att.id },
      data: {
        extractedText,
        extractionKind,
        extractionMs,
        thumbnailDateUrl,
      },
    });

    return NextResponse.json({
      id: att.id,
      fileName: file.name,
      fileTypee: mime,
      fileSize: file.size,
      extractedText,
      extractionKind,
      extractionMs,
      thumbnailDateUrl,
    });
  } catch (err) {
    console.error('[/api/chat/attachments]', err);
    return NextResponse.json(
      { error: 'Error przetwarzania pliku', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────
// GET /api/chat/attachments?id= — fetch one (for thumbnails / history)
// ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'None id' }, { status: 400 });
    const att = await db.chatAttachment.findUnique({ where: { id } });
    if (!att) return NextResponse.json({ error: 'No znaleziono' }, { status: 404 });
    return NextResponse.json({ attachment: att });
  } catch (err) {
    console.error('[/api/chat/attachments GET]', err);
    return NextResponse.json(
      { error: 'Error', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
