import { NextRequest, NextResponse } from 'next/server';
import { MemoryService } from '@/lib/memory-service';
import { getFamily } from '@/lib/family-service';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════
// DAILY SUMMARY API — Podsumowania dnia
// GET /api/daily-summary?date=YYYY-MM-DD&recent=7
// POST /api/daily-summary — generuj podsumowanie
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const dateStr = req.nextUrl.searchParams.get('date');
    const recentStr = req.nextUrl.searchParams.get('recent');

    if (recentStr) {
      const days = parseInt(recentStr) || 7;
      const summaries = await MemoryService.getRecentDailySummaries(family.id, days);
      return NextResponse.json({ summaries });
    }

    const date = dateStr ? new Date(dateStr) : new Date();
    const summary = await MemoryService.getDailySummary(family.id, date);
    return NextResponse.json({ summary });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const data = await req.json();
    const date = data.date ? new Date(data.date) : new Date();

    const summary = await MemoryService.createDailySummary(family.id, date);
    return NextResponse.json({ summary });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
