// ═══════════════════════════════════════════════════════════
// BOKA — Audit Service (v0.3.17 — Privacy Layer)
// Każda decyzja agenta jest logowana. User może zobaczyć "Dlaczego?".
// ═══════════════════════════════════════════════════════════

import { prisma } from './db';
import { chatCompletion, loadSettings } from './ai-providers';

// ── Types ────────────────────────────────────
export interface AuditEntry {
  familyId: string;
  agentId?: string;
  messageId?: string;
  conversationId?: string;
  action: string;
  category: AuditCategory;
  reasoning: string;
  inputSummary?: string;
  outputSummary?: string;
  riskLevel?: AuditRisk;
  contextJson?: any;
  forgettable?: boolean;
}

export type AuditCategory =
  | 'memory'
  | 'tool_use'
  | 'vision'
  | 'home_automation'
  | 'proactivity'
  | 'guardrail'
  | 'privacy'
  | 'communication';

export type AuditRisk = 'info' | 'low' | 'medium' | 'high' | 'critical';

// ── Log decision ─────────────────────────────
// Centralny punkt logowania każdej decyzji BOKI.
// Synchroniczne — log musi zostać zapisany zanim agent odpowie userowi.
export async function logDecision(entry: AuditEntry): Promise<string> {
  try {
    const log = await prisma.auditLog.create({
      data: {
        familyId: entry.familyId,
        agentId: entry.agentId ?? null,
        messageId: entry.messageId ?? null,
        conversationId: entry.conversationId ?? null,
        action: entry.action,
        category: entry.category,
        reasoning: entry.reasoning,
        inputSummary: entry.inputSummary ?? null,
        outputSummary: entry.outputSummary ?? null,
        riskLevel: entry.riskLevel ?? 'info',
        contextJson: entry.contextJson ? JSON.stringify(entry.contextJson) : null,
        forgettable: entry.forgettable ?? true,
      },
    });
    return log.id;
  } catch (e) {
    console.error('[audit] logDecision failed:', e);
    return '';
  }
}

// ── Get audit log with filters ───────────────
export async function getAuditLog(filters: {
  familyId: string;
  agentId?: string;
  category?: AuditCategory;
  riskLevel?: AuditRisk;
  conversationId?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}): Promise<{
  entries: Array<{
    id: string;
    agentId: string | null;
    action: string;
    category: string;
    reasoning: string;
    inputSummary: string | null;
    outputSummary: string | null;
    riskLevel: string;
    createdAt: Date;
    forgottenAt: Date | null;
  }>;
  total: number;
}> {
  const where: any = { familyId: filters.familyId };
  if (filters.agentId) where.agentId = filters.agentId;
  if (filters.category) where.category = filters.category;
  if (filters.riskLevel) where.riskLevel = filters.riskLevel;
  if (filters.conversationId) where.conversationId = filters.conversationId;
  if (filters.since || filters.until) {
    where.createdAt = {};
    if (filters.since) where.createdAt.gte = filters.since;
    if (filters.until) where.createdAt.lte = filters.until;
  }

  const limit = Math.min(filters.limit ?? 100, 500);
  const offset = filters.offset ?? 0;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total };
}

// ── Get single audit entry with full context ─
export async function getAuditEntry(id: string, familyId: string) {
  const entry = await prisma.auditLog.findFirst({
    where: { id, familyId },
  });
  if (!entry) return null;
  return {
    ...entry,
    contextJson: entry.contextJson ? JSON.parse(entry.contextJson) : null,
  };
}

// ── Get recent decisions for chat sidebar ────
// Zwraca ostatnie N decyzji związanych z konkretną rozmową.
export async function getDecisionsForConversation(
  conversationId: string,
  familyId: string,
  limit = 20,
) {
  return prisma.auditLog.findMany({
    where: { conversationId, familyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ── LLM Reasoning generator ──────────────────
// Gdy agent nie ma jawnego reasoning, generujemy go post-hoc z LLM.
export async function generateReasoning(params: {
  agentId: string;
  action: string;
  inputSummary: string;
  outputSummary: string;
}): Promise<string> {
  try {
    const settings = loadSettings();
    const prompt = `Jesteś BOKA — asystent AI. Wytłumacz krótko (1-2 zdania po polsku) DLACZEGO podjęłaś tę decyzję.

Agent: ${params.agentId}
Akcja: ${params.action}
Wejście: ${params.inputSummary}
Wynik: ${params.outputSummary}

Odpowiedz tylko reasoning, bez wstępu. Przykład: "User zapytał o pogodę, więc przeszukałam pamięć i znalazłam ostatnie wspomnienie o deszczu."`;

    const reasoning = await chatCompletion(
      [
        { role: 'system', content: 'Jesteś BOKA. Tłumaczysz swoje decyzje po polsku.' },
        { role: 'user', content: prompt },
      ],
      settings,
    );
    return reasoning.trim();
  } catch (e) {
    return 'Decyzja podjęta automatycznie.';
  }
}

// ── Soft-delete audit entries (Forget API) ───
export async function softDeleteAuditEntries(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await prisma.auditLog.updateMany({
    where: { id: { in: ids }, forgettable: true },
    data: { forgottenAt: new Date() },
  });
  return result.count;
}

// ── Hard-delete forgotten entries (scheduled) ─
// Wywoływane przez cron — usuwa trwale wpisy zapomniane >30 dni temu.
export async function hardDeleteOldForgotten(days = 30): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({
    where: { forgottenAt: { not: null, lt: cutoff } },
  });
  return result.count;
}

// ── Audit stats for Consent Dashboard ────────
export async function getAuditStats(familyId: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [byCategory, byRisk, total, forgotten] = await Promise.all([
    prisma.auditLog.groupBy({
      by: ['category'],
      where: { familyId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.auditLog.groupBy({
      by: ['riskLevel'],
      where: { familyId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.auditLog.count({
      where: { familyId, createdAt: { gte: since } },
    }),
    prisma.auditLog.count({
      where: { familyId, forgottenAt: { not: null } },
    }),
  ]);

  return {
    total,
    forgotten,
    byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r._count._all])),
    byRisk: Object.fromEntries(byRisk.map((r) => [r.riskLevel, r._count._all])),
    days,
  };
}
