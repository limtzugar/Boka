import { NextRequest, NextResponse } from 'next/server';
import { startSession, endSession } from '@/lib/agent-memory/engine';
import { listSessions } from '@/lib/agent-memory/store';

// POST /api/agent-memory/session — start session (action=start | end)
// GET  /api/agent-memory/session — list sessions

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      action: 'start' | 'end';
      // start
      project?: string;
      familyId?: string;
      cwd?: string;
      model?: string;
      agentId?: string;
      firstPrompt?: string;
      tags?: string[];
      // end
      sessionId?: string;
      summary?: string;
    };

    if (body.action === 'start') {
      if (!body.project) {
        return NextResponse.json({ error: 'project is required for start' }, { status: 400 });
      }
      const session = await startSession({
        project: body.project,
        familyId: body.familyId,
        cwd: body.cwd,
        model: body.model,
        agentId: body.agentId,
        firstPrompt: body.firstPrompt,
        tags: body.tags,
      });
      return NextResponse.json({ ok: true, session });
    }

    if (body.action === 'end') {
      if (!body.sessionId) {
        return NextResponse.json({ error: 'sessionId is required for end' }, { status: 400 });
      }
      await endSession(body.sessionId, body.summary);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[/api/agent-memory/session POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const familyId = url.searchParams.get('familyId') ?? undefined;
    const project = url.searchParams.get('project') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;
    const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);

    const sessions = await listSessions({ familyId, project, status, limit });
    return NextResponse.json({ count: sessions.length, sessions });
  } catch (err) {
    console.error('[/api/agent-memory/session GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
