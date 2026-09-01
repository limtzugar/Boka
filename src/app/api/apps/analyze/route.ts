import { NextResponse } from 'next/server';
import { analyzeAppCode } from '@/lib/apps-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/apps/analyze
 * Body: { id: string, focus?: string }
 * AI analizuje kod apki.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, focus } = body as { id: string; focus?: string };
    if (!id) return NextResponse.json({ ok: false, error: 'Brak id' }, { status: 400 });

    const result = await analyzeAppCode(id, focus);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
