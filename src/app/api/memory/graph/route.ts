import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════
// BOKA — Relationship Graph API (v0.3.10)
// GET /api/memory/graph?familyId=&focusEntityId=
// Zwraca węzły (Entity) i krawędzie (EntityRelation) do wizualizacji.
// Jeśli focusEntityId — zwraca tylko sąsiadów tej encji.
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const familyId = url.searchParams.get('familyId');
    if (!familyId) {
      return NextResponse.json({ error: 'familyId required' }, { status: 400 });
    }
    const focusEntityId = url.searchParams.get('focusEntityId');

    let entities: any[] = [];
    let relations: any[] = [];

    if (focusEntityId) {
      // Load only neighbors of focused entity
      const focus = await db.entity.findFirst({ where: { id: focusEntityId, familyId } });
      if (!focus) {
        return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
      }

      const neighborIds = new Set<string>([focus.id]);

      const outgoing: any[] = await db.entityRelation.findMany({
        where: { familyId, sourceId: focus.id },
      });
      const incoming: any[] = await db.entityRelation.findMany({
        where: { familyId, targetId: focus.id },
      });

      relations = [...outgoing, ...incoming];
      for (const r of outgoing) neighborIds.add(r.targetId);
      for (const r of incoming) neighborIds.add(r.sourceId);

      entities = await db.entity.findMany({
        where: { id: { in: Array.from(neighborIds) }, familyId },
      });
    } else {
      // Load full graph (limited to 200 entities)
      [entities, relations] = await Promise.all([
        db.entity.findMany({
          where: { familyId },
          orderBy: { mentionCount: 'desc' },
          take: 200,
        }),
        db.entityRelation.findMany({
          where: { familyId },
          take: 500,
        }),
      ]);
    }

    const nodes = entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      mentionCount: e.mentionCount,
      lastMentionedAt: e.lastMentionedAt,
      firstMentionedAt: e.firstMentionedAt,
      communityId: e.communityId,
    }));

    const edges = relations.map((r) => ({
      id: r.id,
      source: r.sourceId,
      target: r.targetId,
      type: r.type,
      strength: r.strength,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({
      nodes,
      edges,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        byType: countBy(nodes, 'type'),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function countBy(arr: any[], key: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of arr) {
    const k = item[key];
    result[k] = (result[k] ?? 0) + 1;
  }
  return result;
}
