// ═══════════════════════════════════════════════════════════
// BOKA OS — Mem0-Inspired Memory Service
// Algorytm ADD/UPDATE/DELETE/NOOP z LLM-judge.
// ═══════════════════════════════════════════════════════════
//
// Źródło: github.com/mem0ai/mem0 — universal memory layer.
// Adaptacja: działa na lokalnej SQLite + OpenRouter (lub fallback).
//
// Logika:
//   1. Embed nowy content
//   2. vector_search top-K podobnych (z filtrami memberId/familyId)
//   3. LLM-judge: ADD | UPDATE | DELETE | NOOP
//      - ADD: nowa informacja, brak podobnych
//      - UPDATE: zmiana istniejącego faktu (nowa wartość)
//      - DELETE: fakt przestał być prawdziwy (np. preferencja się zmieniła)
//      - NOOP: duplikat lub zbyt niska pewność
//   4. Zapisz MemoryRevision (audyt) + wykonaj akcję na MemoryEntry
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { vectorSearch, upsertEmbedding } from '@/lib/vector-memory';
import { chatCompletion } from '@/lib/ai-providers';

// ── Typy ─────────────────────────────────────

export type Mem0Action = 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP';

export interface Mem0IngestParams {
  familyId: string;
  memberId?: string;
  content: string;
  entryType?: string;       // default 'episodic'
  domain?: string;
  importance?: number;
  emotionTag?: string;
  tags?: string[];
  source?: string;
  sourceId?: string;
  /** Min similarity aby rozważyć UPDATE zamiast ADD (0-1) */
  similarityThreshold?: number; // default 0.75
}

export interface Mem0IngestResult {
  action: Mem0Action;
  memoryId: string;
  matchedMemoryId?: string;
  similarity: number;
  reason: string;
  revisionId: string;
}

// ── LLM-judge prompt ───────────────────────

const JUDGE_PROMPT = `Jesteś systemem zarządzania pamięcią rodzinnego AI (BOKA).
Decydujesz czy nowa informacja ma być: ADD, UPDATE, DELETE czy NOOP.

NOWA INFORMACJA:
"""
{NEW_CONTENT}
"""

ISTNIEJĄCE PAMIĘCI (posortowane wg podobieństwa):
{EXISTING}

Zwróć WYŁĄCZNIE JSON w formacie:
{{
  "action": "ADD|UPDATE|DELETE|NOOP",
  "target_id": "id z ISTNIEJĄCE PAMIĘCI lub null dla ADD",
  "reason": "krótkie wyjaśnienie po polsku",
  "confidence": 0.0-1.0
}}

Reguły:
- ADD: nowa, unikalna informacja, brak podobnych (similarity < 0.5)
- UPDATE: istnieje podobne wspomnienie, ale treść się zmieniła (nowy fakt, poprawka, aktualizacja)
- DELETE: nowa informacja JAWNIE zaprzecza istniejącej (np. "nie lubi już krewetek" vs "lubí krewetki")
- NOOP: duplikat, treść identyczna, lub zbyt niska pewność
- Priorytet: dokładność > koszty. Jeśli niepewny → NOOP.
`;

// ── Główna funkcja ingest ──────────────────

export async function mem0Ingest(params: Mem0IngestParams): Promise<Mem0IngestResult> {
  const {
    familyId,
    memberId,
    content,
    entryType = 'episodic',
    domain,
    importance = 0.5,
    emotionTag,
    tags = [],
    source = 'agent',
    sourceId,
    similarityThreshold = 0.75,
  } = params;

  // Krok 1: wyszukaj podobne wspomnienia (z filtrami izolacji)
  const similar = await vectorSearch(content, {
    familyId,
    memberId: memberId || undefined,
    domain,
    onlyValid: true,
  }, 5);

  // Krok 2: LLM-judge (lub heuristic fallback jeśli brak API)
  let decision: {
    action: Mem0Action;
    target_id: string | null;
    reason: string;
    confidence: number;
  };

  if (similar.length === 0) {
    // Brak podobnych — automatyczny ADD
    decision = {
      action: 'ADD',
      target_id: null,
      reason: 'Brak podobnych wspomnień w bazie',
      confidence: 1.0,
    };
  } else {
    decision = await llmJudge(content, similar);
  }

  // Krok 3: wykonaj akcję
  let memoryId: string;
  let matchedMemoryId: string | undefined;
  let similarity = similar[0]?.score ?? 0;

  switch (decision.action) {
    case 'ADD':
    case 'NOOP': // NOOP też zapisujemy jako niskopriorytetowy MemoryEntry (historia)
      {
        const created = await db.memoryEntry.create({
          data: {
            familyId,
            memberId: memberId || null,
            entryType: decision.action === 'NOOP' ? 'episodic' : entryType,
            domain: domain || null,
            content,
            importance: decision.action === 'NOOP' ? Math.min(importance, 0.3) : importance,
            emotionTag: emotionTag || null,
            tags: JSON.stringify(tags),
            source: decision.action === 'NOOP' ? `${source}:noop` : source,
            sourceId: sourceId || null,
          },
        });
        memoryId = created.id;
        // Wygeneruj embedding dla nowego wpisu
        await upsertEmbedding({
          id: created.id,
          familyId: created.familyId,
          memberId: created.memberId,
          domain: created.domain,
          emotionTag: created.emotionTag,
          entryType: created.entryType,
          content: `${created.title || ''}\n${created.content}`,
        });
        break;
      }

    case 'UPDATE': {
      if (!decision.target_id) {
        // bez target_id nie da się updatować → fallback ADD
        decision.action = 'ADD';
        return mem0Ingest({ ...params, similarityThreshold });
      }
      const existing = await db.memoryEntry.findUnique({ where: { id: decision.target_id } });
      if (!existing) {
        decision.action = 'ADD';
        return mem0Ingest({ ...params, similarityThreshold });
      }
      const previousContent = existing.content;
      // Aktualizuj treść (zachowaj metadata, zwiększ wersję przez updatedAt)
      const updated = await db.memoryEntry.update({
        where: { id: existing.id },
        data: {
          content: `${previousContent}\n\n[UPDATE ${new Date().toISOString()}]: ${content}`,
          importance: Math.max(existing.importance, importance),
          updatedAt: new Date(),
        },
      });
      memoryId = updated.id;
      matchedMemoryId = existing.id;
      similarity = similar.find(s => s.memoryId === existing.id)?.score ?? similarity;
      // Re-embed zaktualizowanego
      await upsertEmbedding({
        id: updated.id,
        familyId: updated.familyId,
        memberId: updated.memberId,
        domain: updated.domain,
        emotionTag: updated.emotionTag,
        entryType: updated.entryType,
        content: `${updated.title || ''}\n${updated.content}`,
      });
      break;
    }

    case 'DELETE': {
      if (!decision.target_id) {
        decision.action = 'NOOP';
        return mem0Ingest({ ...params, similarityThreshold });
      }
      const existing = await db.memoryEntry.findUnique({ where: { id: decision.target_id } });
      if (!existing) {
        decision.action = 'NOOP';
        return mem0Ingest({ ...params, similarityThreshold });
      }
      // Soft-delete: ustaw validUntil
      const updated = await db.memoryEntry.update({
        where: { id: existing.id },
        data: { validUntil: new Date() },
      });
      memoryId = updated.id;
      matchedMemoryId = existing.id;
      similarity = similar.find(s => s.memoryId === existing.id)?.score ?? similarity;
      break;
    }
  }

  // Krok 4: zapisz MemoryRevision (audyt)
  const revision = await db.memoryRevision.create({
    data: {
      memoryId,
      action: decision.action,
      previousContent: matchedMemoryId
        ? (await db.memoryEntry.findUnique({ where: { id: matchedMemoryId } }))?.content
        : null,
      newContent: content,
      reason: decision.reason,
      similarityScore: similarity,
      judgedBy: 'openrouter-mem0',
    },
  });

  return {
    action: decision.action,
    memoryId,
    matchedMemoryId,
    similarity,
    reason: decision.reason,
    revisionId: revision.id,
  };
}

// ── LLM-judge (lub heuristic fallback) ──────

async function llmJudge(
  newContent: string,
  similar: Array<{ memoryId: string; score: number; memory: any }>
): Promise<{
  action: Mem0Action;
  target_id: string | null;
  reason: string;
  confidence: number;
}> {
  const existingStr = similar
    .map((s, i) => `[${i + 1}] id=${s.memoryId} (sim=${s.score.toFixed(2)}):\n${s.memory.content?.slice(0, 300)}`)
    .join('\n\n');

  const prompt = JUDGE_PROMPT
    .replace('{NEW_CONTENT}', newContent.slice(0, 1000))
    .replace('{EXISTING}', existingStr.slice(0, 3000));

  try {
    const text = await chatCompletion([
      { role: 'system', content: 'Jesteś precyzyjnym systemem zarządzania pamięcią. Zwracasz WYŁĄCZNIE JSON bez markdown.' },
      { role: 'user', content: prompt },
    ]);
    // Wyciągnij JSON z odpowiedzi
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (['ADD', 'UPDATE', 'DELETE', 'NOOP'].includes(parsed.action)) {
        return {
          action: parsed.action,
          target_id: parsed.target_id || null,
          reason: parsed.reason || 'brak',
          confidence: parsed.confidence ?? 0.5,
        };
      }
    }
  } catch (e) {
    // fallback poniżej
  }

  // Heuristic fallback (gdy LLM niedostępny)
  return heuristicJudge(newContent, similar);
}

function heuristicJudge(
  newContent: string,
  similar: Array<{ memoryId: string; score: number; memory: any }>
): { action: Mem0Action; target_id: string | null; reason: string; confidence: number } {
  const top = similar[0];
  if (!top) {
    return { action: 'ADD', target_id: null, reason: 'Brak podobnych (heuristic)', confidence: 0.7 };
  }
  if (top.score >= 0.92) {
    return {
      action: 'NOOP',
      target_id: top.memoryId,
      reason: `Bardzo wysoka similitude (${top.score.toFixed(2)}) — prawdopodobnie duplikat`,
      confidence: 0.6,
    };
  }
  if (top.score >= 0.75) {
    // Czy nowa treść zaprzecza starej?
    const negationPatterns = ['nie ', 'już nie', 'przestał', 'zmienił', 'anulował', 'wycofał'];
    const hasNegation = negationPatterns.some(p => newContent.toLowerCase().includes(p));
    if (hasNegation) {
      return {
        action: 'DELETE',
        target_id: top.memoryId,
        reason: `Wysoka similitude + negacja — prawdopodobnie fakt się zmienił`,
        confidence: 0.55,
      };
    }
    return {
      action: 'UPDATE',
      target_id: top.memoryId,
      reason: `Wysoka similitude (${top.score.toFixed(2)}) bez negacji — aktualizacja istniejącego`,
      confidence: 0.55,
    };
  }
  return { action: 'ADD', target_id: null, reason: 'Niska similitude — nowa informacja', confidence: 0.65 };
}

// ── Bulk ingest (dla ingestion pipeline) ────

export async function mem0BulkIngest(
  items: Mem0IngestParams[]
): Promise<Mem0IngestResult[]> {
  const results: Mem0IngestResult[] = [];
  for (const item of items) {
    try {
      results.push(await mem0Ingest(item));
    } catch (e: any) {
      results.push({
        action: 'NOOP',
        memoryId: 'error',
        similarity: 0,
        reason: `Error: ${e.message}`,
        revisionId: 'error',
      });
    }
  }
  return results;
}
