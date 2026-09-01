import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatCompletion, loadSettings } from '@/lib/ai-providers';
import { logDecision } from '@/lib/audit-service';

// ═══════════════════════════════════════════════════════════
// BOKA — Relationship Engine Temporal Diff API (v0.3.10)
// "Co nowego o X od ostatniej rozmowy?"
// GET /api/memory/temporal-diff?familyId=&entityId=&since=
// ═══════════════════════════════════════════════════════════

type EntityRow = {
  id: string;
  name: string;
  type: string;
  aliases: string;
  communityId: string | null;
  mentionCount: number;
  firstMentionedAt: Date | null;
  lastMentionedAt: Date | null;
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const familyId = url.searchParams.get('familyId');
    const entityId = url.searchParams.get('entityId');
    const entityName = url.searchParams.get('name');
    const sinceParam = url.searchParams.get('since');

    if (!familyId) {
      return NextResponse.json({ error: 'familyId required' }, { status: 400 });
    }

    // Default: 7 days ago
    const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let entity: EntityRow | null = null;
    if (entityId) {
      entity = await db.entity.findFirst({ where: { id: entityId, familyId } }) as EntityRow | null;
    } else if (entityName) {
      entity = await db.entity.findFirst({ where: { familyId, name: { contains: entityName } } }) as EntityRow | null;
    }

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found. Provide entityId or name.' }, { status: 404 });
    }

    // 1. Find memories mentioning this entity since "since" date
    const newMemories = await db.memoryEntry.findMany({
      where: {
        familyId,
        createdAt: { gte: since },
        OR: [
          { content: { contains: entity.name } },
          { title: { contains: entity.name } },
          { tags: { contains: entity.name } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // 2. Find new relations involving this entity since "since"
    const rawRelations = await db.entityRelation.findMany({
      where: {
        familyId,
        createdAt: { gte: since },
        OR: [{ sourceId: entity.id }, { targetId: entity.id }],
      },
    });

    // Fetch source/target names separately (workaround for missing @relation in schema)
    const sourceIds = [...new Set(rawRelations.map(r => r.sourceId))];
    const targetIds = [...new Set(rawRelations.map(r => r.targetId))];
    const relatedEntities = sourceIds.length > 0 || targetIds.length > 0
      ? await db.entity.findMany({
          where: { id: { in: [...sourceIds, ...targetIds] } },
        })
      : [];
    const entityMap = new Map(relatedEntities.map(e => [e.id, e]));

    const newRelations = rawRelations.map(r => ({
      id: r.id,
      type: r.type,
      sourceId: r.sourceId,
      targetId: r.targetId,
      strength: r.strength,
      createdAt: r.createdAt,
      source: { name: entityMap.get(r.sourceId)?.name ?? '?', type: entityMap.get(r.sourceId)?.type ?? '?' },
      target: { name: entityMap.get(r.targetId)?.name ?? '?', type: entityMap.get(r.targetId)?.type ?? '?' },
    }));

    // 3. Check aliases for additional memories
    let aliases: string[] = [];
    try {
      aliases = JSON.parse(entity.aliases || '[]');
    } catch {}
    const aliasMemories = aliases.length > 0
      ? await db.memoryEntry.findMany({
          where: {
            familyId,
            createdAt: { gte: since },
            OR: aliases.map((a) => ({ content: { contains: a } })),
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];

    // 4. LLM-summarize "what's new"
    let summary = '';
    if (newMemories.length > 0 || newRelations.length > 0 || aliasMemories.length > 0) {
      try {
        const settings = loadSettings();
        const combined = [
          ...newMemories.map((m) => `- ${m.title ?? 'wspomnienie'}: ${m.content.slice(0, 200)}`),
          ...aliasMemories.map((m) => `- ${m.title ?? 'alias'}: ${m.content.slice(0, 200)}`),
          ...newRelations.map((r) => `- ${r.source.name} → ${r.type} → ${r.target.name}`),
        ].join('\n');

        summary = await chatCompletion(
          [
            {
              role: 'system',
              content: `Jesteś BOKA. Podsumuj po polsku co nowego o "${entity.name}" wydarzyło się od ${since.toISOString().slice(0, 10)}. Bądź konkretna i personalna — pisz do domownika. Max 3-4 zdania.`,
            },
            { role: 'user', content: combined },
          ],
          settings,
        );
      } catch (e: any) {
        summary = `Znaleziono ${newMemories.length} nowych wspomnień i ${newRelations.length} nowych relacji.`;
      }
    }

    await logDecision({
      familyId,
      agentId: 'boka-memory',
      action: 'temporal_diff',
      category: 'memory',
      reasoning: `User zapytał co nowego o "${entity.name}" od ${since.toISOString().slice(0, 10)}. Znalazłam ${newMemories.length} wspomnień i ${newRelations.length} relacji.`,
      inputSummary: `entity=${entity.name}, since=${since.toISOString().slice(0, 10)}`,
      outputSummary: summary.slice(0, 100),
      riskLevel: 'info',
      contextJson: { entityId: entity.id, since, newCount: newMemories.length + newRelations.length },
    });

    return NextResponse.json({
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        lastMentionedAt: entity.lastMentionedAt,
        firstMentionedAt: entity.firstMentionedAt,
        mentionCount: entity.mentionCount,
      },
      since,
      newMemories: newMemories.map((m) => ({
        id: m.id,
        title: m.title,
        content: m.content.slice(0, 300),
        createdAt: m.createdAt,
        emotionTag: m.emotionTag,
        importance: m.importance,
      })),
      newRelations: newRelations.map((r) => ({
        id: r.id,
        type: r.type,
        source: r.source.name,
        target: r.target.name,
        createdAt: r.createdAt,
        strength: r.strength,
      })),
      aliasMemories: aliasMemories.map((m) => ({
        id: m.id,
        title: m.title,
        content: m.content.slice(0, 300),
        createdAt: m.createdAt,
      })),
      summary,
    });
  } catch (e: any) {
    console.error('[temporal-diff] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
