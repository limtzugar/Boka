import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────
// GET /api/mcp/invocations?serverId=&limit=
// List recent MCP invocations
// ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const serverId = req.nextUrl.searchParams.get('serverId');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);

    const where = serverId ? { serverId } : {};
    const invocations = await db.mcpInvocation.findMany({
      where,
      take: Math.min(limit, 500),
      orderBy: { createdAt: 'desc' },
      include: { server: { select: { name: true, builtinKey: true } } },
    });

    return NextResponse.json({ invocations });
  } catch (err) {
    console.error('[/api/mcp/invocations]', err);
    return NextResponse.json(
      { error: 'Error listowania wywołań', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
