import { NextRequest, NextResponse } from 'next/server';
import { MemoryService } from '@/lib/memory-service';
import { getFamily } from '@/lib/family-service';

// ═══════════════════════════════════════════════════════════
// EMOTIONS API — Dziennik emocjonalny rodziny
// GET /api/emotions?memberId=...&family=true
// POST /api/emotions — log emotion
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const memberId = req.nextUrl.searchParams.get('memberId');
    const familyMode = req.nextUrl.searchParams.get('family');

    if (familyMode === 'true') {
      const states = await MemoryService.getFamilyEmotionalState(family.id);
      return NextResponse.json({ states });
    }

    if (memberId) {
      const state = await MemoryService.getEmotionState(memberId, family.id);
      return NextResponse.json({ state });
    }

    return NextResponse.json({ error: 'Podaj memberId lub family=true' }, { status: 400 });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const data = await req.json();

    if (!data.memberId || !data.emotion) {
      return NextResponse.json({ error: 'memberId i emotion są wymagane' }, { status: 400 });
    }

    const log = await MemoryService.logEmotion({
      familyId: family.id,
      memberId: data.memberId,
      emotion: data.emotion,
      intensity: data.intensity,
      trigger: data.trigger,
      source: data.source || 'manual',
      context: data.context,
    });

    return NextResponse.json({ log });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
