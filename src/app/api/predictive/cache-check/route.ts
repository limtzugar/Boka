import { NextRequest, NextResponse } from 'next/server';
import { checkPredictiveCache } from '@/lib/agent-memory/predictive';

// POST /api/predictive/cache-check
// Body: { query: string, familyId?: string }
// Returns cached pre-computed answer if Jaccard similarity > 0.4.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      query: string;
      familyId?: string;
    };

    if (!body.query?.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const cached = await checkPredictiveCache(body.query, body.familyId);

    return NextResponse.json({
      cacheHit: cached !== null,
      cached,
    });
  } catch (err) {
    console.error('[/api/predictive/cache-check]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
