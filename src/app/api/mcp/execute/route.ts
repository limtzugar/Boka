import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { invokeTool } from '@/lib/mcp-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────
// POST /api/mcp/execute
// Body: { serverId, toolName, arguments, triggeredBy? }
// ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { serverId, toolName, arguments: args, triggeredBy } = body;

    if (!serverId || !toolName) {
      return NextResponse.json({ error: 'Brak serverId lub toolName' }, { status: 400 });
    }

    const server = await db.mcpServer.findUnique({ where: { id: serverId } });
    if (!server) {
      return NextResponse.json({ error: 'Serwer nie znaleziony' }, { status: 404 });
    }
    if (!server.isActive) {
      return NextResponse.json({ error: 'Serwer nieaktywny' }, { status: 400 });
    }

    const result = await invokeTool(
      {
        id: server.id,
        serverType: server.serverType,
        builtinKey: server.builtinKey,
        familyId: server.familyId,
      },
      toolName,
      args || {},
      triggeredBy || 'user',
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/mcp/execute]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
