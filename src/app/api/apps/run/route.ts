import { NextResponse } from 'next/server';
import { runApp } from '@/lib/apps-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/apps/run
 * Body: { id: string, args?: string[], timeout?: number }
 * Uruchamia apkę i zwraca PID + logFile.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, args, timeout } = body as { id: string; args?: string[]; timeout?: number };

    if (!id) return NextResponse.json({ ok: false, message: 'None id' }, { status: 400 });

    const result = runApp(id, args || [], { timeout });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
