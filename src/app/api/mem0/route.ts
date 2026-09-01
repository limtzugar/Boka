import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import { mem0Ingest, mem0BulkIngest } from '@/lib/mem0-service';
import { db } from '@/lib/db';

// POST /api/mem0 — ingest new memory with ADD/UPDATE/DELETE/NOOP logic
// GET /api/mem0/revisions — list recent revisions (audit log)

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const data = await req.json();

    if (Array.isArray(data)) {
      // Bulk ingest
      const items = data.map((d: any) => ({ ...d, familyId: family.id }));
      const results = await mem0BulkIngest(items);
      return NextResponse.json({ results });
    }

    const result = await mem0Ingest({
      familyId: family.id,
      memberId: data.memberId,
      content: data.content,
      entryType: data.entryType,
      domain: data.domain,
      importance: data.importance,
      emotionTag: data.emotionTag,
      tags: data.tags,
      source: data.source || 'manual',
      sourceId: data.sourceId,
      similarityThreshold: data.similarityThreshold,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const action = req.nextUrl.searchParams.get('action');

    const revisions = await db.memoryRevision.findMany({
      where: action ? { action } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ revisions });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
