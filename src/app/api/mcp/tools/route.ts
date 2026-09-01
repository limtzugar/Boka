import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { listToolsForServer, ensureBuiltinMcpServers } from '@/lib/mcp-service';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────
// GET /api/mcp/tools?serverId= — list tools for a server
// GET /api/mcp/tools — list ALL tools across all active servers
// ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    await ensureBuiltinMcpServers();
    const serverId = req.nextUrl.searchParams.get('serverId');

    if (serverId) {
      const server = await db.mcpServer.findUnique({ where: { id: serverId } });
      if (!server) return NextResponse.json({ error: 'Serwer nie znaleziony' }, { status: 404 });
      const tools = await listToolsForServer({
        serverType: server.serverType,
        builtinKey: server.builtinKey,
      });
      return NextResponse.json({ server, tools });
    }

    // All tools
    const servers = await db.mcpServer.findMany({ where: { isActive: true } });
    const all: Array<{
      serverId: string;
      serverName: string;
      builtinKey: string | null;
      toolName: string;
      description: string;
      inputSchema: unknown;
    }> = [];

    for (const s of servers) {
      const tools = await listToolsForServer({
        serverType: s.serverType,
        builtinKey: s.builtinKey,
      });
      for (const t of tools) {
        all.push({
          serverId: s.id,
          serverName: s.name,
          builtinKey: s.builtinKey,
          toolName: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        });
      }
    }

    return NextResponse.json({ tools: all, count: all.length });
  } catch (err) {
    console.error('[/api/mcp/tools GET]', err);
    return NextResponse.json(
      { error: 'Błąd listowania tools', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
