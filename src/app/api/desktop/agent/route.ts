import { NextResponse } from 'next/server';
import { runAgentStep, type AgentGoal, type AgentStepResult } from '@/lib/agent-vision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;  // 60 sekund na krok

interface AgentRequest {
  instruction: string;
  step: number;
  appId?: string;
  previousActions?: AgentStepResult[];
  maxSteps?: number;
}

/**
 * POST /api/desktop/agent
 * Wykonuje JEDEN krok agenta: screenshot → AI decyduje → akcja.
 * Frontend woła ten endpoint w pętli aż done/failed/stop.
 *
 * Body: { instruction, step, appId?, previousActions?, maxSteps? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as AgentRequest;
    if (!body.instruction) {
      return NextResponse.json({ ok: false, error: 'None instrukcji' }, { status: 400 });
    }

    const goal: AgentGoal = {
      instruction: body.instruction,
      appId: body.appId,
      maxSteps: body.maxSteps || 15,
    };

    const result = await runAgentStep(goal, body.step || 1, body.previousActions || []);
    return NextResponse.json({ ok: true, step: result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
