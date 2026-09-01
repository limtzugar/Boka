import { NextResponse } from 'next/server';
import { createAppFromTemplate, type AppLanguage } from '@/lib/apps-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/apps/create
 * Body: { name: string, language: AppLanguage, description?: string }
 * Tworzy nową apkę z szablonu (z metadata BOKA-APP).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, language, description } = body as { name: string; language: AppLanguage; description?: string };

    if (!name) return NextResponse.json({ ok: false, error: 'Brak nazwy' }, { status: 400 });
    if (!language) return NextResponse.json({ ok: false, error: 'Brak języka' }, { status: 400 });

    const result = createAppFromTemplate(name, language, description);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
