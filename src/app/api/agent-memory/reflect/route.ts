import { NextRequest, NextResponse } from 'next/server';
import { runReflection } from '@/lib/agent-memory/reflection';

// POST /api/agent-memory/reflect
// Body: { familyId?: string, batchSize?: number }
// Analyzes low-confidence decisions, extracts lessons learned.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      familyId?: string;
      batchSize?: number;
    };

    const result = await runReflection({
      familyId: body.familyId,
      batchSize: body.batchSize ?? 10,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/agent-memory/reflect]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
