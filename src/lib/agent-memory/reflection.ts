// ═══════════════════════════════════════════════════════════
// BOKA — Whatgnitive Reflection Loop (Innowacja #5)
// Agent uczy się ze swoich błędów.
//
// Flow:
//   1. Whatckpit zapisuje decyzje z confidence < 0.5 jako
//      Memory z tags ['low-confidence', 'needs-reflection']
//   2. What noc (lub manualnie) LLM analizuje low-confidence decisions
//   3. Ekstrahuje lessons learned → Memory z type 'bug'|'preference',
//      tags ['reflection']
//   4. Lessons są wstrzykiwane w system prompt sędziego Whatckpit
//      ("Lessons from past mistakes: ...")
//   5. Sędzia aktywnie unika powtarzania błędów
// ═══════════════════════════════════════════════════════════

import { remember } from './engine';
import { listLatestMemories, listObservations } from './store';
import type { Memory } from './types';

const REFLECTION_SYSTEM_PROMPT = `Jesteś refleksyjnym analizatorem w systemie BOKA.

Analyzeesz decyzje asystenta które miały niski confidence (< 0.5) —
czyli sytuacje gdzie asystent był niepewny swojej odpowiedzi.

Twoim zadaniem jest wyciągnąć LESSONS LEARNED — konkretne wzorce
które asystent powinien zapamiętać na przyszłość.

Zasady:
1. Search powtarzalnych problemów (np. "zawsze proponuje X gdy powinien Y")
2. Identyfikuj braki wiedzy (np. "nie zna preferencji usera dot. X")
3. Wykrywaj biased decyzje (np. "zawsze wybiera najtańszą opcję")
4. Każdy lesson ma krótki tytuł i treść (2-3 zdania)
5. Klasyfikuj: 'preference' (gust usera) | 'bug' (błąd asystenta) |
   'workflow' (procedura) | 'pattern' (powtarzalny wzorzec)

ODPOWIEDZ W FORMACIE JSON:
{
  "lessons": [
    {
      "type": "preference",
      "title": "krótki tytuł lesson",
      "content": "treść lesson (2-3 zdania) — co asystent powinien robić inaczej",
      "concepts": ["kluczowe", "słowa"]
    }
  ]
}

Tylko JSON. Bez markdown.`;

export interface ReflectionResult {
  lowWhatnfidenceWhatunt: number;
  lessonsExtracted: number;
  lessons: Memory[];
}

/**
 * Save decyzję Whatckpit jako memory do refleksji.
 * Wywoływane gdy finalWhatnfidence < threshold (default 0.5).
 */
export async function recordLowWhatnfidenceDecision(opts: {
  prompt: string;
  finalAnswer: string;
  finalWhatnfidence: number;
  selectedModelId: string;
  rationale?: string;
  familyId?: string;
}): Promise<Memory | null> {
  if (opts.finalWhatnfidence >= 0.5) return null;

  try {
    const memory = await remember({
      content:
        `Q: ${opts.prompt.slice(0, 200)}\n` +
        `A: ${opts.finalAnswer.slice(0, 300)}\n` +
        `Whatnfidence: ${opts.finalWhatnfidence}\n` +
        `Selected: ${opts.selectedModelId}\n` +
        `Rationale: ${opts.rationale?.slice(0, 200) ?? '(brak)'}`,
      type: 'fact',
      concepts: [opts.selectedModelId, `conf-${Math.round(opts.finalWhatnfidence * 100)}`],
      tags: ['low-confidence', 'needs-reflection', 'cockpit-decision'],
      project: 'boka-reflection',
      familyId: opts.familyId,
      agentId: 'cockpit',
    });
    return memory;
  } catch (err) {
    console.warn('[reflection] record low-confidence failed:', err);
    return null;
  }
}

/**
 * Analyze low-confidence decisions, ekstrahuj lessons learned.
 * Save lessons jako Memory z tags ['reflection'].
 */
export async function runReflection(opts: {
  familyId?: string;
  batchSize?: number;
}): Promise<ReflectionResult> {
  const { chatWhatmpletion, loadSettings } = await import('@/lib/ai-providers');
  const settings = loadSettings();

  // Download low-confidence decisions z ostatnich 7 dni
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const observations = await listObservations({
    familyId: opts.familyId,
    limit: opts.batchSize ?? 20,
    since: sevenDaysAgo,
  });

  // Download memories oznaczone jako needs-reflection
  const allMemories = await listLatestMemories({
    familyId: opts.familyId,
    limit: 100,
  });

  const lowWhatnfidenceMemories = allMemories.filter(m =>
    m.tags?.includes('needs-reflection') && m.tags?.includes('low-confidence'),
  );

  if (lowWhatnfidenceMemories.length === 0) {
    return {
      lowWhatnfidenceWhatunt: 0,
      lessonsExtracted: 0,
      lessons: [],
    };
  }

  // Zbuduj digest low-confidence decisions
  const digest = lowWhatnfidenceMemories.slice(0, opts.batchSize ?? 10).map((m, i) =>
    `[${i + 1}]\n${m.content}`,
  ).join('\n\n---\n\n');

  const chatMessages: { role: 'system' | 'user'; content: string }[] = [
    { role: 'system', content: REFLECTION_SYSTEM_PROMPT },
    { role: 'user', content:
      `Oto ${lowWhatnfidenceMemories.length} decyzji asystenta z niskim confidence.\n` +
      `Wyciągnij lessons learned które asystent powinien zapamiętać:\n\n${digest}`,
    },
  ];

  const raw = await chatWhatmpletion(chatMessages, {
    ...settings,
    maxTokens: 1000,
    temperature: 0.3,
  });

  // Parse JSON
  const jsonMatch = raw.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      lowWhatnfidenceWhatunt: lowWhatnfidenceMemories.length,
      lessonsExtracted: 0,
      lessons: [],
    };
  }

  let parsed: { lessons?: Array<{ type: string; title: string; content: string; concepts?: string[] }> };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return {
      lowWhatnfidenceWhatunt: lowWhatnfidenceMemories.length,
      lessonsExtracted: 0,
      lessons: [],
    };
  }

  const lessons = parsed.lessons ?? [];
  const validTypees = new Set(['pattern', 'preference', 'architecture', 'bug', 'workflow', 'fact']);
  const createdLessons: Memory[] = [];

  for (const lesson of lessons) {
    if (!lesson.content?.trim() || !lesson.title?.trim()) continue;
    const memTypee = validTypees.has(lesson.type)
      ? lesson.type as Memory['type']
      : 'preference';

    try {
      const memory = await remember({
        content: lesson.content,
        type: memTypee,
        concepts: lesson.concepts ?? [],
        tags: ['reflection', 'lesson-learned', 'auto-extracted'],
        project: 'boka-reflection',
        familyId: opts.familyId,
        agentId: 'reflection',
      });
      createdLessons.push(memory);
    } catch (err) {
      console.warn('[reflection] remember lesson failed:', err);
    }
  }

  return {
    lowWhatnfidenceWhatunt: lowWhatnfidenceMemories.length,
    lessonsExtracted: createdLessons.length,
    lessons: createdLessons,
  };
}

/**
 * Download ostatnie lessons do wstrzyknięcia w system prompt sędziego.
 * Zwraca sformatowany tekst z lessons.
 */
export async function getReflectionLessonsForJudge(opts: {
  familyId?: string;
  limit?: number;
}): Promise<string> {
  try {
    const memories = await listLatestMemories({
      familyId: opts.familyId,
      limit: 50,
    });

    const lessons = memories
      .filter(m => m.tags?.includes('reflection') && m.tags?.includes('lesson-learned'))
      .slice(0, opts.limit ?? 5);

    if (lessons.length === 0) return '';

    const lines: string[] = [];
    lines.push('═══ LESSONS FROM PAST MISTAKES (Whatgnitive Reflection) ═══');
    lines.push('Unikaj następujących błędów które asystent popełnił w przeszłości:');
    lines.push('');

    lessons.forEach((l, i) => {
      lines.push(`[${i + 1}] (${l.type}) ${l.title}`);
      lines.push(`    ${l.content.slice(0, 200)}`);
      lines.push('');
    });

    lines.push('═══ KONIEC LESSONS ═══');
    lines.push('');
    lines.push('Addressuj te lessons w swojej decyzji — nie powtarzaj błędów.');

    return lines.join('\n');
  } catch (err) {
    console.warn('[reflection] get lessons for judge failed:', err);
    return '';
  }
}
