import { NextResponse } from 'next/server';
import { deleteApp } from '@/lib/apps-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/apps/delete
 * Body: { id: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id } = body as { id: string };
    if (!id) return NextResponse.json({ ok: false, error: 'Brak id' }, { status: 400 });

    const result = deleteApp(id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
