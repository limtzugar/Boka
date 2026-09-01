import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import {
  rebuildGraphForFamily,
  detectCommunities,
  summarizeCommunities,
  globalSearch,
} from '@/lib/graphrag-service';
import { db } from '@/lib/db';

// POST /api/graphrag?action=rebuild — full rebuild (cron)
// POST /api/graphrag?action=detect_communities — only community detection
// POST /api/graphrag?action=summarize — only LLM community summaries
// GET /api/graphrag?action=global&q=... — global search across communities
// GET /api/graphrag?action=entities — list entities
// GET /api/graphrag?action=communities — list communities

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action') || 'rebuild';

    if (action === 'rebuild') {
      const result = await rebuildGraphForFamily(family.id);
      return NextResponse.json(result);
    }
    if (action === 'detect_communities') {
      const result = await detectCommunities(family.id);
      return NextResponse.json(result);
    }
    if (action === 'summarize') {
      const result = await summarizeCommunities(family.id);
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
    const action = req.nextUrl.searchParams.get('action');

    if (action === 'global') {
      const q = req.nextUrl.searchParams.get('q');
      if (!q) return NextResponse.json({ error: 'Podaj q' }, { status: 400 });
      const result = await globalSearch(family.id, q);
      return NextResponse.json(result);
    }

    if (action === 'entities') {
      const entities = await db.entity.findMany({
        where: { familyId: family.id },
        orderBy: { mentionCount: 'desc' },
        take: 50,
      });
      return NextResponse.json({ entities });
    }

    if (action === 'communities') {
      const communities = await db.community.findMany({
        where: { familyId: family.id },
        orderBy: { level: 'asc' },
        take: 30,
      });
      return NextResponse.json({ communities });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
