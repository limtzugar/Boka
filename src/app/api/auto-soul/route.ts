import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import { refreshAutoProfile, getAutoProfile, getProfileHistory } from '@/lib/supermemory-service';

// POST /api/auto-soul?memberId=... — refresh SoulProfile from recent memories
// GET /api/auto-soul?memberId=... — get current profile
// GET /api/auto-soul?memberId=...&history=true — get revision history

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const memberId = req.nextUrl.searchParams.get('memberId');
    if (!memberId) return NextResponse.json({ error: 'Podaj memberId' }, { status: 400 });

    const data = await req.json().catch(() => ({}));
    const memoriesLimit = data.memoriesLimit || 30;

    const result = await refreshAutoProfile(family.id, memberId, memoriesLimit);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const memberId = req.nextUrl.searchParams.get('memberId');
    if (!memberId) return NextResponse.json({ error: 'Podaj memberId' }, { status: 400 });
    const history = req.nextUrl.searchParams.get('history') === 'true';

    if (history) {
      const revisions = await getProfileHistory(memberId);
      return NextResponse.json({ revisions });
    }

    const profile = await getAutoProfile(memberId);
    return NextResponse.json({ profile });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
