import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import { runMorningBriefing, createFlowState, Flow, LambdaNode } from '@/lib/pocketflow-framework';

// POST /api/pocketflow?action=morning_briefing — run built-in morning briefing flow
// POST /api/pocketflow?action=custom — run custom flow with provided nodes (simplified)

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action') || 'morning_briefing';
    const data = await req.json().catch(() => ({}));

    if (action === 'morning_briefing') {
      const result = await runMorningBriefing(family.id, data.memberId);
      return NextResponse.json({
        output: result.output,
        stepsTaken: result.stepsTaken,
        errors: result.errors,
      });
    }

    if (action === 'custom') {
      // Demo custom flow: lambda → lambda
      const n1 = new LambdaNode(
        async (s) => s.userInput || 'brak inputu',
        async (p) => `[NODE1: ${p}]`,
        async (s, _p, e) => { s.output = `custom flow done: ${e}`; return null; },
      );
      const flow = new Flow(n1);
      const shared = createFlowState({ familyId: family.id, memberId: data.memberId, userInput: data.input });
      const result = await flow.run(shared);
      return NextResponse.json({
        output: result.output,
        stepsTaken: result.stepsTaken,
        errors: result.errors,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
