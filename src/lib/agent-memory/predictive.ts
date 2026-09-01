// ═══════════════════════════════════════════════════════════
// BOKA — Predictive Pre-computation (Innowacja #4)
// Agent przewiduje następne pytanie i pre-komputuje odpowiedź
// w tle. Gdy user zapyta coś podobnego — zwraca cached answer.
//
// Flow:
//   1. analyze recent turns + rituals + time of day
//   2. LLM predicts 3 likely next questions
//   3. Pre-compute answers via direct LLM call
//   4. Store as Memory with tags ['precomputed', 'predictive']
//   5. On retrieveMemoryContext() — check cache (Jaccard > 0.7)
//      → return cached answer with "⚡ pre-computed" marker
// ═══════════════════════════════════════════════════════════

import { observe, remember } from './engine';
import { listObservations, listLatestMemories } from './store';
import { jaccardSimilarity } from './engine';
import type { Memory } from './types';

const PREDICTION_SYSTEM_PROMPT = `Jesteś predyktorem intencji w systemie BOKA.

Analizujesz ostatnie rozmowy usera z asystentem, porę dnia i rytuały.
Twoim zadaniem jest przewidzieć 3 pytania które user najpewniej zada w
najbliższych godzinach.

Zasady:
1. Bazuj na powtarzalnych wzorcach (rytuały, poranne/evening rutiny)
2. Uwzględnij porę dnia (rano: pogoda/plany; wieczór: podsumowanie)
3. Bądź konkretny — nie "coś o pogodzie" ale "jaka będzie pogoda jutro"
4. Unikaj pytań które user już zadał w ostatnich turach

ODPOWIEDZ W FORMACIE JSON:
{
  "predictions": [
    {
      "question": "konkretne przewidziane pytanie",
      "confidence": 0.0-1.0,
      "reason": "dlaczego to przewidujesz"
    }
  ]
}

Tylko JSON. Bez markdown.`;

export interface PredictionResult {
  question: string;
  confidence: number;
  reason: string;
}

export interface PrecomputeResult {
  predictions: PredictionResult[];
  precomputed: number;
  cached: Memory[];
}

/**
 * Przewiduj następne pytania usera na podstawie ostatnich tur + rytuałów.
 */
export async function predictNextQuestions(opts: {
  familyId?: string;
  sessionId?: string;
  topK?: number;
}): Promise<PredictionResult[]> {
  const { chatCompletion, loadSettings } = await import('@/lib/ai-providers');
  const settings = loadSettings();

  // Pobierz ostatnie 5 obserwacji z chat session
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const observations = await listObservations({
    familyId: opts.familyId,
    limit: 5,
    since: sevenDaysAgo,
  });

  if (observations.length === 0) return [];

  // Pobierz rytuały z Memory (tag 'ritual' lub type 'workflow')
  const rituals = await listLatestMemories({
    familyId: opts.familyId,
    limit: 10,
  });

  const timeOfDay = new Date().getHours();
  const timeContext =
    timeOfDay < 6 ? 'noc' :
    timeOfDay < 12 ? 'rano' :
    timeOfDay < 18 ? 'popołudnie' :
    timeOfDay < 22 ? 'wieczór' : 'późny wieczór';

  // Zbuduj digest
  const obsDigest = observations.map((o, i) =>
    `[${i + 1}] ${o.title}\n${o.narrative.slice(0, 200)}`,
  ).join('\n\n');

  const ritualDigest = rituals
    .filter(m => m.tags?.includes('ritual') || m.type === 'workflow')
    .map(r => `- ${r.title}`)
    .join('\n') || '(brak rytuałów)';

  const chatMessages: { role: 'system' | 'user'; content: string }[] = [
    { role: 'system', content: PREDICTION_SYSTEM_PROMPT },
    { role: 'user', content:
      `PORA DNIA: ${timeContext}\n` +
      `OSTATNIE ROZMOWY:\n${obsDigest}\n\n` +
      `RYTUAŁY RODZINY:\n${ritualDigest}\n\n` +
      `Przewidź ${opts.topK ?? 3} najpewniejsze następne pytania.`,
    },
  ];

  const raw = await chatCompletion(chatMessages, {
    ...settings,
    maxTokens: 800,
    temperature: 0.4,
  });

  const jsonMatch = raw.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { predictions?: PredictionResult[] };
    return (parsed.predictions ?? []).slice(0, opts.topK ?? 3);
  } catch {
    return [];
  }
}

/**
 * Pre-compute odpowiedzi na przewidziane pytania.
 * Zapisuje jako Memory z tags ['precomputed', 'predictive'].
 */
export async function precomputeAnswers(opts: {
  familyId?: string;
  sessionId?: string;
  topK?: number;
}): Promise<PrecomputeResult> {
  const { chatCompletion, loadSettings } = await import('@/lib/ai-providers');
  const settings = loadSettings();

  const predictions = await predictNextQuestions(opts);
  if (predictions.length === 0) {
    return { predictions: [], precomputed: 0, cached: [] };
  }

  const cached: Memory[] = [];

  for (const pred of predictions) {
    if (pred.confidence < 0.4) continue; // only pre-compute high-confidence predictions

    try {
      // Pre-compute answer via direct LLM call (not full Cockpit — too expensive)
      const answerRaw = await chatCompletion(
        [
          { role: 'system', content: 'Jesteś BOKA — domowym asystentem AI. Odpowiadaj zwięźle i pomocnie po polsku.' },
          { role: 'user', content: pred.question },
        ],
        {
          ...settings,
          maxTokens: 400,
          temperature: 0.5,
        },
      );

      if (!answerRaw?.trim()) continue;

      // Store as Memory with predictive tags
      const memory = await remember({
        content: `Q: ${pred.question}\nA: ${answerRaw.trim()}`,
        type: 'fact',
        concepts: [pred.question.split(' ').slice(0, 3).join(' ')],
        tags: ['precomputed', 'predictive', `conf-${Math.round(pred.confidence * 100)}`],
        project: 'boka-chat-predictive',
        familyId: opts.familyId,
        agentId: 'predictive',
      });
      cached.push(memory);
    } catch (err) {
      console.warn('[predictive] precompute failed for question:', pred.question, err);
    }
  }

  return {
    predictions,
    precomputed: cached.length,
    cached,
  };
}

/**
 * Sprawdź cache predykcyjny dla danego zapytania.
 * Zwraca pre-computed answer jeśli Jaccard similarity > 0.7.
 */
export async function checkPredictiveCache(
  query: string,
  familyId?: string,
): Promise<{ answer: string; question: string; confidence: number } | null> {
  if (!query?.trim() || query.length < 5) return null;

  try {
    // Pobierz pre-computed memories
    const predictive = await listLatestMemories({
      familyId,
      limit: 50,
    });

    const cached = predictive.filter(m =>
      m.tags?.includes('precomputed') && m.tags?.includes('predictive'),
    );

    if (cached.length === 0) return null;

    // Find best match by Jaccard similarity
    let bestMatch: Memory | null = null;
    let bestScore = 0;
    const queryLower = query.toLowerCase();

    for (const m of cached) {
      // Extract original question from "Q: ... \nA: ..." format
      const qMatch = m.content.match(/^Q:\s*([\s\S]+?)\nA:/);
      const storedQuestion = qMatch ? qMatch[1].toLowerCase() : m.content.toLowerCase();
      const score = jaccardSimilarity(queryLower, storedQuestion);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = m;
      }
    }

    // Threshold: Jaccard > 0.4 (lower than supersede 0.7 — we want fuzzy match)
    if (bestMatch && bestScore > 0.4) {
      const answerMatch = bestMatch.content.match(/\nA:\s*([\s\S]+)$/);
      const answer = answerMatch ? answerMatch[1].trim() : bestMatch.content;
      const questionMatch = bestMatch.content.match(/^Q:\s*([\s\S]+?)\nA:/);
      const question = questionMatch ? questionMatch[1].trim() : '';

      // Extract confidence from tags
      const confTag = bestMatch.tags?.find(t => t.startsWith('conf-'));
      const confidence = confTag ? parseInt(confTag.replace('conf-', ''), 10) / 100 : 0.5;

      return { answer, question, confidence };
    }

    return null;
  } catch (err) {
    console.warn('[predictive] cache check failed:', err);
    return null;
  }
}
