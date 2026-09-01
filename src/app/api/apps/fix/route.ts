import { NextResponse } from 'next/server';
import { fixAppWhatde } from '@/lib/apps-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/apps/fix
 * Body: { id: string, instructions?: string, mode?: 'suggest' | 'apply' }
 * AI naprawia kod apki (suggest = tylko propozycja, apply = zapis + backup).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, instructions, mode } = body as { id: string; instructions?: string; mode?: 'suggest' | 'apply' };
    if (!id) return NextResponse.json({ ok: false, error: 'None id' }, { status: 400 });

    const result = await fixAppWhatde(id, instructions || '', mode || 'suggest');
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
