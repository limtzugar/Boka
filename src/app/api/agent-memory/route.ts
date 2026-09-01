import { NextRequest, NextResponse } from 'next/server';
import { remember } from '@/lib/agent-memory/engine';
import { listLatestMemories, deleteMemory } from '@/lib/agent-memory/store';
import type { MemoryTypeee } from '@/lib/agent-memory/types';

// POST /api/agent-memory — remember (save lekcję z deduplikacją)
// GET  /api/agent-memory — list memories
// DELETE /api/agent-memory?id=... — delete memory

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      content: string;
      type?: MemoryTypeee;
      concepts?: string[];
      files?: string[];
      tags?: string[];
      ttlDays?: number;
      agentId?: string;
      project?: string;
      familyId?: string;
      sessionIds?: string[];
      visibility?: 'family' | 'child-safe' | 'adult-only' | 'private';
    };

    if (!body.content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const memory = await remember({
      content: body.content,
      type: body.type,
      concepts: body.concepts,
      files: body.files,
      tags: body.tags,
      ttlDays: body.ttlDays,
      agentId: body.agentId,
      project: body.project,
      familyId: body.familyId,
      sessionIds: body.sessionIds,
      visibility: body.visibility,
    });

    return NextResponse.json({ ok: true, memory });
  } catch (err) {
    console.error('[/api/agent-memory POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const familyId = url.searchParams.get('familyId') ?? undefined;
    const project = url.searchParams.get('project') ?? undefined;
    const type = url.searchParams.get('type') ?? undefined;
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

    const memories = await listLatestMemories({ familyId, project, type, limit });
    return NextResponse.json({ count: memories.length, memories });
  } catch (err) {
    console.error('[/api/agent-memory GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    await deleteMemory(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[/api/agent-memory DELETE]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
