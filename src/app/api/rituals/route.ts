import { NextRequest, NextResponse } from 'next/server';
import { MemoryService } from '@/lib/memory-service';
import { getFamily } from '@/lib/family-service';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════
// RITUALS API — Rytuały dnia
// GET /api/rituals — lista aktywnych
// POST /api/rituals — utwórz rytuał
// GET /api/rituals?check=true — sprawdź czy odpalić rytuał
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const check = req.nextUrl.searchParams.get('check');

    if (check === 'true') {
      const triggers = await MemoryService.shouldTriggerRitual(family.id);
      return NextResponse.json({ triggers });
    }

    const rituals = await MemoryService.getActiveRituals(family.id);
    return NextResponse.json({ rituals });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const data = await req.json();

    if (!data.name || !data.type || !data.prompt) {
      return NextResponse.json({ error: 'name, type, prompt są wymagane' }, { status: 400 });
    }

    const ritual = await db.ritual.create({
      data: {
        familyId: family.id,
        memberId: data.memberId,
        name: data.name,
        type: data.type,       // daily, weekly, monthly, yearly
        time: data.time,       // HH:MM
        dayOfWeek: data.dayOfWeek,
        dayOfMonth: data.dayOfMonth,
        month: data.month,
        prompt: data.prompt,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json({ ritual });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
