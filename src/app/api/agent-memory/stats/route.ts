import { NextRequest, NextResponse } from 'next/server';
import { getStats } from '@/lib/agent-memory/engine';

// GET /api/agent-memory/stats — statystyki pamięci

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const familyId = url.searchParams.get('familyId') ?? undefined;
    const stats = await getStats(familyId);
    return NextResponse.json(stats);
  } catch (err) {
    console.error('[/api/agent-memory/stats]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
