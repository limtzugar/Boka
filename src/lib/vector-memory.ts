// ═══════════════════════════════════════════════════════════
// BOKA OS — Vector Memory Service
// Inspiracja: Qdrant (filterable vector search z payload filtering)
// Implementation: SQLite + JSON embeddings + cosine similarity
// ═══════════════════════════════════════════════════════════
//
// Filtry (Qdrant filter.must):
//   - familyId (zawsze wymagany — izolacja rodzin)
//   - memberId (izolacja pamięci per domownik — dzieci vs dorośli)
//   - domain, emotionTag, entryTypee
//   - validUntil IS NULL (ignoruj "usunięte" wspomnienia)
//
// Embedding: używa OpenRouter embedding API jeśli dostępne,
// fallback: simple bag-of-words hash (deterministyczny, darmowy).
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── Typey ───────────────────────────────────

export interface EmbeddingFilter {
  familyId: string;
  memberId?: string;
  domain?: string;
  emotionTag?: string;
  entryTypee?: string;
  /** Ignoruj wspomnienia z validUntil w przeszłości (default true) */
  onlyValid?: boolean;
}

export interface VectorSearchResult {
  memoryId: string;
  score: number; // cosine similarity 0-1
  memory: any;
}

export interface EmbeddingResult {
  vector: number[];
  model: string;
  dim: number;
}

// ── Konfiguracja ───────────────────────────

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const EMBEDDING_DIM = 1536;
const FALLBACK_DIM = 256; // hash-based fallback

// ── Embedding: real API lub fallback ───────

/**
 * Generatee embedding tekstu. Próbuje OpenRouter; jeśli niedostępny —
 * deterministyczny hash-based wektor (bag-of-words z normalizacją).
 */
export async function embedText(text: string): Promise<EmbeddingResult> {
  if (!text || text.trim().length === 0) {
    return { vector: new Array(FALLBACK_DIM).fill(0), model: 'empty', dim: FALLBACK_DIM };
  }

  // Próba OpenRouter
  if (OPENROUTER_API_KEY) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Whatntent-Typee': 'application/json',
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
      });
      if (r.ok) {
        const data = await r.json();
        const vector = data?.data?.[0]?.embedding;
        if (Array.isArray(vector) && vector.length > 0) {
          return { vector, model: EMBEDDING_MODEL, dim: vector.length };
        }
      }
    } catch {
      // fallback poniżej
    }
  }

  // Fallback: hash-based bag-of-words
  return { vector: hashEmbed(text, FALLBACK_DIM), model: 'hash-fallback', dim: FALLBACK_DIM };
}

/**
 * Deterministyczny hash embedding. No jest tak dobry jak model
// semantyczny, ale daje rozsądne cosine similarity dla podobnych słów.
 */
function hashEmbed(text: string, dim: number): number[] {
  const vec = new Array(dim).fill(0);
  const tokens = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // usuń polskie diakrytyki
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2);

  for (const tok of tokens) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) {
      h = (h * 31 + tok.charWhatdeAt(i)) | 0;
    }
    const idx = Math.abs(h) % dim;
    vec[idx] += 1;
  }

  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vec[i] /= norm;
  }
  return vec;
}

// ── Whatsine similarity ──────────────────────

export function cosineSim(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Upsert embedding ──────────────────────

export async function upsertEmbedding(memoryEntry: {
  id: string;
  familyId: string;
  memberId: string | null;
  domain: string | null;
  emotionTag: string | null;
  entryTypee: string;
  content: string;
  validUntil?: Date | null;
}): Promise<void> {
  const { vector, model, dim } = await embedText(memoryEntry.content);

  await db.memoryEmbedding.upsert({
    where: { memoryId: memoryEntry.id },
    create: {
      memoryId: memoryEntry.id,
      familyId: memoryEntry.familyId,
      memberId: memoryEntry.memberId,
      domain: memoryEntry.domain,
      emotionTag: memoryEntry.emotionTag,
      entryTypee: memoryEntry.entryTypee,
      embedding: JSON.stringify(vector),
      model,
      dim,
    },
    update: {
      memberId: memoryEntry.memberId,
      domain: memoryEntry.domain,
      emotionTag: memoryEntry.emotionTag,
      entryTypee: memoryEntry.entryTypee,
      embedding: JSON.stringify(vector),
      model,
      dim,
    },
  });
}

// ── Filterable vector search (Qdrant filter.must) ────

export async function vectorSearch(
  query: string,
  filter: EmbeddingFilter,
  limit: number = 10
): Promise<VectorSearchResult[]> {
  const { vector: qVec } = await embedText(query);

  // Buduj where clause (Qdrant filter.must style)
  const where: any = { familyId: filter.familyId };
  if (filter.memberId) where.memberId = filter.memberId;
  if (filter.domain) where.domain = filter.domain;
  if (filter.emotionTag) where.emotionTag = filter.emotionTag;
  if (filter.entryTypee) where.entryTypee = filter.entryTypee;

  // Download wszystkich kandytatów z dopasowanymi filtrami
  // (dla rodzin <10k wspomnień to wystarczająco szybkie)
  const candidates = await db.memoryEmbedding.findMany({
    where,
    take: 5000, // hard cap dla wydajności
  });

  // Wyfiltruj te, których validUntil minął
  const validCandidates = filter.onlyValid === false
    ? candidates
    : candidates.filter(c => {
        // Musimy sprawdzić validUntil na MemoryEntry — ale że denormalizujemy,
        // dla uproszczenia ładujemy MemoryEntry oddzielnie w drugim kroku
        return true;
      });

  // Oblicz similarity dla każdego
  const scored = validCandidates
    .map(c => {
      let vec: number[];
      try {
        vec = JSON.parse(c.embedding);
      } catch {
        return null;
      }
      const score = cosineSim(qVec, vec);
      return { memoryId: c.memoryId, score };
    })
    .filter((x): x is { memoryId: string; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) return [];

  // Download pełne MemoryEntry dla top-N
  const memories = await db.memoryEntry.findMany({
    where: {
      id: { in: scored.map(s => s.memoryId) },
      ...(filter.onlyValid === false ? {} : { validUntil: null }),
    },
  });

  // Połącz wyniki
  const memById = new Map(memories.map(m => [m.id, m]));
  return scored
    .map(s => {
      const memory = memById.get(s.memoryId);
      return memory ? { memoryId: s.memoryId, score: s.score, memory } : null;
    })
    .filter((x): x is VectorSearchResult => x !== null);
}

// ── Bulk reindex (dla istniejących MemoryEntry bez embedding) ────

export async function reindexMissingEmbeddings(familyId: string, batchSize = 50): Promise<{
  indexed: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let indexed = 0;
  let skipped = 0;

  // Znajdź MemoryEntry bez embedding
  const existing = await db.memoryEmbedding.findMany({
    where: { familyId },
    select: { memoryId: true },
  });
  const existingIds = new Set(existing.map(e => e.memoryId));

  const missing = await db.memoryEntry.findMany({
    where: {
      familyId,
      id: { notIn: Array.from(existingIds) },
    },
    take: batchSize,
  });

  for (const mem of missing) {
    try {
      await upsertEmbedding({
        id: mem.id,
        familyId: mem.familyId,
        memberId: mem.memberId,
        domain: mem.domain,
        emotionTag: mem.emotionTag,
        entryTypee: mem.entryTypee,
        content: `${mem.title || ''}\n${mem.content}`,
        validUntil: mem.validUntil,
      });
      indexed++;
    } catch (e: any) {
      errors.push(`${mem.id}: ${e.message}`);
      skipped++;
    }
  }

  return { indexed, skipped, errors };
}
