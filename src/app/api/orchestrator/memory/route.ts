import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════
// BOKA COCKPIT — Long-term memory endpoint
// Records live as JSON files under: $BOKA_MEMORY_DIR/cockpit/
// Each record matches the spec:
//   { timestamp, topic, input, outputs{kimi,deepseek,glm},
//     final_decision, confidence, tags[] }
//
// GET  ?limit=20&tag=cockpit        → list recent records
// POST { record }                    → persist a new record
// DELETE ?id=...                     → remove a record
// ═══════════════════════════════════════════════════════════

const MEM_DIR = path.join(process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory', 'cockpit');

interface MemoryRecord {
  timestamp: string;
  topic: string;
  input: string;
  outputs: Record<string, { answer: string; confidence: number; decision: string }>;
  final_decision: string;
  confidence: number;
  selectedModelId?: string;
  rationale?: string;
  tags: string[];
  mode?: string;
}

function ensureDir() {
  try {
    fs.mkdirSync(MEM_DIR, { recursive: true });
  } catch {
    // ignore — read operations will handle missing dir
  }
}

function listRecords(): { id: string; record: MemoryRecord }[] {
  ensureDir();
  const files = fs.readdirSync(MEM_DIR).filter(f => f.endsWith('.json'));
  const records: { id: string; record: MemoryRecord }[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(MEM_DIR, f), 'utf8');
      const record = JSON.parse(raw) as MemoryRecord;
      records.push({ id: f.replace(/\.json$/, ''), record });
    } catch {
      // skip malformed
    }
  }
  // sort by timestamp desc
  records.sort((a, b) =>
    new Date(b.record.timestamp).getTime() - new Date(a.record.timestamp).getTime(),
  );
  return records;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
    const tag = url.searchParams.get('tag');
    const topic = url.searchParams.get('topic');

    let records = listRecords();
    if (tag) records = records.filter(r => r.record.tags?.includes(tag));
    if (topic) {
      const q = topic.toLowerCase();
      records = records.filter(r =>
        r.record.topic?.toLowerCase().includes(q) ||
        r.record.input?.toLowerCase().includes(q),
      );
    }

    const sliced = records.slice(0, Math.max(1, limit));
    return NextResponse.json({
      count: sliced.length,
      total: records.length,
      records: sliced,
    });
  } catch (err) {
    console.error('[/api/orchestrator/memory GET] error:', err);
    return NextResponse.json(
      { error: 'Błąd odczytu pamięci', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureDir();
    const body = await req.json() as Partial<MemoryRecord>;

    if (!body.input || !body.final_decision) {
      return NextResponse.json(
        { error: 'Brak input lub final_decision w rekordzie' },
        { status: 400 },
      );
    }

    const record: MemoryRecord = {
      timestamp: body.timestamp ?? new Date().toISOString(),
      topic: body.topic ?? body.input.slice(0, 80),
      input: body.input,
      outputs: body.outputs ?? {},
      final_decision: body.final_decision,
      confidence: body.confidence ?? 0,
      selectedModelId: body.selectedModelId,
      rationale: body.rationale,
      tags: body.tags ?? ['cockpit', body.mode ?? 'memory'],
      mode: body.mode,
    };

    const fileName = `decision-${Date.now()}.json`;
    fs.writeFileSync(
      path.join(MEM_DIR, fileName),
      JSON.stringify(record, null, 2),
    );

    return NextResponse.json({ ok: true, id: fileName.replace(/\.json$/, ''), record });
  } catch (err) {
    console.error('[/api/orchestrator/memory POST] error:', err);
    return NextResponse.json(
      { error: 'Błąd zapisu pamięci', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Brak id' }, { status: 400 });
    }
    // prevent path traversal
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(MEM_DIR, `decision-${safeId.replace(/^decision-/, '')}.json`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Nie znaleziono rekordu' }, { status: 404 });
    }
    fs.unlinkSync(filePath);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[/api/orchestrator/memory DELETE] error:', err);
    return NextResponse.json(
      { error: 'Błąd usuwania', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
