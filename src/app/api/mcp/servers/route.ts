import { NextRequest, NextResponse } from 'next/server';
import {
  listMcpServers,
  createMcpServer,
  deleteMcpServer,
  updateMcpServer,
  ensureBuiltinMcpServers,
  type McpServerConfig,
} from '@/lib/mcp-service';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────
// GET /api/mcp/servers — list MCP servers (+ auto-seed built-ins)
// ─────────────────────────────────────────────────────────
export async function GET() {
  try {
    await ensureBuiltinMcpServers();
    const servers = await listMcpServers();
    return NextResponse.json({ servers });
  } catch (err) {
    console.error('[/api/mcp/servers GET]', err);
    return NextResponse.json(
      { error: 'Błąd listowania serwerów', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────
// POST /api/mcp/servers — create new MCP server
// Body: McpServerConfig
// ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config: McpServerConfig = {
      name: body.name,
      description: body.description,
      serverType: body.serverType,
      command: body.command,
      args: body.args,
      env: body.env,
      url: body.url,
      headers: body.headers,
      builtinKey: body.builtinKey,
      isActive: body.isActive ?? true,
    };

    if (!config.name || !config.serverType) {
      return NextResponse.json({ error: 'Brak name lub serverType' }, { status: 400 });
    }

    const server = await createMcpServer(config);
    return NextResponse.json({ server });
  } catch (err) {
    console.error('[/api/mcp/servers POST]', err);
    return NextResponse.json(
      { error: 'Błąd tworzenia serwera', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────
// PATCH /api/mcp/servers?id= — update server
// ─────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Brak id' }, { status: 400 });
    const patch = await req.json();
    const server = await updateMcpServer(id, patch);
    return NextResponse.json({ server });
  } catch (err) {
    console.error('[/api/mcp/servers PATCH]', err);
    return NextResponse.json(
      { error: 'Błąd aktualizacji', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────
// DELETE /api/mcp/servers?id= — delete server
// ─────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Brak id' }, { status: 400 });
    await deleteMcpServer(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[/api/mcp/servers DELETE]', err);
    return NextResponse.json(
      { error: 'Błąd usuwania', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
