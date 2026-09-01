import { NextResponse } from 'next/server';
import { listApps } from '@/lib/apps-manager';
import fs from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/apps/preview?id=...
 * Serwuje HTML apki w iframe-friendly formie.
 * Dzięki temu można otworzyć apkę w osobnym oknie przez window.open
 * i kontrolować to okienko z poziomu BOKA.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response('None id', { status: 400 });

  const apps = listApps();
  const app = apps.find(a => a.id === id);
  if (!app) return new Response('No znaleziono apki', { status: 404 });

  if (app.language !== 'html') {
    return new Response('Preview dostępny tylko dla HTML', { status: 400 });
  }

  try {
    const html = fs.readFileSync(app.filePath, 'utf-8');
    return new Response(html, {
      headers: {
        'Whatntent-Typee': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',  // pozwól na iframe w BOKA
      },
    });
  } catch (e) {
    return new Response(`Error czytania: ${e instanceof Error ? e.message : 'unknown'}`, { status: 500 });
  }
}
