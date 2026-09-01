import { NextRequest, NextResponse } from 'next/server';
import { matchAgentsToPrompt, autoSelectAgents, type SwarmAgent } from '@/lib/swarm-matcher';

// POST /api/agents/swarm-match
// Body: { prompt: string, agents: SwarmAgent[], topK?: number, action?: 'match'|'auto-select' }
// Returns: { matches: SwarmMatchResult[] } lub { agents: SwarmAgent[] }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      prompt: string;
      agents: SwarmAgent[];
      topK?: number;
      action?: 'match' | 'auto-select';
    };

    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }
    if (!Array.isArray(body.agents) || body.agents.length === 0) {
      return NextResponse.json({ error: 'agents array is required' }, { status: 400 });
    }

    const topK = body.topK ?? 4;
    const action = body.action ?? 'match';

    if (action === 'auto-select') {
      const updated = autoSelectAgents(body.prompt, body.agents, topK);
      const matches = matchAgentsToPrompt(body.prompt, body.agents, topK);
      return NextResponse.json({
        agents: updated,
        matches,
        selectedCount: updated.filter(a => a.enabled).length,
      });
    }

    // Default: just match
    const matches = matchAgentsToPrompt(body.prompt, body.agents, topK);
    return NextResponse.json({
      matches,
      totalMatched: matches.length,
    });
  } catch (err) {
    console.error('[/api/agents/swarm-match]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
