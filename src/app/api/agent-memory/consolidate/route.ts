import { NextRequest, NextResponse } from 'next/server';
import { consolidate } from '@/lib/agent-memory/engine';

// POST /api/agent-memory/consolidate — decay + (optional) LLM extraction
// Body: { decayDays?: number, familyId?: string, withLLM?: boolean, batchSize?: number }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      decayDays?: number;
      familyId?: string;
      withLLM?: boolean;
      batchSize?: number;
    };

    const result = await consolidate({
      decayDays: body.decayDays,
      familyId: body.familyId,
      withLLM: body.withLLM ?? false,
      batchSize: body.batchSize,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/agent-memory/consolidate]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
