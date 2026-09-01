import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import {
  generateCrewProfile, getCrewMembers, getCrewMember,
  evaluateCrewMember, runCrewTasks,
  type CrewTask,
} from '@/lib/crewai-service';

// POST /api/crew?action=generate&memberId=... — generate crew profile from MemberProfile
// POST /api/crew?action=evaluate&memberId=... — Manager Agent evaluation
// POST /api/crew?action=run — run sequential tasks across crew members
// GET /api/crew — list crew members
// GET /api/crew?memberId=... — get single crew member

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action');
    const data = await req.json();

    if (action === 'generate') {
      const memberId = req.nextUrl.searchParams.get('memberId') || data.memberId;
      if (!memberId) return NextResponse.json({ error: 'Podaj memberId' }, { status: 400 });
      const profile = await generateCrewProfile(memberId);
      return NextResponse.json({ profile });
    }

    if (action === 'evaluate') {
      const memberId = req.nextUrl.searchParams.get('memberId') || data.memberId;
      if (!memberId) return NextResponse.json({ error: 'Podaj memberId' }, { status: 400 });
      const result = await evaluateCrewMember(memberId, data.recentInteractions || '');
      return NextResponse.json(result);
    }

    if (action === 'run') {
      const tasks: CrewTask[] = data.tasks;
      const context = data.context;
      const result = await runCrewTasks(family.id, tasks, context);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const memberId = req.nextUrl.searchParams.get('memberId');

    if (memberId) {
      const profile = await getCrewMember(memberId);
      return NextResponse.json({ profile });
    }

    const members = await getCrewMembers(family.id);
    return NextResponse.json({ members });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
