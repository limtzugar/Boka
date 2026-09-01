import { NextRequest, NextResponse } from 'next/server';
import { observe } from '@/lib/agent-memory/engine';
import type { HookType, ObservationType } from '@/lib/agent-memory/types';

// POST /api/agent-memory/observe — zapisz obserwację z sesji

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sessionId: string;
      hookType: HookType;
      type?: ObservationType;
      toolName?: string;
      toolInput?: unknown;
      toolOutput?: unknown;
      userPrompt?: string;
      assistantResponse?: string;
      title?: string;
      narrative?: string;
      facts?: string[];
      concepts?: string[];
      files?: string[];
      importance?: number;
      confidence?: number;
      agentId?: string;
      familyId?: string;
      raw?: unknown;
    };

    if (!body.sessionId || !body.hookType) {
      return NextResponse.json(
        { error: 'sessionId and hookType are required' },
        { status: 400 },
      );
    }

    const obs = await observe(body);
    return NextResponse.json({ ok: true, observation: obs });
  } catch (err) {
    console.error('[/api/agent-memory/observe]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
