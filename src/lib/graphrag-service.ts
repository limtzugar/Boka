// ═══════════════════════════════════════════════════════════
// BOKA OS — GraphRAG Service (Microsoft graphrag inspired)
// ═══════════════════════════════════════════════════════════
//
// Pipeline:
//   1. extractEntities(text) — LLM wyciąga Person/Place/Activity/etc.
//   2. extractRelations(text) — relacje między encjami (visited, enjoys, ...)
//   3. detectCommunities(familyId) — clustering encji w społeczności
//   4. summarizeCommunities(familyId) — LLM generuje podsumowania
//
// Cron nocturnal (0 3 * * *) odświeża graf nad nowymi MemoryEntry.
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { chatCompletion } from '@/lib/ai-providers';

// ── Typy ───────────────────────────────────

export interface EntityCandidate {
  name: string;
  type: 'Person' | 'Place' | 'Activity' | 'Emotion' | 'Object' | 'Organization' | 'Date';
  aliases?: string[];
  description?: string;
}

export interface RelationCandidate {
  source: string;
  target: string;
  type: 'visited' | 'enjoys' | 'struggles_with' | 'knows' | 'related_to' | 'caused' | 'part_of' | 'friend_of' | 'family_of';
  evidence?: string;
}

export interface CommunitySummary {
  id: string;
  label?: string;
  summary: string;
  memberCount: number;
}

// ── LLM extraction ────────────────────────

const EXTRACT_PROMPT = `Z poniższego tekstu wyciągnij ENCJE i RELACJE w formacie JSON.

Tekst:
"""
{TEXT}
"""

Zwróć WYŁĄCZNIE JSON:
{{
  "entities": [
    {{"name": "Zuza", "type": "Person", "aliases": ["Zuzia"], "description": "córką w rodzinie"}}
  ],
  "relations": [
    {{"source": "Zuza", "target": "szkoła", "type": "visited", "evidence": "krótki cytat"}}
  ]
}}

Typy encji: Person, Place, Activity, Emotion, Object, Organization, Date
Typy relacji: visited, enjoys, struggles_with, knows, related_to, caused, part_of, friend_of, family_of

Zwróć max 10 encji i 10 relacji. Tylko to co JAWNIE w tekście.`;

export async function extractEntities(
  text: string,
  familyId: string,
  memberId?: string
): Promise<EntityCandidate[]> {
  if (!text || text.length < 30) return [];

  const prompt = EXTRACT_PROMPT.replace('{TEXT}', text.slice(0, 2000));

  try {
    const resp = await chatCompletion([
      { role: 'system', content: 'Wyciągasz encje z tekstu. Zwracasz WYŁĄCZNIE JSON.' },
      { role: 'user', content: prompt },
    ]);
    const match = resp.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.entities)) return [];
    return parsed.entities.slice(0, 10);
  } catch {
    // Fallback: heurystyczne wykrywanie (Capitalized words)
    return heuristicEntityExtract(text);
  }
}

export async function extractRelations(
  text: string
): Promise<RelationCandidate[]> {
  if (!text || text.length < 30) return [];

  const prompt = EXTRACT_PROMPT.replace('{TEXT}', text.slice(0, 2000));

  try {
    const resp = await chatCompletion([
      { role: 'system', content: 'Wyciągasz relacje z tekstu. Zwracasz WYŁĄCZNIE JSON.' },
      { role: 'user', content: prompt },
    ]);
    const match = resp.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.relations)) return [];
    return parsed.relations.slice(0, 10);
  } catch {
    return [];
  }
}

/** Fallback: prosta heurystyka (Capitalized words jako Person) */
function heuristicEntityExtract(text: string): EntityCandidate[] {
  const matches = text.match(/\b[A-Z][a-ząćęłńóśźż]{2,}\b/g) || [];
  const unique = Array.from(new Set(matches)).slice(0, 5);
  return unique.map(name => ({ name, type: 'Person' as const }));
}

// ── Upsert encji do DB ────────────────────

export async function upsertEntities(
  candidates: EntityCandidate[],
  familyId: string,
  evidenceMemoryId?: string
): Promise<{ created: number; updated: number }> {
  let created = 0, updated = 0;

  for (const c of candidates) {
    const existing = await db.entity.findUnique({
      where: { familyId_name: { familyId, name: c.name } },
    });

    if (existing) {
      const newCount = existing.mentionCount + 1;
      await db.entity.update({
        where: { id: existing.id },
        data: {
          mentionCount: newCount,
          lastMentionedAt: new Date(),
          firstMentionedAt: existing.firstMentionedAt || new Date(),
          aliases: c.aliases
            ? JSON.stringify(Array.from(new Set([
                ...(JSON.parse(existing.aliases || '[]') as string[]),
                ...c.aliases,
              ])))
            : existing.aliases,
          description: c.description || existing.description,
        },
      });
      updated++;
    } else {
      await db.entity.create({
        data: {
          familyId,
          name: c.name,
          type: c.type,
          aliases: JSON.stringify(c.aliases || []),
          description: c.description || null,
          mentionCount: 1,
          firstMentionedAt: new Date(),
          lastMentionedAt: new Date(),
        },
      });
      created++;
    }
  }

  return { created, updated };
}

export async function upsertRelations(
  candidates: RelationCandidate[],
  familyId: string,
  evidenceMemoryId?: string
): Promise<{ created: number }> {
  let created = 0;

  for (const r of candidates) {
    const src = await db.entity.findUnique({ where: { familyId_name: { familyId, name: r.source } } });
    const tgt = await db.entity.findUnique({ where: { familyId_name: { familyId, name: r.target } } });
    if (!src || !tgt) continue;

    try {
      await db.entityRelation.create({
        data: {
          familyId,
          sourceId: src.id,
          targetId: tgt.id,
          type: r.type,
          evidence: evidenceMemoryId,
          strength: 0.6,
        },
      });
      created++;
    } catch {
      // unique constraint — relacja już istnieje
    }
  }
  return { created };
}

// ── Community detection (simple clustering) ──

/**
 * Prosty community detection: grupuje encje po shared relations.
 * Dwie encje w tej samej społeczności jeśli mają ≥2 wspólne sąsiadów.
 */
export async function detectCommunities(familyId: string): Promise<{
  communitiesCreated: number;
  entitiesAssigned: number;
}> {
  const entities = await db.entity.findMany({ where: { familyId } });
  const relations = await db.entityRelation.findMany({ where: { familyId } });

  // Build adjacency
  const adj = new Map<string, Set<string>>();
  for (const e of entities) adj.set(e.id, new Set());
  for (const r of relations) {
    adj.get(r.sourceId)?.add(r.targetId);
    adj.get(r.targetId)?.add(r.sourceId);
  }

  // Simple clustering: BFS z marked-set
  const visited = new Set<string>();
  const clusters: string[][] = [];

  for (const entity of entities) {
    if (visited.has(entity.id)) continue;
    const cluster: string[] = [];
    const queue = [entity.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      cluster.push(cur);
      const neighbors = adj.get(cur) || new Set();
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push(n);
      }
    }
    if (cluster.length > 0) clusters.push(cluster);
  }

  // Zapisz społeczności (level 0)
  let communitiesCreated = 0;
  let entitiesAssigned = 0;

  for (const cluster of clusters) {
    if (cluster.length < 2) continue; // pomijaj singletony

    const community = await db.community.create({
      data: {
        familyId,
        level: 0,
        memberIds: JSON.stringify(cluster),
      },
    });

    for (const entityId of cluster) {
      await db.entity.update({
        where: { id: entityId },
        data: { communityId: community.id },
      });
      entitiesAssigned++;
    }
    communitiesCreated++;
  }

  return { communitiesCreated, entitiesAssigned };
}

// ── Summarize communities (LLM) ──────────

export async function summarizeCommunities(familyId: string): Promise<{
  summarized: number;
}> {
  const communities = await db.community.findMany({
    where: { familyId, summary: null },
  });

  let summarized = 0;
  for (const community of communities) {
    const memberIds = JSON.parse(community.memberIds || '[]') as string[];
    if (memberIds.length === 0) continue;

    const entities = await db.entity.findMany({ where: { id: { in: memberIds } } });
    const entityList = entities.map(e => `${e.name} (${e.type})`).join(', ');

    try {
      const resp = await chatCompletion([
        { role: 'system', content: 'Generujesz krótkie podsumowanie społeczności encji. 1-2 zdania po polsku.' },
        { role: 'user', content: `Społeczność składa się z: ${entityList}. Podaj krótkie podsumowanie i opcjonalnie etykietę.` },
      ]);

      await db.community.update({
        where: { id: community.id },
        data: {
          summary: resp.slice(0, 500),
          label: resp.split('\n')[0].slice(0, 80) || null,
        },
      });
      summarized++;
    } catch {
      // pomiń
    }
  }

  return { summarized };
}

// ── Global search (GraphRAG global) ──────

export async function globalSearch(familyId: string, query: string): Promise<{
  answer: string;
  communitiesUsed: string[];
}> {
  const communities = await db.community.findMany({
    where: { familyId, summary: { not: null } },
  });

  if (communities.length === 0) {
    return { answer: 'Brak społeczności do przeszukania. Uruchom GraphRAG rebuild.', communitiesUsed: [] };
  }

  const communitySummaries = communities
    .map(c => `### ${c.label || 'Społeczność'}\n${c.summary}`)
    .join('\n\n');

  try {
    const resp = await chatCompletion([
      { role: 'system', content: 'Odpowiadasz na pytanie na podstawie podsumowań społeczności pamięci rodziny. Odpowiadaj po polsku, z cytujac referencje do społeczności.' },
      { role: 'user', content: `PYTANIE: ${query}\n\nPODSUMOWANIA SPOŁECZNOŚCI:\n${communitySummaries}` },
    ]);
    return { answer: resp, communitiesUsed: communities.map(c => c.id) };
  } catch {
    return { answer: 'Błąd LLM podczas global search.', communitiesUsed: [] };
  }
}

// ── Full rebuild (cron nocturnal) ────────

export async function rebuildGraphForFamily(familyId: string): Promise<{
  entitiesProcessed: number;
  communitiesCreated: number;
  communitiesSummarized: number;
}> {
  // Pobierz ostatnie MemoryEntry bez Entity evidence
  const recentMemories = await db.memoryEntry.findMany({
    where: { familyId, validUntil: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  let entitiesProcessed = 0;
  for (const mem of recentMemories) {
    const entities = await extractEntities(mem.content, familyId, mem.memberId || undefined);
    const relations = await extractRelations(mem.content);
    await upsertEntities(entities, familyId, mem.id);
    await upsertRelations(relations, familyId, mem.id);
    entitiesProcessed += entities.length;
  }

  const commResult = await detectCommunities(familyId);
  const summResult = await summarizeCommunities(familyId);

  return {
    entitiesProcessed,
    communitiesCreated: commResult.communitiesCreated,
    communitiesSummarized: summResult.summarized,
  };
}
