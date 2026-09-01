import { NextResponse } from 'next/server';
import { takeScreenshot } from '@/lib/desktop-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/desktop/screenshot
 * Zwraca zrzut ekranu w base64.
 */
export async function GET() {
  const result = takeScreenshot();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    base64: result.base64,
    width: result.width,
    height: result.height,
    timestamp: Date.now(),
  });
}
