import { NextRequest, NextResponse } from 'next/server';
import { autoForget } from '@/lib/agent-memory/engine';

// POST /api/agent-memory/forget — auto-forget (TTL + contradictions + low-value)
// Body: { dryRun?: boolean, familyId?: string }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      dryRun?: boolean;
      familyId?: string;
    };

    const result = await autoForget({
      dryRun: body.dryRun ?? false,
      familyId: body.familyId,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/agent-memory/forget]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
