// ═══════════════════════════════════════════════════════════
// BOKA OS — CrewAI-inspired Crew Member Service
// ═══════════════════════════════════════════════════════════
//
// Źródło: github.com/crewAIInc/crewAI
// Adaptacja: każdy FamilyMember ma CrewMember profile (role, goal, backstory)
// generowane z MemberProfile (psychology) + FamilyMember.role.
//
// Manager Agent ewaluuje cotygodniowo → aktualizuje role/backstory.
// Rytuały mogą być uruchamiane jako Crew (sequential task execution).
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { chatCompletion } from '@/lib/ai-providers';

// ── Typy ───────────────────────────────────

export interface CrewMemberProfile {
  memberId: string;
  role: string;
  goal: string;
  backstory: string;
  evaluationScore?: number;
  evaluationNotes?: string;
  lastEvaluatedAt?: Date;
}

export interface CrewTask {
  description: string;
  expectedOutput: string;
  assignedTo: string;  // memberId
}

export interface CrewResult {
  results: Array<{ memberId: string; role: string; output: string }>;
  finalSynthesis: string;
}

// ── Generowanie profilu crew z MemberProfile ──

const CREW_GEN_PROMPT = `Generujesz profil "crew member" dla agenta reprezentującego domownika.

DANE DOMOWNIKA:
- Imię: {NAME}
- Rola w rodzinie: {ROLE}
- Wiek: {AGE}
- Profil psychologiczny: {PSYCHOLOGY}

Zwróć WYŁĄCZNIE JSON:
{{
  "role": "krótka rola w crew, po polsku (np. 'opiekun finansów', 'główny uczeń')",
  "goal": "główny cel tego agenta w 1 zdaniu",
  "backstory": "2-3 zdania backstory po polsku — kim jest, co go ciekawi, jaki ma styl"
}}`;

export async function generateCrewProfile(
  memberId: string
): Promise<CrewMemberProfile> {
  const member = await db.familyMember.findUnique({
    where: { id: memberId },
    include: { profiles: true },
  });

  if (!member) throw new Error('Member nie znaleziony');

  const psychology = member.profiles.find(p => p.domain === 'psychology');
  const psychData = psychology ? JSON.parse(psychology.data) : {};

  const prompt = CREW_GEN_PROMPT
    .replace('{NAME}', member.name)
    .replace('{ROLE}', member.role)
    .replace('{AGE}', String(member.age))
    .replace('{PSYCHOLOGY}', JSON.stringify(psychData));

  const resp = await chatCompletion([
    { role: 'system', content: 'Generujesz profile crew. Zwracasz WYŁĄCZNIE JSON.' },
    { role: 'user', content: prompt },
  ]);

  const match = resp.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM nie zwrócił JSON');
  const parsed = JSON.parse(match[0]);

  // Upsert CrewMember
  const existing = await db.crewMember.findUnique({ where: { memberId } });
  if (existing) {
    return db.crewMember.update({
      where: { memberId },
      data: {
        role: parsed.role,
        goal: parsed.goal,
        backstory: parsed.backstory,
      },
    }) as any;
  }
  return db.crewMember.create({
    data: {
      familyId: member.familyId,
      memberId,
      role: parsed.role,
      goal: parsed.goal,
      backstory: parsed.backstory,
    },
  }) as any;
}

// ── Pobierz crew members ───────────────────

export async function getCrewMembers(familyId: string): Promise<CrewMemberProfile[]> {
  const members = await db.crewMember.findMany({
    where: { familyId },
  });

  return members.map(m => ({
    memberId: m.memberId,
    role: m.role,
    goal: m.goal,
    backstory: m.backstory,
    evaluationScore: m.evaluationScore ?? undefined,
    evaluationNotes: m.evaluationNotes ?? undefined,
    lastEvaluatedAt: m.lastEvaluatedAt ?? undefined,
  }));
}

export async function getCrewMember(memberId: string): Promise<CrewMemberProfile | null> {
  const m = await db.crewMember.findUnique({ where: { memberId } });
  if (!m) return null;
  return {
    memberId: m.memberId,
    role: m.role,
    goal: m.goal,
    backstory: m.backstory,
    evaluationScore: m.evaluationScore ?? undefined,
    evaluationNotes: m.evaluationNotes ?? undefined,
    lastEvaluatedAt: m.lastEvaluatedAt ?? undefined,
  };
}

// ── Manager Agent evaluation ──────────────

const MANAGER_EVAL_PROMPT = `Jesteś Manager Agentem BOKA. Ewaluujesz działanie crew member.

Crew Member:
- Rola: {ROLE}
- Cel: {GOAL}
- Backstory: {BACKSTORY}

Ostatnie interakcje (z ostatniego tygodnia):
{INTERACTIONS}

Zwróć JSON:
{{
  "score": 0.0-1.0,
  "notes": "co poprawić, co dobrze",
  "suggestedRoleUpdate": "nowa rola lub null jeśli bez zmian",
  "suggestedGoalUpdate": "nowy cel lub null"
}}`;

export async function evaluateCrewMember(
  memberId: string,
  recentInteractions: string
): Promise<{
  score: number;
  notes: string;
  suggestedRoleUpdate?: string;
  suggestedGoalUpdate?: string;
}> {
  const crew = await getCrewMember(memberId);
  if (!crew) throw new Error('Brak crew member');

  const prompt = MANAGER_EVAL_PROMPT
    .replace('{ROLE}', crew.role)
    .replace('{GOAL}', crew.goal)
    .replace('{BACKSTORY}', crew.backstory)
    .replace('{INTERACTIONS}', recentInteractions.slice(0, 2000));

  const resp = await chatCompletion([
    { role: 'system', content: 'Manager Agent. Zwracasz WYŁĄCZNIE JSON.' },
    { role: 'user', content: prompt },
  ]);

  const match = resp.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM nie zwrócił JSON');

  const parsed = JSON.parse(match[0]);

  await db.crewMember.update({
    where: { memberId },
    data: {
      evaluationScore: parsed.score ?? 0.5,
      evaluationNotes: JSON.stringify(parsed),
      lastEvaluatedAt: new Date(),
      ...(parsed.suggestedRoleUpdate ? { role: parsed.suggestedRoleUpdate } : {}),
      ...(parsed.suggestedGoalUpdate ? { goal: parsed.suggestedGoalUpdate } : {}),
    },
  });

  return parsed;
}

// ── Run crew (sequential task execution) ──

export async function runCrewTasks(
  familyId: string,
  tasks: CrewTask[],
  context?: string
): Promise<CrewResult> {
  const results: Array<{ memberId: string; role: string; output: string }> = [];

  for (const task of tasks) {
    const crew = await getCrewMember(task.assignedTo);
    if (!crew) {
      results.push({
        memberId: task.assignedTo,
        role: 'unknown',
        output: `[Brak crew member]`,
      });
      continue;
    }

    const taskPrompt = `Jesteś agentem w crew rodziny.
Twoja rola: ${crew.role}
Twój cel: ${crew.goal}
Twoja historia: ${crew.backstory}

${context ? `Kontekst: ${context}\n\n` : ''}Zadanie: ${task.description}
Oczekiwany wynik: ${task.expectedOutput}

Twoja odpowiedź:`;

    let output: string;
    try {
      output = await chatCompletion([
        { role: 'system', content: 'Mówisz po polsku. Zachowujesz swoją rolę crew.' },
        { role: 'user', content: taskPrompt },
      ]);
    } catch (e: any) {
      output = `[Błąd: ${e.message}]`;
    }

    results.push({
      memberId: task.assignedTo,
      role: crew.role,
      output,
    });
  }

  // Final synthesis (Manager Agent style)
  let finalSynthesis = '';
  if (results.length > 1) {
    const synthPrompt = `Jesteś Manager Agentem. Syntetyzuj wyniki crew w jedną odpowiedź.

${results.map(r => `[${r.role}]: ${r.output}`).join('\n\n')}

Połącz w spójną odpowiedź po polsku:`;
    try {
      finalSynthesis = await chatCompletion([
        { role: 'system', content: 'Syntetyzujesz. Po polsku.' },
        { role: 'user', content: synthPrompt },
      ]);
    } catch {
      finalSynthesis = results.map(r => r.output).join('\n\n');
    }
  } else {
    finalSynthesis = results[0]?.output || '';
  }

  return { results, finalSynthesis };
}
