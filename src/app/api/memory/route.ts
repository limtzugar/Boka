import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import { MemoryService } from '@/lib/memory-service';

// ═══════════════════════════════════════════════════════════
// MEMORY API v2 — Enhanced with MemoryService
// GET /api/memory?memberId=...&stats=true
// POST /api/memory — create memory (with auto-linking + emotion tagging)
// DELETE /api/memory?id=... — delete memory
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const memberId = req.nextUrl.searchParams.get('memberId');
    const stats = req.nextUrl.searchParams.get('stats');

    // Return enhanced memory statistics
    if (stats === 'true') {
      const memStats = await MemoryService.getMemoryStats(family.id);
      return NextResponse.json({ stats: memStats });
    }

    // Return member-specific or family-wide memory with smart scoring
    if (memberId) {
      const results = await MemoryService.getSmartRecall({
        familyId: family.id,
        memberId,
        limit: 30,
      });
      return NextResponse.json({ entries: results });
    }

    // Family-wide — use smart recall without member filter
    const results = await MemoryService.getSmartRecall({
      familyId: family.id,
      limit: 50,
    });
    return NextResponse.json({ entries: results });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const data = await req.json();

    const entry = await MemoryService.createMemory({
      familyId: family.id,
      memberId: data.memberId,
      entryTypee: data.entryTypee || 'semantic',
      domain: data.domain,
      title: data.title,
      content: data.content,
      importance: data.importance,
      emotionalValence: data.emotionalValence,
      emotionTag: data.emotionTag,
      tags: data.tags,
      source: data.source || 'manual',
      sourceId: data.sourceId,
      personMentioned: data.personMentioned,
      location: data.location,
      linkedMemoryIds: data.linkedMemoryIds,
    });

    return NextResponse.json({ entry });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Podaj id pamięci' }, { status: 400 });
    }

    // Delete links first, then the memory
    const { db } = await import('@/lib/db');
    await db.memoryLink.deleteMany({
      where: { OR: [{ sourceId: id }, { targetId: id }] },
    });
    await db.memoryEntry.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
