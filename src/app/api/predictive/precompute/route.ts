import { NextRequest, NextResponse } from 'next/server';
import { precomputeAnswers } from '@/lib/agent-memory/predictive';

// POST /api/predictive/precompute
// Body: { familyId?: string, sessionId?: string, topK?: number }
// Pre-computes answers for predicted next questions.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      familyId?: string;
      sessionId?: string;
      topK?: number;
    };

    const result = await precomputeAnswers({
      familyId: body.familyId,
      sessionId: body.sessionId,
      topK: body.topK ?? 3,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/predictive/precompute]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
