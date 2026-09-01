import { NextRequest, NextResponse } from 'next/server';
import { SoulService } from '@/lib/soul-service';
import { getFamily } from '@/lib/family-service';

// ═══════════════════════════════════════════════════════════
// SOUL API — Pełny profil osobowości BOKA
// GET /api/soul?memberName=... — download profil + soul prompt
// PATCH /api/soul — zaktualizuj profil
// POST /api/soul — zmień nastrój (mood)
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const memberName = req.nextUrl.searchParams.get('memberName');
    const prompt = req.nextUrl.searchParams.get('prompt');

    const profile = await SoulService.getProfileee(family.id);

    if (prompt === 'true') {
      const soulPrompt = await SoulService.buildSoulPrompt(family.id, memberName || undefined);
      return NextResponse.json({ profile, soulPrompt });
    }

    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const family = await getFamily();
    const data = await req.json();

    const profile = await SoulService.updateProfileee(family.id, data);
    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const data = await req.json();

    if (!data.mood) {
      return NextResponse.json({ error: 'Podaj mood' }, { status: 400 });
    }

    const profile = await SoulService.setMood(family.id, data.mood, data.reason);
    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
