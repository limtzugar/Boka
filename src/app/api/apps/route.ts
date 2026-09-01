import { NextResponse } from 'next/server';
import { listApps, listRunningApps, ensureAppsDir, getAppsDir } from '@/lib/apps-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/apps
 * Zwraca listę wszystkich apek w folderze + info o uruchomionych.
 */
export async function GET() {
  const dirInfo = ensureAppsDir();
  const apps = listApps();
  const running = listRunningApps();

  return NextResponse.json({
    ok: true,
    appsDir: getAppsDir(),
    dirExists: dirInfo.exists,
    apps: apps.map(a => ({
      ...a,
      isRunning: running.some(r => r.appId === a.id),
    })),
    running,
    count: apps.length,
  });
}
