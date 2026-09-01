// ═══════════════════════════════════════════════════════════
// BOKA OS — LlamaIndex-inspired Ingestion Pipeline
// ═══════════════════════════════════════════════════════════
//
// Pipeline stages (jak LlamaIndex IngestionPipeline):
//   1. LOADING    — pobierz treść (URL/file/text)
//   2. PARSING    — wyciągnij tekst z HTML/PDF/bin
//   3. CHUNKING   — podziel na semantyczne chunki
//   4. EXTRACTING — LLM wyciąga fakty (entity/relation/memory)
//   5. EMBEDDING  — embed każdy chunk
//   6. STORING    — zapisz do MemoryEntry + Entity + MemoryEmbedding
//
// Każdy stage loguje postęp w IngestionJob.stageProgress.
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── Typy ───────────────────────────────────

export type IngestionSourceType = 'file' | 'url' | 'text' | 'image' | 'audio' | 'pdf';

export interface IngestRequest {
  familyId: string;
  memberId?: string;
  sourceType: IngestionSourceType;
  sourceUri: string;       // URL, path, lub raw text
  sourceName?: string;     // oryginalna nazwa pliku
  metadata?: Record<string, any>;
}

export interface IngestResult {
  jobId: string;
  status: 'done' | 'error';
  chunksCreated: number;
  memoriesCreated: number;
  entitiesCreated: number;
  errorMessage?: string;
}

// ── Stage progress helper ─────────────────

type StageName = 'loading' | 'parsing' | 'chunking' | 'extracting' | 'embedding' | 'storing';
type StageState = 'pending' | 'in_progress' | 'done' | 'error';

async function setStage(jobId: string, stage: StageName, state: StageState, error?: string) {
  const job = await db.ingestionJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const progress = JSON.parse(job.stageProgress || '{}');
  progress[stage] = state;
  await db.ingestionJob.update({
    where: { id: jobId },
    data: {
      stageProgress: JSON.stringify(progress),
      ...(error ? { errorMessage: `${stage}: ${error}` } : {}),
    },
  });
}

// ── Stage implementations ─────────────────

/** LOADING: pobierz treść z source */
async function loadContent(req: IngestRequest): Promise<string> {
  switch (req.sourceType) {
    case 'text':
      return req.sourceUri; // raw content
    case 'url': {
      const r = await fetch(req.sourceUri, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }
    case 'file':
    case 'pdf':
    case 'image':
    case 'audio':
      // Dla MVP: traktujemy sourceUri jako treść tekstową (ścieżka do pliku jako placeholder)
      // Real file handling wymagałoby multer/upload — zostawiamy jako TODO
      return `[${req.sourceType}:${req.sourceName || req.sourceUri}]`;
  }
}

/** PARSING: wyciągnij czysty tekst (HTML → text, etc.) */
function parseContent(raw: string, sourceType: IngestionSourceType): string {
  if (sourceType === 'url' && raw.includes('<')) {
    // Strip HTML tags
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return raw;
}

/** CHUNKING: podziel na fragmenty ~500 znaków z overlap 100 */
function chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    const chunk = text.slice(i, i + chunkSize).trim();
    if (chunk.length > 50) chunks.push(chunk);
    if (i + chunkSize >= text.length) break;
  }
  return chunks;
}

/** EXTRACTING: LLM wyciąga fakty z chunka */
async function extractFacts(chunk: string, familyId: string, memberId?: string): Promise<{
  memories: Array<{ content: string; entryType: string; importance: number; tags: string[] }>;
  entities: EntityCandidate[];
}> {
  // Heuristic: każdy chunk → 1 MemoryEntry (episodic)
  const entities = await extractEntities(chunk, familyId, memberId);

  return {
    memories: [
      {
        content: chunk,
        entryType: 'episodic',
        importance: 0.4,
        tags: entities.map(e => e.name).slice(0, 5),
      },
    ],
    entities,
  };
}

// ── Main pipeline runner ──────────────────

export async function runIngestion(req: IngestRequest): Promise<IngestResult> {
  // Utwórz job
  const job = await db.ingestionJob.create({
    data: {
      familyId: req.familyId,
      memberId: req.memberId || null,
      sourceType: req.sourceType,
      sourceUri: req.sourceUri,
      sourceName: req.sourceName || null,
      metadata: JSON.stringify(req.metadata || {}),
      status: 'loading',
      startedAt: new Date(),
    },
  });

  try {
    // LOADING
    await setStage(job.id, 'loading', 'in_progress');
    const raw = await loadContent(req);
    await setStage(job.id, 'loading', 'done');

    // PARSING
    await setStage(job.id, 'parsing', 'in_progress');
    const text = parseContent(raw, req.sourceType);
    await db.ingestionJob.update({
      where: { id: job.id },
      data: { status: 'parsing', metadata: JSON.stringify({ ...req.metadata, contentLength: text.length }) },
    });
    await setStage(job.id, 'parsing', 'done');

    // CHUNKING
    await setStage(job.id, 'chunking', 'in_progress');
    const chunks = chunkText(text);
    await db.ingestionJob.update({
      where: { id: job.id },
      data: { status: 'chunking', chunksCreated: chunks.length },
    });
    await setStage(job.id, 'chunking', 'done');

    // EXTRACTING + EMBEDDING + STORING (per chunk)
    await setStage(job.id, 'extracting', 'in_progress');
    let memoriesCreated = 0;
    const allEntities: EntityCandidate[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const { memories, entities } = await extractFacts(chunk, req.familyId, req.memberId);
        allEntities.push(...entities);

        for (const mem of memories) {
          const result = await mem0Ingest({
            familyId: req.familyId,
            memberId: req.memberId,
            content: mem.content,
            entryType: mem.entryType,
            importance: mem.importance,
            tags: mem.tags,
            source: 'ingestion',
            sourceId: job.id,
          });
          if (result.action !== 'NOOP') memoriesCreated++;
        }
      } catch (e: any) {
        console.error(`[ingest] chunk ${i} error:`, e.message);
      }
    }
    await setStage(job.id, 'extracting', 'done');

    await setStage(job.id, 'embedding', 'done'); // embedding done inside mem0Ingest
    await setStage(job.id, 'storing', 'done');

    // Finalizacja
    await db.ingestionJob.update({
      where: { id: job.id },
      data: {
        status: 'done',
        memoriesCreated,
        entitiesCreated: allEntities.length,
        finishedAt: new Date(),
      },
    });

    return {
      jobId: job.id,
      status: 'done',
      chunksCreated: chunks.length,
      memoriesCreated,
      entitiesCreated: allEntities.length,
    };
  } catch (e: any) {
    await db.ingestionJob.update({
      where: { id: job.id },
      data: { status: 'error', errorMessage: e.message, finishedAt: new Date() },
    });
    return {
      jobId: job.id,
      status: 'error',
      chunksCreated: 0,
      memoriesCreated: 0,
      entitiesCreated: 0,
      errorMessage: e.message,
    };
  }
}

// ── Status / list helpers ─────────────────

export async function getIngestionJob(jobId: string) {
  return db.ingestionJob.findUnique({ where: { id: jobId } });
}

export async function listIngestionJobs(familyId: string, limit = 20) {
  return db.ingestionJob.findMany({
    where: { familyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
