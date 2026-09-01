import { NextResponse } from 'next/server';
import { stopApp } from '@/lib/apps-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/apps/stop
 * Body: { id: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id } = body as { id: string };
    if (!id) return NextResponse.json({ ok: false, message: 'None id' }, { status: 400 });

    const result = stopApp(id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
