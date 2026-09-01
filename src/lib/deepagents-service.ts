// ═══════════════════════════════════════════════════════════
// BOKA OS — DeepAgents Service (todo-plan + vestibule + subagents)
// ═══════════════════════════════════════════════════════════
//
// Źródło: github.com/langchain-ai/deepagents
// Adaptacja: BOKA utrzymuje widoczny plan dnia/tygodnia + zrzuca
// długie konteksty do ContextBlob (vestibule filesystem).
// ReflectionSubagent czyta wykonane plany → generuje ImprovementLog.
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { chatCompletion } from '@/lib/ai-providers';

// ── Typy ───────────────────────────────────

export interface PlanStep {
  id: string;
  text: string;
  status: 'pending' | 'in_progress' | 'done' | 'skipped';
  createdAt: string;
  completedAt?: string;
  note?: string;
}

export interface CreatePlanParams {
  familyId: string;
  memberId?: string;
  title: string;
  scope?: 'daily' | 'weekly' | 'monthly' | 'adhoc';
  steps: string[];
}

export interface Plan {
  id: string;
  familyId: string;
  memberId: string | null;
  title: string;
  scope: string;
  status: string;
  steps: PlanStep[];
  reflectionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Plan CRUD ─────────────────────────────

export async function createPlan(params: CreatePlanParams): Promise<Plan> {
  const steps: PlanStep[] = params.steps.map((text, i) => ({
    id: `step_${i + 1}_${Date.now()}`,
    text,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  }));

  const plan = await db.bokaPlan.create({
    data: {
      familyId: params.familyId,
      memberId: params.memberId || null,
      title: params.title,
      scope: params.scope || 'daily',
      steps: JSON.stringify(steps),
      status: 'active',
    },
  });

  return { ...plan, steps } as Plan;
}

export async function getPlans(
  familyId: string,
  memberId?: string,
  status?: string
): Promise<Plan[]> {
  const where: any = { familyId };
  if (memberId) where.memberId = memberId;
  if (status) where.status = status;

  const plans = await db.bokaPlan.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return plans.map(p => ({ ...p, steps: JSON.parse(p.steps || '[]') })) as Plan[];
}

export async function getPlan(planId: string): Promise<Plan | null> {
  const plan = await db.bokaPlan.findUnique({ where: { id: planId } });
  if (!plan) return null;
  return { ...plan, steps: JSON.parse(plan.steps || '[]') } as Plan;
}

export async function updatePlanStep(
  planId: string,
  stepId: string,
  updates: Partial<PlanStep>
): Promise<Plan> {
  const plan = await getPlan(planId);
  if (!plan) throw new Error('Plan nie znaleziony');

  const newSteps = plan.steps.map(s =>
    s.id === stepId
      ? {
          ...s,
          ...updates,
          ...(updates.status === 'done' || updates.status === 'skipped'
            ? { completedAt: new Date().toISOString() }
            : {}),
        }
      : s
  );

  // Jeśli wszystkie kroki zrobione → archiwizuj plan
  const allDone = newSteps.every(s => s.status === 'done' || s.status === 'skipped');

  const updated = await db.bokaPlan.update({
    where: { id: planId },
    data: {
      steps: JSON.stringify(newSteps),
      status: allDone ? 'completed' : 'active',
    },
  });

  // Jeśli plan zakończony, uruchom ReflectionSubagent asynchronicznie
  if (allDone) {
    runReflectionSubagent(planId).catch(e => console.error('[reflection]', e));
  }

  return { ...updated, steps: newSteps } as Plan;
}

// ── Vestibule: ContextBlob management ────

export interface OffloadContextParams {
  familyId: string;
  memberId?: string;
  kind: 'conversation_excerpt' | 'memory_dump' | 'tool_output' | 'research_notes';
  title?: string;
  content: string;
  tags?: string[];
  summarize?: boolean; // default true
  ttlHours?: number;
}

export async function offloadContext(params: OffloadContextParams): Promise<{
  blobId: string;
  summary: string | null;
  tokenCount: number;
}> {
  const tokenCount = Math.ceil(params.content.length / 4);

  let summary: string | null = null;
  if (params.summarize !== false && tokenCount > 200) {
    try {
      summary = await chatCompletion([
        { role: 'system', content: 'Stwórz 1-zdaniowe podsumowanie kontekstu. Po polsku.' },
        { role: 'user', content: params.content.slice(0, 4000) },
      ]);
    } catch {
      summary = null;
    }
  }

  const blob = await db.contextBlob.create({
    data: {
      familyId: params.familyId,
      memberId: params.memberId || null,
      kind: params.kind,
      title: params.title || null,
      content: params.content,
      tokenCount,
      summary,
      tags: JSON.stringify(params.tags || []),
      expiresAt: params.ttlHours
        ? new Date(Date.now() + params.ttlHours * 3600 * 1000)
        : null,
    },
  });

  return { blobId: blob.id, summary, tokenCount };
}

export async function recallContext(blobId: string): Promise<{
  content: string;
  summary: string | null;
  title: string | null;
} | null> {
  const blob = await db.contextBlob.findUnique({ where: { id: blobId } });
  if (!blob) return null;

  // Update access tracking
  await db.contextBlob.update({
    where: { id: blobId },
    data: {
      accessCount: blob.accessCount + 1,
      lastAccessedAt: new Date(),
    },
  });

  return { content: blob.content, summary: blob.summary, title: blob.title };
}

export async function listContextBlobs(
  familyId: string,
  filter?: { kind?: string; memberId?: string }
): Promise<any[]> {
  const where: any = { familyId };
  if (filter?.kind) where.kind = filter.kind;
  if (filter?.memberId) where.memberId = filter.memberId;

  return db.contextBlob.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      title: true,
      summary: true,
      kind: true,
      tokenCount: true,
      tags: true,
      accessCount: true,
      createdAt: true,
    },
  });
}

// ── ReflectionSubagent ────────────────────

const REFLECTION_PROMPT = `Jesteś ReflectionSubagent BOKA. Analizujesz zakończony plan i generujesz notatki reflksyjne.

PLAN:
Tytuł: {TITLE}
Kroki:
{STEPS}

Zwróć JSON:
{{
  "reflection": "2-3 zdania po polsku: co poszło dobrze, co można poprawić",
  "improvementProposal": {{
    "type": "skill_proposal" | "personality_adjustment" | "problem_report",
    "description": "konkretna sugestia",
    "evidence": "krótki dowód z wykonania planu"
  }}
}}`;

async function runReflectionSubagent(planId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) return;

  const stepsText = plan.steps
    .map(s => `[${s.status}] ${s.text}${s.note ? ` — ${s.note}` : ''}`)
    .join('\n');

  const prompt = REFLECTION_PROMPT
    .replace('{TITLE}', plan.title)
    .replace('{STEPS}', stepsText);

  try {
    const resp = await chatCompletion([
      { role: 'system', content: 'Reflection subagent. Zwracasz WYŁĄCZNIE JSON.' },
      { role: 'user', content: prompt },
    ]);

    const match = resp.match(/\{[\s\S]*\}/);
    let reflection = resp;
    let improvementProposal: any = null;

    if (match) {
      const parsed = JSON.parse(match[0]);
      reflection = parsed.reflection || resp;
      improvementProposal = parsed.improvementProposal || null;
    }

    // Zapisz refleksję do planu
    await db.bokaPlan.update({
      where: { id: planId },
      data: { reflectionNotes: reflection },
    });

    // Jeśli jest improvement proposal → dodaj do ImprovementLog
    if (improvementProposal && improvementProposal.description) {
      await db.improvementLog.create({
        data: {
          familyId: plan.familyId,
          type: improvementProposal.type || 'problem_report',
          description: improvementProposal.description,
          evidence: JSON.stringify(improvementProposal.evidence || {}),
          proposal: JSON.stringify({ planId, reflection }),
          status: 'pending',
        },
      });
    }
  } catch (e: any) {
    console.error('[reflection] error:', e.message);
  }
}
