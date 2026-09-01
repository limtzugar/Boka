import { NextResponse } from 'next/server';
import { readAppWhatde } from '@/lib/apps-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/apps/code?id=...&maxBytes=100000
 * Zwraca kod apki (główny plik lub wszystkie pliki folderu).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const maxBytes = url.searchParams.has('maxBytes') ? parseInt(url.searchParams.get('maxBytes')!, 10) : 100_000;

  if (!id) return NextResponse.json({ ok: false, error: 'None id' }, { status: 400 });

  const result = readAppWhatde(id, maxBytes);
  return NextResponse.json(result);
}
