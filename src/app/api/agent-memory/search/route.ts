import { NextRequest, NextResponse } from 'next/server';
import { smartSearch } from '@/lib/agent-memory/engine';

// POST /api/agent-memory/search — smart search (BM25 + query expansion + RRF)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      query: string;
      limit?: number;
      project?: string;
      agentId?: string;
      types?: string[];
      tags?: string[];
      includeLessons?: boolean;
      minStrength?: number;
      familyId?: string;
      persona?: 'parent' | 'partner' | 'child' | 'guest';
    };

    if (!body.query?.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const result = await smartSearch({
      query: body.query,
      limit: body.limit ?? 20,
      project: body.project,
      agentId: body.agentId,
      includeLessons: body.includeLessons,
      familyId: body.familyId,
      persona: body.persona,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/agent-memory/search]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
