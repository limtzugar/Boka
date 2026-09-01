// ═══════════════════════════════════════════════════════════
// BOKA — Agent Swarm Topology
// Dynamiczny dobór agentów do debaty na podstawie dopasowania
// specialty agenta do intencji promptu użytkownika.
//
// Zamiast statycznej listy 8 agentów, system wybiera top-K
// agentów z najwyższym cosine/Jaccard similarity między
// specialty_vector agenta a intent_vector promptu.
//
// v1: keyword-based (BM25-lite). v2: embeddings (future).
// ═══════════════════════════════════════════════════════════

export interface SwarmAgent {
  id: string;
  name: string;
  specialty: string;        // krótki opis specjalności
  description: string;      // dłuższy opis
  color: string;
  glyph: string;
  enabled: boolean;
}

export interface SwarmMatchResult {
  agentId: string;
  agentName: string;
  score: number;            // 0..1
  matchedKeywords: string[];
  reason: string;
}

// ── Stop-words PL+EN ──
const STOP_WORDS = new Set([
  'jest', 'są', 'w', 'na', 'z', 'do', 'od', 'o', 'i', 'a', 'ale', 'że',
  'to', 'się', 'nie', 'tak', 'jak', 'the', 'is', 'at', 'which', 'on',
  'and', 'a', 'an', 'to', 'of', 'in', 'for', 'with', 'as', 'by',
  'jak', 'co', 'kto', 'gdzie', 'kiedy', 'dlaczego', 'czy',
]);

/** Tokenize + stem-lite (lowercase, strip accents, filter stop-words). */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip Polish diacritics for matching
      .split(/[^a-z0-9_-]+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/** Jaccard similarity between two sets. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

/**
 * Dopasuj agentów do promptu użytkownika.
 * Zwraca posortowaną listę z score 0..1.
 */
export function matchAgentsToPrompt(
  prompt: string,
  agents: SwarmAgent[],
  topK = 4,
): SwarmMatchResult[] {
  const promptTokens = tokenize(prompt);
  if (promptTokens.size === 0 || agents.length === 0) return [];

  const results: SwarmMatchResult[] = agents.map(agent => {
    // Concatenate specialty + description for matching
    const agentText = `${agent.specialty} ${agent.description} ${agent.name}`;
    const agentTokens = tokenize(agentText);

    // Find matched keywords (intersection)
    const matchedKeywords: string[] = [];
    for (const token of promptTokens) {
      if (agentTokens.has(token)) {
        matchedKeywords.push(token);
      }
    }

    const score = jaccard(promptTokens, agentTokens);

    return {
      agentId: agent.id,
      agentName: agent.name,
      score,
      matchedKeywords,
      reason: matchedKeywords.length > 0
        ? `Dopasowane słowa: ${matchedKeywords.slice(0, 5).join(', ')}`
        : 'Brak bezpośrednich dopasowań',
    };
  });

  // Sort by score desc, take top-K with score > 0
  return results
    .filter(r => r.score > 0 || r.matchedKeywords.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Auto-enable top-K agents, disable rest.
 * Returns new agent array with updated `enabled` flags.
 */
export function autoSelectAgents(
  prompt: string,
  agents: SwarmAgent[],
  topK = 4,
): SwarmAgent[] {
  const matches = matchAgentsToPrompt(prompt, agents, topK);
  const matchedIds = new Set(matches.map(m => m.agentId));

  // If no matches, keep at least 2 default agents enabled (Sage + Sceptyk)
  if (matchedIds.size === 0) {
    return agents.map(a => ({
      ...a,
      enabled: a.id === 'sage' || a.id === 'sceptyk',
    }));
  }

  return agents.map(a => ({
    ...a,
    enabled: matchedIds.has(a.id),
  }));
}
