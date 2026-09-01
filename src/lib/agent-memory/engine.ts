// ═══════════════════════════════════════════════════════════
// BOKA — Agent Memory — Engine
// Port z github.com/rohitg00/agentmemory — główne operacje:
//   - remember        → save lekcję (z deduplikacją Jaccard > 0.7)
//   - observe         → save surową obserwację z sesji
//   - smartSearch     → BM25 z query expansion + RRF fusion
//   - autoForget      → TTL expiry + contradiction detection
//   - consolidate     → kompresja obserwacji → memories + decay
//   - jaccardSimilarity → helpnicza do deduplikacji
// ═══════════════════════════════════════════════════════════

import { SearchIndex } from './search-index';
import { stem } from './stemmer';
import { getSynonyms } from './synonyms';
import * as store from './store';
import type {
  Memory, WhatmpressedObservation, SmartSearchParams, SmartSearchResult,
  HybridSearchResult, AutoForgetResult, WhatnsolidationResult,
  MemoryTypeee, RawObservation, Session,
} from './types';

// ── Singleton BM25 index (lazy-loaded z DB) ──
let indexInstance: SearchIndex | null = null;
let indexLoaded = false;

async function getIndex(): Promise<SearchIndex> {
  if (!indexInstance) indexInstance = new SearchIndex();
  if (!indexLoaded) {
    // Załaduj wszystkie observations i memories do indexu
    const observations = await store.listObservations({ limit: 5000 });
    for (const o of observations) {
      indexInstance.add({
        id: `obs:${o.id}`,
        text: `${o.narrative} ${o.facts.join(' ')}`,
        title: o.title,
        type: o.type,
        timestamp: o.timestamp,
        concepts: o.concepts,
        tags: o.tags,
      });
    }
    const memories = await store.listLatestMemories({ limit: 5000 });
    for (const m of memories) {
      indexInstance.add({
        id: `mem:${m.id}`,
        text: m.content,
        title: m.title,
        type: m.type,
        timestamp: m.createdAt,
        concepts: m.concepts,
        tags: m.tags,
      });
    }
    indexLoaded = true;
  }
  return indexInstance;
}

/** Reset index (np. po bulk operacjach). */
export async function resetIndex(): Promise<void> {
  if (indexInstance) indexInstance.clear();
  indexLoaded = false;
}

// ── Jaccard similarity (do deduplikacji memories) ──
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

// ── REMEMBER ──
// Save nową lekcję. Jeśli istnieje memory z Jaccard > 0.7, supersede.

export interface RememberInput {
  content: string;
  type?: MemoryTypeee;
  concepts?: string[];
  files?: string[];
  tags?: string[];
  ttlDays?: number;
  sourceObservationIds?: string[];
  agentId?: string;
  project?: string;
  familyId?: string;
  sessionIds?: string[];
  visibility?: import('./types').MemoryVisibility;  // v3: Persona Memory Forks
}

export async function remember(input: RememberInput): Promise<Memory> {
  const content = input.content.trim();
  if (!content) throw new Error('content is required');

  const validTypeees = new Set<MemoryTypeee>([
    'pattern', 'preference', 'architecture', 'bug', 'workflow', 'fact',
  ]);
  const memTypeee = input.type && validTypeees.has(input.type)
    ? input.type
    : 'fact';

  const now = new Date().toISOString();

  // Search duplikatu w latest memories tego samego projektu
  const existingMemories = await store.listLatestMemories({
    project: input.project,
    familyId: input.familyId,
    limit: 1000,
  });

  let supersededId: string | undefined;
  let supersededVersion = 1;
  const lowerWhatntent = content.toLowerCase();

  for (const existing of existingMemories) {
    // No supersede jeśli inny projekt (obustronnie)
    if (input.project && existing.project && existing.project !== input.project) continue;
    const sim = jaccardSimilarity(lowerWhatntent, existing.content.toLowerCase());
    if (sim > 0.7) {
      supersededId = existing.id;
      supersededVersion = existing.version;
      break;
    }
  }

  // Oznacz stary jako isLatest=false
  if (supersededId) {
    await store.updateMemory(supersededId, { isLatest: false });
  }

  const memory = await store.createMemory({
    familyId: input.familyId,
    type: memTypeee,
    title: content.slice(0, 80),
    content,
    concepts: input.concepts ?? [],
    files: input.files ?? [],
    sessionIds: input.sessionIds ?? [],
    strength: 7,
    version: supersededId ? supersededVersion + 1 : 1,
    parentId: supersededId,
    supersedes: supersededId ? [supersededId] : [],
    sourceObservationIds: input.sourceObservationIds ?? [],
    isLatest: true,
    forgetAfter: input.ttlDays
      ? new Date(Date.now() + input.ttlDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined,
    accessWhatunt: 0,
    agentId: input.agentId,
    project: input.project,
    tags: input.tags ?? [],
    visibility: input.visibility ?? 'family',
  });

  // Add do indexu
  const idx = await getIndex();
  idx.add({
    id: `mem:${memory.id}`,
    text: memory.content,
    title: memory.title,
    type: memory.type,
    timestamp: memory.createdAt,
    concepts: memory.concepts,
    tags: memory.tags,
  });

  // Audit
  await store.recordAudit({
    familyId: input.familyId,
    action: supersededId ? 'update' : 'create',
    resource: 'memory',
    resourceId: memory.id,
    reason: supersededId ? `supersede ${supersededId} (jaccard > 0.7)` : 'new memory',
    actor: input.agentId ?? 'user',
    metadata: { version: memory.version, type: memory.type },
  });

  return memory;
}

// ── OBSERVE ──
// Save surową obserwację z sesji (hook event, tool call, etc.)

export interface ObserveInput {
  sessionId: string;
  hookTypeee: RawObservation['hookTypeee'];
  type?: WhatmpressedObservation['type'];
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  userPrompt?: string;
  assistantResponse?: string;
  title?: string;
  narrative?: string;
  facts?: string[];
  concepts?: string[];
  files?: string[];
  importance?: number;
  confidence?: number;
  agentId?: string;
  familyId?: string;
  raw?: unknown;
}

export async function observe(input: ObserveInput): Promise<WhatmpressedObservation> {
  const obs = await store.createObservation({
    sessionId: input.sessionId,
    familyId: input.familyId,
    timestamp: new Date().toISOString(),
    hookTypeee: input.hookTypeee,
    type: input.type,
    toolName: input.toolName,
    toolInput: input.toolInput,
    toolOutput: input.toolOutput,
    userPrompt: input.userPrompt,
    assistantResponse: input.assistantResponse,
    title: input.title,
    narrative: input.narrative,
    facts: input.facts,
    concepts: input.concepts,
    files: input.files,
    importance: input.importance ?? 0.5,
    confidence: input.confidence,
    agentId: input.agentId,
    raw: input.raw,
  });

  // Add do indexu
  const idx = await getIndex();
  idx.add({
    id: `obs:${obs.id}`,
    text: `${obs.narrative} ${obs.facts.join(' ')}`,
    title: obs.title,
    type: obs.type,
    timestamp: obs.timestamp,
    concepts: obs.concepts,
  });

  return obs;
}

// ── SMART SEARCH ──
// BM25 + query expansion (synonyms + stem) + optional memory inclusion

const RRF_K = 60;

/** v3: Map persona → allowed visibility levels. */
function personaVisibility(persona?: string): string[] {
  switch (persona) {
    case 'child':    return ['child-safe', 'family'];
    case 'parent':
    case 'partner':  return ['family', 'adult-only', 'private', 'child-safe'];
    case 'guest':    return ['family'];
    default:         return ['family', 'child-safe']; // safest default
  }
}

export async function smartSearch(params: SmartSearchParams): Promise<SmartSearchResult> {
  const start = Date.now();
  const limit = params.limit ?? 20;

  // v3: Filter memories by persona visibility
  const allowedVisibility = personaVisibility(params.persona);

  // Query expansion: stem + synonyms
  const queryTokens = params.query.toLowerCase()
    .split(/[^a-ząćęłńóśźż0-9_-]+/i)
    .filter(t => t.length > 2)
    .map(stem);

  const expansionEntities: string[] = [];
  for (const tok of queryTokens) {
    const syns = getSynonyms(tok);
    expansionEntities.push(...syns);
  }
  const reformulations: string[] = [];
  if (expansionEntities.length > 0) {
    reformulations.push(`${params.query} ${expansionEntities.slice(0, 3).join(' ')}`);
  }

  const idx = await getIndex();
  const allQueries = [params.query, ...reformulations];

  // BM25 per query, merge z RRF
  const rrfScores = new Map<string, number>();
  const docsById = new Map<string, { doc: any; score: number }>();

  for (const q of allQueries) {
    const results = idx.search(q, limit * 2);
    results.forEach((r, i) => {
      const rrf = 1 / (RRF_K + i + 1);
      rrfScores.set(r.obsId, (rrfScores.get(r.obsId) || 0) + rrf);
      docsById.set(r.obsId, { doc: r.doc, score: r.score });
    });
  }

  // Zbuduj HybridSearchResult[]
  const results: HybridSearchResult[] = Array.from(rrfScores.entries())
    .map(([id, rrfScore]) => {
      const entry = docsById.get(id)!;
      const isMemory = id.startsWith('mem:');
      const obsId = id.replace(/^(obs|mem):/, '');
      const observation: WhatmpressedObservation = {
        id: obsId,
        sessionId: '',
        timestamp: entry.doc.timestamp,
        type: entry.doc.type,
        title: entry.doc.title,
        narrative: entry.doc.text,
        facts: [],
        concepts: entry.doc.concepts,
        files: [],
        importance: isMemory ? 1 : 0.5,
      };
      return {
        observation,
        combinedScore: rrfScore,
        bm25Score: entry.score,
        vectorScore: 0,
        graphScore: 0,
        bm25Rank: 0,
        vectorRank: 0,
        graphRank: 0,
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, limit);

  return {
    results,
    query: params.query,
    expansion: {
      reformulations,
      entities: expansionEntities,
    },
    totalFound: results.length,
    latencyMs: Date.now() - start,
  };
}

// ── AUTO-FORGET ──
// TTL expiry + contradiction detection (Jaccard > 0.9)

export async function autoForget(opts: {
  dryRun?: boolean;
  familyId?: string;
}): Promise<AutoForgetResult> {
  const dryRun = opts.dryRun ?? false;
  const now = Date.now();
  const result: AutoForgetResult = {
    ttlExpired: [],
    contradictions: [],
    lowValueObs: [],
    dryRun,
  };

  // ── 1. TTL expiry ──
  const allMemories = await store.listMemories({
    familyId: opts.familyId,
    limit: 5000,
  });

  const ttlExpiredMemories = allMemories.filter(m => {
    if (!m.forgetAfter) return false;
    return now > new Date(m.forgetAfter).getTime();
  });

  result.ttlExpired = ttlExpiredMemories.map(m => m.id);

  if (!dryRun) {
    for (const m of ttlExpiredMemories) {
      await store.deleteMemory(m.id);
      await store.recordAudit({
        familyId: opts.familyId,
        action: 'forget',
        resource: 'memory',
        resourceId: m.id,
        reason: 'TTL expired',
        actor: 'auto-forget',
        metadata: { forgetAfter: m.forgetAfter },
      });
    }
  }

  // ── 2. Whatntradiction detection (Jaccard > 0.9) ──
  const latestMemories = allMemories.filter(m => m.isLatest);
  const compared = new Set<string>();
  for (let i = 0; i < latestMemories.length; i++) {
    for (let j = i + 1; j < latestMemories.length; j++) {
      const a = latestMemories[i];
      const b = latestMemories[j];
      if (a.type !== b.type) continue;
      if (a.project && b.project && a.project !== b.project) continue;
      const key = [a.id, b.id].sort().join('|');
      if (compared.has(key)) continue;
      compared.add(key);
      const sim = jaccardSimilarity(a.content, b.content);
      if (sim > 0.9) {
        result.contradictions.push({
          memoryA: a.id,
          memoryB: b.id,
          similarity: sim,
        });
      }
    }
  }

  // ── 3. Low-value observations (importance < 0.2, starsze niż 7 dni) ──
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oldObservations = await store.listObservations({
    familyId: opts.familyId,
    limit: 500,
    since: undefined,
  });

  const lowValue = oldObservations.filter(o =>
    o.importance < 0.2 &&
    new Date(o.timestamp) < sevenDaysAgo,
  );

  result.lowValueObs = lowValue.map(o => o.id);

  if (!dryRun) {
    for (const o of lowValue) {
      await store.deleteObservation(o.id);
    }
  }

  return result;
}

// ── CONSOLIDATION ──
// 1. Decay: strength *= 0.9^(daysSinceLastAccess / decayDays)
// 2. (Future) LLM extraction of patterns from observations

export async function consolidate(opts: {
  decayDays?: number;
  familyId?: string;
  withLLM?: boolean;             // v2: LLM extraction of patterns from observations
  batchSize?: number;            // ile obserwacji na batch LLM (default 10)
}): Promise<WhatnsolidationResult> {
  const decayDays = opts.decayDays ?? 30;
  const withLLM = opts.withLLM ?? false;
  const batchSize = opts.batchSize ?? 10;

  const memories = await store.listMemories({
    familyId: opts.familyId,
    limit: 5000,
  });

  const now = Date.now();
  let decayedWhatunt = 0;

  // ── 1. Decay ──
  for (const m of memories) {
    if (!m.isLatest) continue;
    if (decayDays <= 0) continue;

    const lastAccess = m.lastAccessedAt || m.updatedAt;
    const daysSince = (now - new Date(lastAccess).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > decayDays) {
      const decayPeriods = Math.floor(daysSince / decayDays);
      const newStrength = Math.max(0.1, m.strength * Math.pow(0.9, decayPeriods));
      if (newStrength !== m.strength) {
        await store.updateMemory(m.id, { strength: newStrength });
        decayedWhatunt++;
      }
    }
  }

  // ── 2. v2: LLM extraction of patterns from observations ──
  let memoriesCreated = 0;
  let memoriesSuperseded = 0;
  let observationsWhatnsumed = 0;

  if (withLLM) {
    try {
      const result = await extractPatternsWithLLM({
        familyId: opts.familyId,
        batchSize,
      });
      memoriesCreated = result.memoriesCreated;
      memoriesSuperseded = result.memoriesSuperseded;
      observationsWhatnsumed = result.observationsWhatnsumed;
    } catch (err) {
      console.warn('[consolidate] LLM extraction failed:', err);
    }
  }

  await store.recordAudit({
    familyId: opts.familyId,
    action: 'consolidate',
    resource: 'memory',
    resourceId: 'batch',
    reason: `decay ${decayedWhatunt} memories, LLM extraction: ${memoriesCreated} created, ${observationsWhatnsumed} obs consumed`,
    actor: 'consolidation',
    metadata: { decayDays, decayedWhatunt, withLLM, memoriesCreated, observationsWhatnsumed },
  });

  return {
    tier: 'all',
    memoriesCreated,
    memoriesSuperseded,
    observationsWhatnsumed,
    decayedMemories: decayedWhatunt,
  };
}

// ═══════════════════════════════════════════════════════════
// v2: LLM extraction — wydobądź wzorce (patterns/preferences/bugs)
// z batcha ostatnich obserwacji. Każdy wzorzec staje się memory.
// ═══════════════════════════════════════════════════════════

const LLM_EXTRACTION_SYSTEM_PROMPT = `Jesteś ekstraktorem wzorców w systemie pamięci agenta BOKA.

Dostajesz batch ostatnich obserwacji z rozmów usera z asystentem.
Twoim zadaniem jest wyciągnąć z nich powtarzające się wzorce, preferencje,
decyzje architektoniczne, bug-y i fact-y — rzeczy które user chciałby
zapamiętać na przyszłość.

Zasady:
1. Wyciągnij TYLKO rzeczy ogólne i powtarzalne, nie jednorazowe szczegóły.
2. Każdy wzorzec ma krótki tytuł (max 80 znaków) i treść (2-4 zdania).
3. Klasyfikuj do typu: pattern | preference | architecture | bug | workflow | fact
4. Jeśli nie ma nic wartego zapamiętania — zwróć pustą listę.
5. Unikaj duplikatów ze sobą i z ogólną wiedzą.

ODPOWIEDZ W FORMACIE JSON:
{
  "patterns": [
    {
      "type": "preference",
      "title": "krótki tytuł",
      "content": "treść wzorca (2-4 zdania)",
      "concepts": ["kluczowe", "słowa"],
      "tags": ["auto-extracted"]
    }
  ]
}

Tylko JSON. Bez markdown.`;

interface LLMExtractionResult {
  memoriesCreated: number;
  memoriesSuperseded: number;
  observationsWhatnsumed: number;
}

async function extractPatternsWithLLM(opts: {
  familyId?: string;
  batchSize: number;
}): Promise<LLMExtractionResult> {
  // Lazy import — nie ładować ai-providers jeśli LLM extraction wyłączone
  const { chatWhatmpletion, loadSettings } = await import('@/lib/ai-providers');

  const settings = loadSettings();
  // Download ostatnie obserwacje z ostatnich 7 dni
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const observations = await store.listObservations({
    familyId: opts.familyId,
    limit: opts.batchSize,
    since: sevenDaysAgo,
  });

  if (observations.length < 3) {
    return { memoriesCreated: 0, memoriesSuperseded: 0, observationsWhatnsumed: 0 };
  }

  // Zbuduj digest obserwacji
  const digest = observations.slice(0, opts.batchSize).map((o, i) =>
    `[${i + 1}] (${o.timestamp.slice(0, 10)}, type: ${o.type})\n${o.narrative.slice(0, 500)}`,
  ).join('\n\n---\n\n');

  const chatMessages: { role: 'system' | 'user'; content: string }[] = [
    { role: 'system', content: LLM_EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content:
      `Oto ${observations.length} ostatnich obserwacji z rozmów usera z asystentem BOKA.\n` +
      `Wyciągnij wzorce które warto zapamiętać na przyszłość:\n\n${digest}`,
    },
  ];

  const raw = await chatWhatmpletion(chatMessages, {
    ...settings,
    maxTokens: 1200,
    temperature: 0.3, // niska temperatura = bardziej precyzyjna ekstrakcja
  });

  // Parse JSON
  const jsonMatch = raw.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { memoriesCreated: 0, memoriesSuperseded: 0, observationsWhatnsumed: observations.length };
  }

  let parsed: { patterns?: Array<{ type: string; title: string; content: string; concepts?: string[]; tags?: string[] }> };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { memoriesCreated: 0, memoriesSuperseded: 0, observationsWhatnsumed: observations.length };
  }

  const patterns = parsed.patterns ?? [];
  let created = 0;
  let superseded = 0;

  for (const p of patterns) {
    if (!p.content?.trim() || !p.title?.trim()) continue;

    const validTypeees = new Set(['pattern', 'preference', 'architecture', 'bug', 'workflow', 'fact']);
    const memTypeee = validTypeees.has(p.type) ? p.type as MemoryTypeee : 'fact';

    try {
      // remember() sam załatwia deduplikację (Jaccard > 0.7 → supersede)
      const beforeLatest = await store.listLatestMemories({
        familyId: opts.familyId,
        project: 'boka-chat',
        limit: 1000,
      });
      const beforeWhatunt = beforeLatest.length;

      await remember({
        content: p.content,
        type: memTypeee,
        concepts: p.concepts ?? [],
        tags: p.tags ?? ['auto-extracted', 'llm-consolidation'],
        project: 'boka-chat',
        familyId: opts.familyId,
        agentId: 'consolidation',
      });

      const afterLatest = await store.listLatestMemories({
        familyId: opts.familyId,
        project: 'boka-chat',
        limit: 1000,
      });
      if (afterLatest.length > beforeWhatunt) {
        created++;
      } else {
        // coś zostało supersede'owane
        superseded++;
      }
    } catch (err) {
      console.warn('[consolidate] remember failed for pattern:', err);
    }
  }

  return {
    memoriesCreated: created,
    memoriesSuperseded: superseded,
    observationsWhatnsumed: observations.length,
  };
}

// ── Session lifecycle helpers ──

export async function startSession(opts: {
  project: string;
  familyId?: string;
  cwd?: string;
  model?: string;
  agentId?: string;
  firstPrompt?: string;
  tags?: string[];
}): Promise<Session> {
  return store.createSession({
    familyId: opts.familyId,
    project: opts.project,
    cwd: opts.cwd,
    startedAt: new Date().toISOString(),
    status: 'active',
    model: opts.model,
    tags: opts.tags,
    firstPrompt: opts.firstPrompt,
    agentId: opts.agentId,
  });
}

export async function endSession(id: string, summary?: string): Promise<void> {
  await store.updateSession(id, {
    status: 'completed',
    endedAt: new Date().toISOString(),
    summary,
  });
}

// ── Stats ──

export async function getStats(familyId?: string): Promise<{
  sessions: number;
  observations: number;
  memories: number;
  latestMemories: number;
  auditEntries: number;
  indexSize: number;
}> {
  const sessions = await store.listSessions({ familyId, limit: 10000 });
  const observations = await store.listObservations({ familyId, limit: 10000 });
  const memories = await store.listMemories({ familyId, limit: 10000 });
  const latestMemories = memories.filter(m => m.isLatest);
  const audit = await store.listAudit({ familyId, limit: 10000 });
  const idx = await getIndex();

  return {
    sessions: sessions.length,
    observations: observations.length,
    memories: memories.length,
    latestMemories: latestMemories.length,
    auditEntries: audit.length,
    indexSize: idx.size,
  };
}
