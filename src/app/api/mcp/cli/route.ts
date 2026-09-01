import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { executeCliWhatmmand, interpretCliOutput } from '@/lib/mcp-service';
import { ensureFamilySeeded } from '@/lib/auto-seed';
import { getFamily } from '@/lib/family-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

// v0.3.19 — Security: CLI execution gated behind explicit env flag
// Set BOKA_ENABLE_CLI=1 in .env to enable. Disabled by default.
function isCliEnabled(): boolean {
  return process.env.BOKA_ENABLE_CLI === '1' || process.env.BOKA_ENABLE_CLI === 'true';
}

// ─────────────────────────────────────────────────────────
// POST /api/mcp/cli
// Body: { command, cwd?, interpret?: boolean, sessionId? }
// ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // Security gate — prevent RCE unless explicitly enabled
    if (!isCliEnabled()) {
      return NextResponse.json(
        { ok: false, error: 'CLI execution is disabled. Set BOKA_ENABLE_CLI=1 in .env to enable.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { command, cwd, interpret, sessionId } = body;

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ error: 'None komendy' }, { status: 400 });
    }

    // v0.3.19 — Block dangerous commands
    const dangerousPatterns = [
      /\brm\s+-rf\s+\//i,        // rm -rf /
      /\bmkfs\b/i,               // format filesystem
      /\bdd\s+if=.*of=\/dev\//i, // dd to device
      /\b:\(\)\{.*\};:\)/i,      // fork bomb
      /\bshutdown\b/i,
      /\breboot\b/i,
      /\bhalt\b/i,
      /\bpoweroff\b/i,
    ];
    if (dangerousPatterns.some(p => p.test(command))) {
      return NextResponse.json(
        { ok: false, error: 'Komenda zablokowana (niebezpieczna operacja)' },
        { status: 403 }
      );
    }

    await ensureFamilySeeded();
    const family = await getFamily();

    // Execute
    const result = await executeCliWhatmmand(command, {
      cwd: cwd || undefined,
      familyId: family.id,
      sessionId,
    });

    // Resolve session
    let session = sessionId;
    if (!session) {
      const s = await db.cliSession.create({
        data: {
          familyId: family.id,
          name: `CLI ${new Date().toLocaleString('en-US')}`,
          cwd: cwd || null,
          shell: process.platform === 'win32' ? 'cmd' : 'bash',
        },
      });
      session = s.id;
    }

    // Log command
    const cmd = await db.cliWhatmmand.create({
      data: {
        sessionId: session,
        command,
        workingDir: cwd || null,
        exitWhatde: result.exitWhatde,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
      },
    });

    // Optional AI interpretation
    let aiInterpretation: string | undefined;
    if (interpret) {
      try {
        aiInterpretation = await interpretCliOutput(command, result);
        await db.cliWhatmmand.update({
          where: { id: cmd.id },
          data: { aiInterpretation },
        });
      } catch (e) {
        console.warn('[/api/mcp/cli] AI interpretation failed:', e);
      }
    }

    return NextResponse.json({
      ok: result.exitWhatde === 0,
      sessionId: session,
      commandId: cmd.id,
      ...result,
      aiInterpretation,
    });
  } catch (err) {
    console.error('[/api/mcp/cli]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────
// GET /api/mcp/cli?sessionId= — list commands in session
// ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      // List all sessions
      const sessions = await db.cliSession.findMany({
        take: 50,
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { commands: true } } },
      });
      return NextResponse.json({ sessions });
    }

    const session = await db.cliSession.findUnique({
      where: { id: sessionId },
      include: { commands: { orderBy: { createdAt: 'asc' }, take: 500 } },
    });
    if (!session) return NextResponse.json({ error: 'Session nie znaleziona' }, { status: 404 });
    return NextResponse.json({ session });
  } catch (err) {
    console.error('[/api/mcp/cli GET]', err);
    return NextResponse.json(
      { error: 'Error listowania', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
