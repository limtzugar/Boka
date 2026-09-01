import { NextRequest, NextResponse } from 'next/server';
import { MemoryService } from '@/lib/memory-service';
import { getFamily } from '@/lib/family-service';

// ═══════════════════════════════════════════════════════════
// MEMORY SEARCH API — Smart retrieval z scoringiem
// GET /api/memory/search?q=...&memberId=...&domain=...&emotion=...&mode=search|recall
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const query = req.nextUrl.searchParams.get('q');
    const memberId = req.nextUrl.searchParams.get('memberId');
    const domain = req.nextUrl.searchParams.get('domain');
    const emotion = req.nextUrl.searchParams.get('emotion');
    const mode = req.nextUrl.searchParams.get('mode'); // 'recall' | 'search'

    if (mode === 'recall') {
      // Smart recall — score-based, emotion-aware
      const results = await MemoryService.getSmartRecall({
        familyId: family.id,
        memberId: memberId || undefined,
        currentEmotion: (emotion || undefined) as any,
        limit: 20,
      });
      return NextResponse.json({ results });
    }

    // Text search (query required)
    if (!query) {
      return NextResponse.json({ error: 'Podaj query (q=...) lub mode=recall' }, { status: 400 });
    }

    const results = await MemoryService.searchMemories({
      familyId: family.id,
      query,
      memberId: memberId || undefined,
      domain: domain || undefined,
      emotionTag: (emotion || undefined) as any,
      limit: 15,
    });

    return NextResponse.json({ results });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
