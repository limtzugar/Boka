// ═══════════════════════════════════════════════════════════
// BOKA — Memory Service v2
// System pamięci wielowarstwowej — mózg BOKA jako osoby
// Inspiracja: Hermes Agent Memory + Obsidian Vault + AHI Architecture
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── TYPY ──────────────────────────────────────

export type MemoryEntryType =
  | 'episodic'     // wydarzenie: "wczoraj byliśmy w kinie"
  | 'semantic'     // fakt: "Ewa lubi krewetki"
  | 'decision'     // decyzja: "kupujemy nowy samochód"
  | 'event'        // wydarzenie z datą: "urodziny 15 marca"
  | 'preference'   // preferencja: "nie lubi ostrego jedzenia"
  | 'emotional'    // stan emocjonalny: "Kamil był smutny po pracy"
  | 'ritual'       // rytuał: "codziennie rano pijemy kawę"
  | 'story'        // historia/opowieść z życia
  | 'dream'        // sen, marzenie
  | 'sensor';      // dane z czujników: pogoda, temperatura

export type EmotionTag =
  | 'happy' | 'sad' | 'angry' | 'worried' | 'excited'
  | 'calm' | 'nostalgic' | 'anxious' | 'grateful' | 'frustrated' | 'neutral';

export type LinkRelation =
  | 'related_to'    // ogólne powiązanie
  | 'caused'        // A spowodowało B
  | 'reminds_of'    // A przypomina B
  | 'contradicts'   // A zaprzecza B
  | 'follows'       // A następuje po B
  | 'same_topic'    // ten sam temat
  | 'same_person';  // ta sama osoba

export type MemoryDomain =
  | 'general' | 'health' | 'education' | 'finance' | 'food'
  | 'hobby' | 'social' | 'family' | 'work' | 'child_culture'
  | 'art' | 'media' | 'tech' | 'legal' | 'travel' | 'home';

// ── INTERFEJSY ────────────────────────────────

interface CreateMemoryParams {
  familyId: string;
  memberId?: string;
  entryType: MemoryEntryType;
  domain?: MemoryDomain;
  title?: string;
  content: string;
  importance?: number;
  emotionalValence?: number;
  emotionTag?: EmotionTag;
  tags?: string[];
  source?: string;
  sourceId?: string;
  personMentioned?: string;
  location?: string;
  linkedMemoryIds?: string[];
}

interface MemorySearchResult {
  id: string;
  content: string;
  title?: string | null;
  entryType: string;
  domain?: string | null;
  importance: number;
  emotionTag?: string | null;
  memberId?: string | null;
  tags: string;
  score: number;         // relevance score 0-1
  reason: string;        // dlaczego ta pamięć jest relevant
  createdAt: Date;
  lastAccessedAt?: Date | null;
}

interface EmotionState {
  memberId: string;
  memberName: string;
  currentEmotion: EmotionTag;
  intensity: number;
  trend: 'improving' | 'stable' | 'declining';
  lastChange: Date;
  recentEmotions: Array<{ emotion: EmotionTag; intensity: number; createdAt: Date }>;
}

interface MemoryContext {
  recentMemories: string;      // ostatnie wydarzenia
  memberContext: string;       // kontekst o osobie
  emotionalState: string;      // stan emocjonalny
  connectedMemories: string;   // powiązane wspomnienia
  familyPatterns: string;      // wzorce w rodzinie
  todayInHistory: string;      // co się kiedyś wydarzyło tego dnia
  pendingReminders: string;    // przypomnienia na dziś
}

// ── SMART RETRIEVAL — Score-based memory recall ──

/**
 * Oblicza score pamięci na podstawie wielu czynników.
 * Wyższy score = bardziej wartościowa pamięć w danym kontekście.
 */
function calculateMemoryScore(params: {
  memory: { importance: number; accessCount: number; createdAt: Date; lastAccessedAt?: Date | null; emotionTag?: string | null; entryType: string };
  currentEmotion?: EmotionTag;
  queryKeywords?: string[];
  timeWeight?: number;  // 0-1, jak bardzo czas ma znaczyć
}): number {
  const { memory, currentEmotion, queryKeywords, timeWeight = 0.3 } = params;

  let score = 0;

  // 1. Ważność bazowa (0-1)
  score += memory.importance * 0.3;

  // 2. Freshness — im nowsze, tym wyższy score
  const ageHours = (Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60);
  const freshness = Math.max(0, 1 - ageHours / (24 * 30)); // zanika po 30 dniach
  score += freshness * timeWeight;

  // 3. Częstość dostępu — często wspominane = ważne (Mere Exposure Effect)
  const accessBonus = Math.min(0.2, memory.accessCount * 0.02);
  score += accessBonus;

  // 4. Rezonans emocjonalny — jeśli emocja pamięci pasuje do obecnej
  if (currentEmotion && memory.emotionTag === currentEmotion) {
    score += 0.15;
  }

  // 5. Typ pamięci — epizodyczne i emocjonalne mają bonus przy rozmowie
  const typeBonus: Record<string, number> = {
    episodic: 0.1,
    emotional: 0.12,
    preference: 0.08,
    event: 0.06,
    semantic: 0.04,
    decision: 0.07,
    story: 0.05,
  };
  score += typeBonus[memory.entryType] || 0;

  // 6. Keyword match — jeśli query zawiera słowa z pamięci
  // (simple word overlap, embeddings will come later with Qdrant)
  // TODO: vector similarity when Qdrant is integrated

  return Math.min(1, score);
}

// ── GŁÓWNA KLASA SERWISU ─────────────────────

export const MemoryService = {
  // ══════════════════════════════════════════
  // CREATE — Zapisz nową pamięć
  // ══════════════════════════════════════════

  async createMemory(params: CreateMemoryParams) {
    // ── WIKILINKS: Auto-link member names in content ──
    let processedContent = params.content;
    try {
      const members = await db.familyMember.findMany({
        where: { familyId: params.familyId },
        select: { name: true },
      });
      const memberNames = members.map(m => m.name);

      const { autoWikilink } = await import('@/lib/wikilinks-service');
      processedContent = autoWikilink({
        content: params.content,
        memberNames,
        knownTerms: (params.tags || []).filter(t => t.length >= 3),
      });
    } catch {
      // If wikilinks fails, use original content
    }

    const memory = await db.memoryEntry.create({
      data: {
        familyId: params.familyId,
        memberId: params.memberId,
        entryType: params.entryType,
        domain: params.domain,
        title: params.title,
        content: processedContent,
        importance: params.importance ?? 0.5,
        emotionalValence: params.emotionalValence,
        emotionTag: params.emotionTag,
        tags: JSON.stringify(params.tags || []),
        source: params.source || 'manual',
        sourceId: params.sourceId,
        personMentioned: params.personMentioned,
        location: params.location,
        linkedMemoryIds: JSON.stringify(params.linkedMemoryIds || []),
      },
    });

    // Auto-link to related memories
    await this.autoLinkMemory(memory.id, params.familyId);

    // Process wikilinks → create MemoryLink entries
    try {
      const members = await db.familyMember.findMany({
        where: { familyId: params.familyId },
        select: { name: true },
      });
      const { processMemoryWikilinks } = await import('@/lib/wikilinks-service');
      await processMemoryWikilinks({
        familyId: params.familyId,
        memoryId: memory.id,
        content: processedContent,
        memberNames: members.map(m => m.name),
      });
    } catch {
      // Non-critical — wikilink processing failed
    }

    return memory;
  },

  // ══════════════════════════════════════════
  // READ — Pobierz z smart scoring
  // ══════════════════════════════════════════

  async getSmartRecall(params: {
    familyId: string;
    memberId?: string;
    currentEmotion?: EmotionTag;
    queryKeywords?: string[];
    limit?: number;
  }): Promise<MemorySearchResult[]> {
    const { familyId, memberId, currentEmotion, queryKeywords, limit = 20 } = params;

    // Pobierz kandydatów
    const candidates = await db.memoryEntry.findMany({
      where: {
        familyId,
        ...(memberId ? { memberId } : {}),
      },
      orderBy: { importance: 'desc' },
      take: 100, // szeroki pool, potem score'ujemy
    });

    // Score i sortuj
    const scored = candidates.map(m => ({
      ...m,
      score: calculateMemoryScore({
        memory: m,
        currentEmotion,
        queryKeywords,
      }),
      reason: m.importance >= 0.8 ? 'bardzo ważne' :
              m.accessCount > 5 ? 'często wspominane' :
              m.emotionTag === currentEmotion ? 'rezonans emocjonalny' :
              'kontekstowe',
    }));

    scored.sort((a, b) => b.score - a.score);

    // Zwróć top N i zaktualizuj accessCount
    const results = scored.slice(0, limit);
    await Promise.all(results.map(m =>
      db.memoryEntry.update({
        where: { id: m.id },
        data: {
          accessCount: { increment: 1 },
          lastAccessedAt: new Date(),
        },
      }).catch(() => {}) // silent fail — nie blokujemy odczytu
    ));

    return results;
  },

  // ══════════════════════════════════════════
  // SEARCH — Proste wyszukiwanie tekstowe
  // ══════════════════════════════════════════

  async searchMemories(params: {
    familyId: string;
    query: string;
    memberId?: string;
    domain?: string;
    emotionTag?: EmotionTag;
    limit?: number;
  }): Promise<MemorySearchResult[]> {
    const { familyId, query, memberId, domain, emotionTag, limit = 15 } = params;

    const where: Record<string, unknown> = { familyId };
    if (memberId) where.memberId = memberId;
    if (domain) where.domain = domain;
    if (emotionTag) where.emotionTag = emotionTag;

    // SQLite LIKE search (full-text, case-insensitive)
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    const allMatches = await db.memoryEntry.findMany({
      where,
      orderBy: { importance: 'desc' },
      take: 100,
    });

    // Filter by keyword match
    const filtered = allMatches.filter(m => {
      const text = `${m.content} ${m.title || ''} ${m.tags}`.toLowerCase();
      return keywords.some(kw => text.includes(kw));
    });

    // Score results
    const results = filtered.map(m => ({
      id: m.id,
      content: m.content,
      title: m.title,
      entryType: m.entryType,
      domain: m.domain,
      importance: m.importance,
      emotionTag: m.emotionTag,
      memberId: m.memberId,
      tags: m.tags,
      score: calculateMemoryScore({ memory: m, queryKeywords: keywords }),
      reason: keywords.some(kw => m.content.toLowerCase().includes(kw)) ? 'dopasowanie treści' : 'powiązane',
      createdAt: m.createdAt,
      lastAccessedAt: m.lastAccessedAt,
    }));

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  },

  // ══════════════════════════════════════════
  // LINK — Powiąż pamięci (jak wikilinki)
  // ══════════════════════════════════════════

  async linkMemories(params: {
    sourceId: string;
    targetId: string;
    relation: LinkRelation;
    strength?: number;
  }) {
    try {
      return await (db.memoryLink as any).create({
        data: {
          sourceId: params.sourceId,
          targetId: params.targetId,
          relation: params.relation,
          strength: params.strength ?? 0.5,
        },
      });
    } catch {
      // Unique constraint violation — link już istnieje
      return null;
    }
  },

  async autoLinkMemory(memoryId: string, familyId: string) {
    const memory = await db.memoryEntry.findUnique({ where: { id: memoryId } });
    if (!memory) return;

    // Znajdź potencjalnie powiązane pamięci
    const candidates = await db.memoryEntry.findMany({
      where: {
        familyId,
        id: { not: memoryId },
        OR: [
          ...(memory.domain ? [{ domain: memory.domain }] : []),
          ...(memory.memberId ? [{ memberId: memory.memberId }] : []),
          ...(memory.emotionTag ? [{ emotionTag: memory.emotionTag }] : []),
        ],
      },
      take: 20,
    });

    for (const candidate of candidates) {
      let relation: LinkRelation | null = null;
      let strength = 0.3;

      // Same domain + same member = same_topic
      if (candidate.domain === memory.domain && candidate.memberId === memory.memberId) {
        relation = 'same_topic';
        strength = 0.7;
      }
      // Same person = same_person
      else if (candidate.personMentioned && candidate.personMentioned === memory.personMentioned) {
        relation = 'same_person';
        strength = 0.6;
      }
      // Same emotion = reminds_of
      else if (candidate.emotionTag && candidate.emotionTag === memory.emotionTag) {
        relation = 'reminds_of';
        strength = 0.4;
      }
      // Same domain = related_to
      else if (candidate.domain === memory.domain) {
        relation = 'related_to';
        strength = 0.3;
      }

      if (relation) {
        await this.linkMemories({
          sourceId: memoryId,
          targetId: candidate.id,
          relation,
          strength,
        }).catch(() => {}); // ignore duplicate link errors
      }
    }
  },

  async getLinkedMemories(memoryId: string): Promise<Array<{
    memory: Awaited<ReturnType<typeof db.memoryEntry.findUnique>>;
    relation: string;
    strength: number;
  }>> {
    const links = await db.memoryLink.findMany({
      where: {
        OR: [
          { sourceId: memoryId },
          { targetId: memoryId },
        ],
      },
      orderBy: { strength: 'desc' },
      take: 10,
    });

    const results: Array<{ memory: any; relation: string; strength: number }> = [];
    for (const link of links) {
      const relatedId = link.sourceId === memoryId ? link.targetId : link.sourceId;
      const memory = await db.memoryEntry.findUnique({ where: { id: relatedId } });
      if (memory) {
        results.push({ memory, relation: link.relation, strength: link.strength } as any);
      }
    }
    return results;
  },

  // ══════════════════════════════════════════
  // EMOTIONS — Śledzenie stanu emocjonalnego
  // ══════════════════════════════════════════

  async logEmotion(params: {
    familyId: string;
    memberId: string;
    emotion: EmotionTag;
    intensity?: number;
    trigger?: string;
    source?: string;
    context?: Record<string, unknown>;
  }) {
    return db.emotionLog.create({
      data: {
        familyId: params.familyId,
        memberId: params.memberId,
        emotion: params.emotion,
        intensity: params.intensity ?? 0.5,
        trigger: params.trigger,
        source: params.source || 'conversation',
        context: params.context ? JSON.stringify(params.context) : null,
      },
    });
  },

  async getEmotionState(memberId: string, familyId: string): Promise<EmotionState | null> {
    // Pobierz ostatnie 24h emocji
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentEmotions = await db.emotionLog.findMany({
      where: { memberId, familyId, createdAt: { gte: yesterday } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (recentEmotions.length === 0) return null;

    const member = await db.familyMember.findUnique({ where: { id: memberId } });
    if (!member) return null;

    // Current emotion = najnowsza
    const latest = recentEmotions[0];

    // Trend — porównaj średnią ostatnich 3 vs poprzednich 3
    const positiveEmotions = ['happy', 'excited', 'calm', 'grateful'];
    const recentScore = recentEmotions.slice(0, 3).reduce((sum, e) =>
      sum + (positiveEmotions.includes(e.emotion) ? e.intensity : -e.intensity), 0) / 3;
    const olderScore = recentEmotions.slice(3, 6).reduce((sum, e) =>
      sum + (positiveEmotions.includes(e.emotion) ? e.intensity : -e.intensity), 0) / Math.min(3, recentEmotions.slice(3, 6).length || 1);

    const trend: 'improving' | 'stable' | 'declining' =
      recentScore - olderScore > 0.15 ? 'improving' :
      recentScore - olderScore < -0.15 ? 'declining' : 'stable';

    return {
      memberId,
      memberName: member.name,
      currentEmotion: latest.emotion as EmotionTag,
      intensity: latest.intensity,
      trend,
      lastChange: latest.createdAt,
      recentEmotions: recentEmotions.map(e => ({
        emotion: e.emotion as EmotionTag,
        intensity: e.intensity,
        createdAt: e.createdAt,
      })),
    };
  },

  async getFamilyEmotionalState(familyId: string): Promise<EmotionState[]> {
    const members = await db.familyMember.findMany({
      where: { familyId, isActive: true },
    });

    const states: EmotionState[] = [];
    for (const member of members) {
      const state = await this.getEmotionState(member.id, familyId);
      if (state) states.push(state);
    }
    return states;
  },

  // ══════════════════════════════════════════
  // CONTEXT BUILDING — Buduj kontekst do promptu
  // ══════════════════════════════════════════

  async buildMemoryContext(params: {
    familyId: string;
    memberId: string;
    currentEmotion?: EmotionTag;
    currentMessage?: string;
  }): Promise<MemoryContext> {
    const { familyId, memberId, currentEmotion, currentMessage } = params;

    // 1. Ostatnie wspomnienia (ostatnie 24h)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentMemories = await db.memoryEntry.findMany({
      where: { familyId, createdAt: { gte: yesterday } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const recentMemoriesStr = recentMemories.length > 0
      ? recentMemories.map(m =>
          `[${m.entryType}${m.emotionTag ? `/${m.emotionTag}` : ''}] ${m.content}`
        ).join('\n')
      : 'Brak nowych wspomnień.';

    // 2. Kontekst o osobie (top preferencje i fakty)
    const memberMemories = await this.getSmartRecall({
      familyId,
      memberId,
      currentEmotion,
      queryKeywords: currentMessage?.split(/\s+/).filter(w => w.length > 3),
      limit: 12,
    });
    const memberContextStr = memberMemories.length > 0
      ? memberMemories.map(m => `• ${m.content} (${m.reason})`).join('\n')
      : 'Brak zapisanych informacji o tej osobie.';

    // 3. Stan emocjonalny rodziny
    const familyEmotions = await this.getFamilyEmotionalState(familyId);
    const emotionalStateStr = familyEmotions.length > 0
      ? familyEmotions.map(e =>
          `${e.memberName}: ${e.currentEmotion} (${e.intensity.toFixed(1)}) — ${e.trend}`
        ).join('\n')
      : 'Brak danych emocjonalnych.';

    // 4. Powiązane wspomnienia (jeśli user napisał wiadomość)
    let connectedMemoriesStr = '';
    if (currentMessage) {
      const related = await this.searchMemories({
        familyId,
        query: currentMessage,
        limit: 5,
      });
      connectedMemoriesStr = related.length > 0
        ? related.map(m => `→ ${m.content} [${m.reason}]`).join('\n')
        : '';
    }

    // 5. Wzorce w rodzinie (często powtarzające się tagi/domains)
    const allMemories = await db.memoryEntry.findMany({
      where: { familyId },
      orderBy: { accessCount: 'desc' },
      take: 50,
    });
    const domainCounts: Record<string, number> = {};
    for (const m of allMemories) {
      if (m.domain) domainCounts[m.domain] = (domainCounts[m.domain] || 0) + 1;
    }
    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([d, c]) => `${d} (${c})`)
      .join(', ');
    const familyPatternsStr = topDomains
      ? `Najczęstsze tematy: ${topDomains}`
      : 'Brak wzorców.';

    // 6. Dzisiaj w historii (co się wydarzyło tego samego dnia w przeszłości)
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();
    const historicalMemories = await db.memoryEntry.findMany({
      where: { familyId, entryType: { in: ['event', 'episodic', 'ritual'] } },
      take: 200,
    });
    const todayInHistoryMemories = historicalMemories.filter(m => {
      const d = m.createdAt;
      return d.getMonth() + 1 === todayMonth && d.getDate() === todayDay && d.getFullYear() !== today.getFullYear();
    });
    const todayInHistoryStr = todayInHistoryMemories.length > 0
      ? todayInHistoryMemories.map(m => `📅 ${m.content}`).join('\n')
      : '';

    // 7. Przypomnienia na dziś
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const reminders = await db.reminder.findMany({
      where: {
        familyId,
        memberId,
        isCompleted: false,
        dueDate: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { dueDate: 'asc' },
    });
    const pendingRemindersStr = reminders.length > 0
      ? reminders.map(r => `⏰ ${r.title} — ${r.dueDate.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`).join('\n')
      : '';

    return {
      recentMemories: recentMemoriesStr,
      memberContext: memberContextStr,
      emotionalState: emotionalStateStr,
      connectedMemories: connectedMemoriesStr,
      familyPatterns: familyPatternsStr,
      todayInHistory: todayInHistoryStr,
      pendingReminders: pendingRemindersStr,
    };
  },

  /**
   * Format memory context as string for prompt injection.
   */
  formatContextForPrompt(ctx: MemoryContext): string {
    const sections: string[] = [];

    if (ctx.recentMemories && ctx.recentMemories !== 'Brak nowych wspomnień.') {
      sections.push(`OSTATNIE WSPOMNIENIA (24h):\n${ctx.recentMemories}`);
    }

    if (ctx.memberContext && ctx.memberContext !== 'Brak zapisanych informacji o tej osobie.') {
      sections.push(`WIESZ O TEJ OSOBIE:\n${ctx.memberContext}`);
    }

    if (ctx.emotionalState && ctx.emotionalState !== 'Brak danych emocjonalnych.') {
      sections.push(`STAN EMOCJONALNY RODZINY:\n${ctx.emotionalState}`);
    }

    if (ctx.connectedMemories) {
      sections.push(`TO CI PRZYPOMINA:\n${ctx.connectedMemories}`);
    }

    if (ctx.pendingReminders) {
      sections.push(`PRZYPOMNIENIA NA DZIŚ:\n${ctx.pendingReminders}`);
    }

    if (ctx.todayInHistory) {
      sections.push(`DZIŚ W HISTORII:\n${ctx.todayInHistory}`);
    }

    if (ctx.familyPatterns && ctx.familyPatterns !== 'Brak wzorców.') {
      sections.push(ctx.familyPatterns);
    }

    return sections.join('\n\n');
  },

  // ══════════════════════════════════════════
  // DAILY SUMMARY — Podsumowanie dnia
  // ══════════════════════════════════════════

  async createDailySummary(familyId: string, date?: Date) {
    const targetDate = date || new Date();
    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // Pobierz dane dnia
    const dayMessages = await db.message.findMany({
      where: { createdAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { createdAt: 'asc' },
    });

    const dayMemories = await db.memoryEntry.findMany({
      where: { familyId, createdAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { importance: 'desc' },
    });

    const dayEmotions = await db.emotionLog.findMany({
      where: { familyId, createdAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { createdAt: 'desc' },
    });

    // Oblicz mood
    const positiveEmotions = ['happy', 'excited', 'calm', 'grateful'];
    const positiveCount = dayEmotions.filter(e => positiveEmotions.includes(e.emotion)).length;
    const negativeCount = dayEmotions.filter(e => !positiveEmotions.includes(e.emotion) && e.emotion !== 'neutral').length;

    const mood = positiveCount > negativeCount * 2 ? 'positive' :
                 negativeCount > positiveCount * 2 ? 'negative' :
                 dayEmotions.length > 0 ? 'mixed' : 'neutral';

    // Highlights — top 5 ważnych pamięci
    const highlights = dayMemories
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5)
      .map(m => m.content);

    // Member states
    const members = await db.familyMember.findMany({ where: { familyId } });
    const memberStates: Record<string, string> = {};
    for (const member of members) {
      const memberEmotions = dayEmotions.filter(e => e.memberId === member.id);
      if (memberEmotions.length > 0) {
        const topEmotion = memberEmotions[0];
        memberStates[member.name] = `${topEmotion.emotion} (${topEmotion.intensity.toFixed(1)})`;
      }
    }

    // Build summary text
    const summaryParts: string[] = [];
    if (dayMemories.length > 0) {
      summaryParts.push(`Nowe wspomnienia: ${dayMemories.slice(0, 5).map(m => m.content).join('; ')}`);
    }
    if (dayMessages.length > 0) {
      summaryParts.push(`Rozmów: ${dayMessages.length} wiadomości`);
    }
    if (Object.keys(memberStates).length > 0) {
      summaryParts.push(`Emocje: ${Object.entries(memberStates).map(([n, s]) => `${n}: ${s}`).join(', ')}`);
    }

    const summary = summaryParts.length > 0 ? summaryParts.join('. ') : 'Spokojny dzień bez nowych wydarzeń.';

    // Upsert
    try {
      const existing = await db.dailySummary.findUnique({
        where: { familyId_date: { familyId, date: dayStart } },
      });

      if (existing) {
        return db.dailySummary.update({
          where: { id: existing.id },
          data: {
            summary,
            mood,
            highlights: JSON.stringify(highlights),
            memberStates: JSON.stringify(memberStates),
            messageCount: dayMessages.length,
            memoryCount: dayMemories.length,
          },
        });
      }

      return db.dailySummary.create({
        data: {
          familyId,
          date: dayStart,
          summary,
          mood,
          highlights: JSON.stringify(highlights),
          memberStates: JSON.stringify(memberStates),
          messageCount: dayMessages.length,
          memoryCount: dayMemories.length,
        },
      });
    } catch {
      // Fallback — date uniqueness might fail
      return null;
    }
  },

  async getDailySummary(familyId: string, date?: Date) {
    const targetDate = date || new Date();
    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

    return db.dailySummary.findUnique({
      where: { familyId_date: { familyId, date: dayStart } },
    });
  },

  async getRecentDailySummaries(familyId: string, days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return db.dailySummary.findMany({
      where: { familyId, date: { gte: since } },
      orderBy: { date: 'desc' },
    });
  },

  // ══════════════════════════════════════════
  // DECAY — Powolne zapominanie (memory decay)
  // ══════════════════════════════════════════

  async decayMemories(familyId: string) {
    // Zmniejsz importance pamięciom, które nie były dostępne od 30+ dni
    // Ale NIE usuwaj — tylko zmniejsz importance
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const staleMemories = await db.memoryEntry.findMany({
      where: {
        familyId,
        lastAccessedAt: { lt: thirtyDaysAgo },
        importance: { gt: 0.2 }, // nie degraduj już zapomnianych
      },
      take: 50,
    });

    let decayed = 0;
    for (const memory of staleMemories) {
      // Decay factor: -0.05 per month of non-access, min 0.1
      const newImportance = Math.max(0.1, memory.importance - 0.05);
      await db.memoryEntry.update({
        where: { id: memory.id },
        data: { importance: newImportance },
      });
      decayed++;
    }

    return { decayed, total: staleMemories.length };
  },

  // ══════════════════════════════════════════
  // RITUALS — Rytuały dnia
  // ══════════════════════════════════════════

  async getActiveRituals(familyId: string) {
    return db.ritual.findMany({
      where: { familyId, isActive: true },
      orderBy: { time: 'asc' },
    });
  },

  async shouldTriggerRitual(familyId: string): Promise<Array<{
    ritual: Awaited<ReturnType<typeof db.ritual.findFirst>>;
    reason: string;
  }>> {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDayOfWeek = now.getDay(); // 0=nd

    const rituals = await this.getActiveRituals(familyId);
    const triggers: Array<{ ritual: any; reason: string }> = [];

    for (const ritual of rituals) {
      let shouldTrigger = false;
      let reason = '';

      // Sprawdź czy nie był już odpalony ostatnio (cooldown 30 min)
      if (ritual.lastTriggeredAt) {
        const minutesSinceLastTrigger = (Date.now() - ritual.lastTriggeredAt.getTime()) / (1000 * 60);
        if (minutesSinceLastTrigger < 30) continue;
      }

      if (ritual.type === 'daily' && ritual.time === currentTime) {
        shouldTrigger = true;
        reason = `Codzienny rytuał o ${ritual.time}`;
      } else if (ritual.type === 'weekly' && ritual.dayOfWeek === currentDayOfWeek && ritual.time === currentTime) {
        shouldTrigger = true;
        reason = `Tygodniowy rytuał — ${['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'][currentDayOfWeek]}`;
      }
      // TODO: monthly, yearly checks

      if (shouldTrigger) {
        // Update lastTriggeredAt
        await db.ritual.update({
          where: { id: ritual.id },
          data: { lastTriggeredAt: now },
        });
        triggers.push({ ritual, reason } as any);
      }
    }

    return triggers;
  },

  // ══════════════════════════════════════════
  // STATS — Statystyki pamięci
  // ══════════════════════════════════════════

  async getMemoryStats(familyId: string) {
    const entries = await db.memoryEntry.findMany({ where: { familyId } });
    const links = await db.memoryLink.findMany({
      where: {
        OR: [
          { source: { familyId } },
          { target: { familyId } },
        ],
      },
    });
    const emotionLogs = await db.emotionLog.findMany({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const byDomain: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byEmotion: Record<string, number> = {};
    let totalImportance = 0;

    for (const entry of entries) {
      const domain = entry.domain || 'general';
      byDomain[domain] = (byDomain[domain] || 0) + 1;
      byType[entry.entryType] = (byType[entry.entryType] || 0) + 1;
      if (entry.emotionTag) byEmotion[entry.emotionTag] = (byEmotion[entry.emotionTag] || 0) + 1;
      totalImportance += entry.importance;
    }

    const recentCount = entries.filter(e =>
      Date.now() - e.createdAt.getTime() < 24 * 60 * 60 * 1000
    ).length;

    const mostAccessed = [...entries]
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 5)
      .map(e => ({ content: e.content.substring(0, 60), accessCount: e.accessCount }));

    return {
      total: entries.length,
      links: links.length,
      byDomain,
      byType,
      byEmotion,
      avgImportance: entries.length > 0 ? totalImportance / entries.length : 0,
      recentCount,
      mostAccessed,
      emotionLogCount: emotionLogs.length,
    };
  },
};
