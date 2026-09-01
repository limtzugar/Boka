// ═══════════════════════════════════════════════════════════
// BOKA — Agent Memory ↔ Chat integration
// Hook do podłączenia pamięci agenta z głównym czatem BOKA.
//
// Dwie funkcje:
//   1. retrieveMemoryContext(message, familyId?)
//      → BM25 smart-search po pamięci, zwraca tekst do wstrzyknięcia
//        w system prompt lub jako kontekst wiadomości użytkownika.
//
//   2. recordConversationTurn({ sessionId, message, response, familyId? })
//      → Zapisuje dwie obserwacje (user prompt + assistant response)
//        w bazie agent-memory, dzięki czemu consolidate() może
//        ekstrahować wzorce z historii rozmów.
//
// Filozofia: "Default to stateless, elevate to memory only when needed".
// Te hooki są zawsze włączone (tanie), ale best-effort — błędy nie
// przerywają czatu.
// ═══════════════════════════════════════════════════════════

import { smartSearch, observe, startSession } from './engine';
import { checkPredictiveCache } from './predictive';
import type { HookType, ObservationType } from './types';

// Sesja AgentMemory dla czatu BOKA — lazy-inicjalizowana per family.
// Sesja jest współdzielona dla całej rodziny (jeden "boka-chat" project).
const SESSION_CACHE = new Map<string, string>(); // familyId → agentMemorySessionId

/**
 * Pobierz (lub stwórz) ID sesji AgentMemory dla danego familyId.
 * Jedna sesja na rodzinę, projekt "boka-chat".
 */
export async function getChatSessionId(familyId?: string): Promise<string> {
  const cacheKey = familyId || 'global';
  if (SESSION_CACHE.has(cacheKey)) {
    return SESSION_CACHE.get(cacheKey)!;
  }
  try {
    const session = await startSession({
      project: 'boka-chat',
      familyId,
      model: 'boka',
      agentId: 'boka',
      firstPrompt: 'Auto-created chat session',
    });
    SESSION_CACHE.set(cacheKey, session.id);
    return session.id;
  } catch (err) {
    console.warn('[chat-integration] startSession failed:', err);
    // Fallback: użyj stałego ID (obserwacje będą zapisywane bez sesji)
    const fallback = `chat-session-${cacheKey}`;
    SESSION_CACHE.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Wyszukaj w pamięci agenta kontekst powiązany z wiadomością użytkownika.
 * Zwraca tekst do wstrzyknięcia w kontekst czatu.
 *
 * v3: wspiera persona filtering — child widzi tylko child-safe memories.
 *
 * Best-effort: w razie błędu zwraca pusty string (chat działa dalej).
 */
export async function retrieveMemoryContext(
  message: string,
  familyId?: string,
  persona?: 'parent' | 'partner' | 'child' | 'guest',
): Promise<string> {
  if (!message?.trim() || message.length < 5) return '';

  // v4: Check predictive cache FIRST — if hit, return pre-computed answer
  try {
    const cached = await checkPredictiveCache(message, familyId);
    if (cached) {
      const lines: string[] = [];
      lines.push('═══ ⚡ PRE-COMPUTED ANSWER (Predictive Cache) ═══');
      lines.push(`Przewidziane pytanie: ${cached.question}`);
      lines.push(`Confidence predykcji: ${(cached.confidence * 100).toFixed(0)}%`);
      lines.push('');
      lines.push('Odpowiedź:');
      lines.push(cached.answer);
      lines.push('');
      lines.push('═══ KONIEC PRE-COMPUTED ═══');
      return lines.join('\n');
    }
  } catch (err) {
    console.warn('[chat-integration] predictive cache check failed:', err);
  }

  // Fallback: BM25 smart search
  try {
    const result = await smartSearch({
      query: message.slice(0, 500),
      limit: 5,
      familyId,
      persona,
      includeLessons: true,
    });

    if (result.results.length === 0) return '';

    const lines: string[] = [];
    const personaLabel = persona ? ` [persona: ${persona}]` : '';
    lines.push(`═══ KONTEKST Z PAMIĘCI AGENTA (BM25 + synonimy)${personaLabel} ═══`);
    lines.push(`Znaleziono ${result.results.length} powiązanych wspomnień (latency: ${result.latencyMs}ms):`);
    lines.push('');

    result.results.forEach((r, i) => {
      const obs = r.observation;
      const score = r.combinedScore.toFixed(3);
      const title = obs.title.slice(0, 80);
      const narrative = obs.narrative.slice(0, 300);
      const concepts = obs.concepts.length > 0 ? ` [${obs.concepts.slice(0, 3).join(', ')}]` : '';
      lines.push(`[${i + 1}] (score: ${score})${concepts}`);
      lines.push(`    Tytuł: ${title}`);
      lines.push(`    Treść: ${narrative}${narrative.length >= 300 ? '...' : ''}`);
      lines.push('');
    });

    lines.push('═══ KONIEC KONTEKSTU PAMIĘCI ═══');
    lines.push('');
    lines.push('Wykorzystaj powyższy kontekst jeśli jest powiązany z obecnym pytaniem. Jeśli nie — zignoruj.');

    return lines.join('\n');
  } catch (err) {
    console.warn('[chat-integration] retrieveMemoryContext failed:', err);
    return '';
  }
}

/**
 * Zapisz turę rozmowy (user + assistant) jako obserwacje w pamięci agenta.
 *
 * Best-effort: błędy nie przerywają czatu.
 */
export async function recordConversationTurn(opts: {
  message: string;
  response: string;
  familyId?: string;
  agentId?: string;
}): Promise<void> {
  if (!opts.message?.trim() && !opts.response?.trim()) return;

  try {
    const sessionId = await getChatSessionId(opts.familyId);

    // Obserwacja 1: prompt użytkownika
    if (opts.message?.trim()) {
      await observe({
        sessionId,
        familyId: opts.familyId,
        hookType: 'prompt_submit' as HookType,
        type: 'conversation' as ObservationType,
        userPrompt: opts.message,
        title: opts.message.slice(0, 80),
        narrative: opts.message,
        facts: [],
        concepts: extractConcepts(opts.message),
        files: [],
        importance: 0.5,
        agentId: opts.agentId || 'boka',
      });
    }

    // Obserwacja 2: odpowiedź asystenta
    if (opts.response?.trim()) {
      await observe({
        sessionId,
        familyId: opts.familyId,
        hookType: 'stop' as HookType,
        type: 'conversation' as ObservationType,
        assistantResponse: opts.response,
        title: opts.response.slice(0, 80),
        narrative: opts.response,
        facts: [],
        concepts: extractConcepts(opts.response),
        files: [],
        importance: 0.6,
        confidence: 0.85,
        agentId: opts.agentId || 'boka',
      });
    }
  } catch (err) {
    console.warn('[chat-integration] recordConversationTurn failed:', err);
  }
}

/**
 * Prosta ekstrakcja "conceptów" z tekstu — słowa kluczowe dłuższe niż 5 znaków,
 * bez stop-words. Używane do tagowania obserwacji.
 */
function extractConcepts(text: string): string[] {
  const stopWords = new Set([
    'jest', 'są', 'w', 'na', 'z', 'do', 'od', 'o', 'i', 'a', 'ale', 'że',
    'to', 'się', 'nie', 'tak', 'jak', 'the', 'is', 'at', 'which', 'on',
    'and', 'a', 'an', 'to', 'of', 'in', 'for', 'with', 'as', 'by',
  ]);

  const words = text
    .toLowerCase()
    .split(/[^a-ząćęłńóśźż0-9_-]+/i)
    .filter(w => w.length > 5 && !stopWords.has(w));

  // unique, max 5
  return [...new Set(words)].slice(0, 5);
}
