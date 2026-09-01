// ═══════════════════════════════════════════════════════════
// BOKA — Wikilinks Service
// Obsidian-style [[wikilinks]] w treści pamięci
// Parser, resolver, auto-linker, backlinks
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── TYPY ──────────────────────────────────────

export interface Wikilink {
  raw: string;           // [[Ewa]] lub [[Ewa|krewetki]]
  target: string;        // Ewa
  display?: string;      // krewetki (alias)
  position: [number, number]; // start, end w tekście
}

// ── PARSER ────────────────────────────────────

/**
 * Parse all [[wikilinks]] from text.
 * Supports: [[Target]], [[Target|Display]], [[Target#Heading]], [[Target#^block-id]]
 */
export function parseWikilinks(text: string): Wikilink[] {
  const links: Wikilink[] = [];
  // Match [[...]] but not ![[]] (embeds are separate)
  const regex = /(?<!!)\[\[([^\]]+)\]\]/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const inner = match[1];
    let target = inner;
    let display: string | undefined;

    // Handle [[Target|Display]]
    if (inner.includes('|')) {
      const parts = inner.split('|');
      target = parts[0].trim();
      display = parts[1].trim();
    }

    // Handle [[Target#Heading]] and [[Target#^block-id]]
    if (target.includes('#')) {
      target = target.split('#')[0].trim();
    }

    links.push({
      raw: match[0],
      target,
      display,
      position: [match.index, match.index + match[0].length],
    });
  }

  return links;
}

/**
 * Replace [[wikilinks]] in text with formatted output.
 * E.g. [[Ewa]] → Ewa, [[Ewa|Zuzia]] → Zuzia
 */
export function renderWikilinks(text: string): string {
  const links = parseWikilinks(text);
  let result = text;

  // Process from end to start to maintain positions
  for (let i = links.length - 1; i >= 0; i--) {
    const link = links[i];
    const display = link.display || link.target;
    result = result.substring(0, link.position[0]) + display + result.substring(link.position[1]);
  }

  return result;
}

/**
 * Extract all unique link targets from text.
 */
export function extractLinkTargets(text: string): string[] {
  const links = parseWikilinks(text);
  return [...new Set(links.map(l => l.target))];
}

// ── AUTO-WIKILINK ─────────────────────────────

/**
 * Auto-add [[wikilinks]] to memory content.
 * Detects: member names, domains, locations, common terms.
 */
export function autoWikilink(params: {
  content: string;
  memberNames: string[];
  knownTerms?: string[]; // previously used wikilink targets
}): string {
  let { content } = params;
  const { memberNames, knownTerms = [] } = params;

  // Don't double-link — skip if already [[...]]
  const existingTargets = new Set(extractLinkTargets(content));

  // 1. Link member names
  for (const name of memberNames) {
    if (existingTargets.has(name)) continue;
    // Match whole word, case-sensitive, not already inside [[ ]]
    const regex = new RegExp(`(?<!\\[\\[)\\b(${name})\\b(?!\\]\\])`, 'g');
    // Only link first occurrence
    let linked = false;
    content = content.replace(regex, (match) => {
      if (linked) return match;
      linked = true;
      return `[[${match}]]`;
    });
  }

  // 2. Link known terms (tags, domains, places)
  for (const term of knownTerms) {
    if (existingTargets.has(term)) continue;
    if (term.length < 3) continue;
    const regex = new RegExp(`(?<!\\[\\[)\\b(${term})\\b(?!\\]\\])`, 'gi');
    let linked = false;
    content = content.replace(regex, (match) => {
      if (linked) return match;
      linked = true;
      return `[[${match}]]`;
    });
  }

  return content;
}

// ── RESOLVER ──────────────────────────────────

/**
 * Resolve [[wikilinks]] to actual memory entries.
 * Returns a map: target → matching memory IDs.
 */
export async function resolveWikilinks(params: {
  familyId: string;
  targets: string[];
}): Promise<Record<string, string[]>> {
  const { familyId, targets } = params;
  const resolution: Record<string, string[]> = {};

  for (const target of targets) {
    // Search for memories containing this target
    const matches = await db.memoryEntry.findMany({
      where: {
        familyId,
        OR: [
          { content: { contains: target } },
          { title: { contains: target } },
          { personMentioned: { equals: target } },
          { tags: { contains: target } },
        ],
      },
      orderBy: { importance: 'desc' },
      take: 5,
    });

    resolution[target] = matches.map(m => m.id);
  }

  return resolution;
}

/**
 * Get backlinks — all memories that link TO a given memory or term.
 * Obsidian-style backlinks: "X links to Y" → Y has backlink from X.
 */
export async function getBacklinks(params: {
  familyId: string;
  target: string;  // term or memory ID
}): Promise<Array<{
  memoryId: string;
  content: string;
  linkContext: string;  // fragment around the [[link]]
}>> {
  const { familyId, target } = params;

  // Find memories containing [[target]]
  const backlinks = await db.memoryEntry.findMany({
    where: {
      familyId,
      content: { contains: `[[${target}]]` },
    },
    orderBy: { importance: 'desc' },
    take: 20,
  });

  return backlinks.map(m => {
    // Extract context around the wikilink
    const idx = m.content.indexOf(`[[${target}]]`);
    const start = Math.max(0, idx - 50);
    const end = Math.min(m.content.length, idx + target.length + 52);
    const linkContext = m.content.substring(start, end);

    return {
      memoryId: m.id,
      content: m.content,
      linkContext,
    };
  });
}

/**
 * Process memory content on save:
 * 1. Parse wikilinks
 * 2. Auto-link member names
 * 3. Create MemoryLink entries for resolved links
 */
export async function processMemoryWikilinks(params: {
  familyId: string;
  memoryId: string;
  content: string;
  memberNames: string[];
}): Promise<{
  content: string;           // potentially modified with auto-wikilinks
  linksCreated: number;
  resolvedTargets: string[];
}> {
  const { familyId, memoryId, memberNames } = params;
  let { content } = params;

  // Auto-wikilink member names
  content = autoWikilink({ content, memberNames });

  // Parse all wikilinks
  const links = parseWikilinks(content);
  const targets = extractLinkTargets(content);

  // Resolve targets to memory IDs
  const resolutions = await resolveWikilinks({ familyId, targets });

  // Create MemoryLink entries
  let linksCreated = 0;
  for (const [target, memoryIds] of Object.entries(resolutions)) {
    for (const targetMemoryId of memoryIds) {
      if (targetMemoryId === memoryId) continue; // don't link to self
      try {
        await db.memoryLink.create({
          data: {
            sourceId: memoryId,
            targetId: targetMemoryId,
            relation: 'related_to',
            strength: 0.6,
          },
        });
        linksCreated++;
      } catch {
        // Unique constraint — link already exists
      }
    }
  }

  return { content, linksCreated, resolvedTargets: targets };
}
