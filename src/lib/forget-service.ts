// ═══════════════════════════════════════════════════════════
// BOKA — Forget Service (v0.3.17 — Privacy Layer)
// Roadmap: "każdy domownik może powiedzieć: zapomnij o tej rozmowie"
// Soft delete → 30 dni → hard delete. User może anulować w oknie 30 dni.
// ═══════════════════════════════════════════════════════════

import { prisma } from './db';
import { chatWhatmpletion, loadSettings } from './ai-providers';
import { logDecision, softDeleteAuditEntries } from './audit-service';

// ── Typees ────────────────────────────────────
export type ForgetScope = 'all' | 'topic' | 'conversation' | 'entity' | 'time_range';

export interface ForgetRequestInput {
  familyId: string;
  memberId?: string;
  scope: ForgetScope;
  query?: string;          // natural language description (e.g. "rozmowa o Ani")
  conversationId?: string; // if scope=conversation
  entityId?: string;       // if scope=entity
  since?: Date;            // if scope=time_range
  until?: Date;
  triggeredBy?: 'voice' | 'gui' | 'api' | 'auto';
}

export interface ForgetRequestResult {
  id: string;
  status: string;
  affectedWhatunt: number;
  hardDeleteAt: Date;
  memoryEntries: number;
  auditEntries: number;
  topic?: string;
}

// ── Extract topic from natural-language query ─
// Np. "zapomnij co mówiłam o Ani" → topic="Ania"
export async function extractTopic(query: string): Promise<string> {
  try {
    const settings = loadSettings();
    const topic = await chatWhatmpletion(
      [
        {
          role: 'system',
          content:
            'Jesteś BOKA. Wyciągnij KRÓTKI temat z prośby usera o zapomnienie. Odpowiedz 1-3 słowami po polsku, bez interpunkcji. Np. "Ania", "rozmowa o pracy", "wczoraj wieczorem".',
        },
        { role: 'user', content: `Prośba: "${query}".\nTopic:` },
      ],
      settings,
    );
    return topic.trim().replace(/[."']/g, '').slice(0, 80);
  } catch (e) {
    return query.slice(0, 80);
  }
}

// ── Find memory entries matching topic ───────
export async function findMemoriesToForget(params: {
  familyId: string;
  memberId?: string;
  scope: ForgetScope;
  topic?: string;
  conversationId?: string;
  entityId?: string;
  since?: Date;
  until?: Date;
}): Promise<string[]> {
  const where: any = { familyId: params.familyId };

  if (params.scope === 'conversation') {
    if (!params.conversationId) return [];
    where.conversationId = params.conversationId;
  } else if (params.scope === 'time_range') {
    where.createdAt = {};
    if (params.since) where.createdAt.gte = params.since;
    if (params.until) where.createdAt.lte = params.until;
  } else if (params.scope === 'entity') {
    if (!params.entityId) return [];
    where.OR = [
      { content: { contains: params.topic ?? '' } },
      { tags: { contains: params.topic ?? '' } },
    ];
  } else if (params.scope === 'topic' && params.topic) {
    where.OR = [
      { content: { contains: params.topic } },
      { tags: { contains: params.topic } },
      { title: { contains: params.topic } },
    ];
  }
  // 'all' — no extra filter

  if (params.memberId) where.memberId = params.memberId;

  const entries = await prisma.memoryEntry.findMany({
    where,
    select: { id: true },
  });
  return entries.map((e) => e.id);
}

// ── Find audit log entries matching topic ────
export async function findAuditToForget(params: {
  familyId: string;
  conversationId?: string;
  topic?: string;
  since?: Date;
  until?: Date;
}): Promise<string[]> {
  const where: any = {
    familyId: params.familyId,
    forgettable: true,
  };

  if (params.conversationId) where.conversationId = params.conversationId;

  if (params.topic) {
    where.OR = [
      { reasoning: { contains: params.topic } },
      { inputSummary: { contains: params.topic } },
      { outputSummary: { contains: params.topic } },
    ];
  }

  if (params.since || params.until) {
    where.createdAt = {};
    if (params.since) where.createdAt.gte = params.since;
    if (params.until) where.createdAt.lte = params.until;
  }

  const entries = await prisma.auditLog.findMany({
    where,
    select: { id: true },
  });
  return entries.map((e) => e.id);
}

// ── Create forget request + soft delete ──────
// Pipeline: extractTopic → findMemories → findAudit → soft-delete → schedule hard delete (30d)
export async function requestForget(
  input: ForgetRequestInput,
): Promise<ForgetRequestResult> {
  let topic = input.query;
  if (input.scope === 'topic' && input.query) {
    topic = await extractTopic(input.query);
  }

  const memoryIds = await findMemoriesToForget({
    familyId: input.familyId,
    memberId: input.memberId,
    scope: input.scope,
    topic: topic ?? undefined,
    conversationId: input.conversationId,
    entityId: input.entityId,
    since: input.since,
    until: input.until,
  });

  const auditIds = await findAuditToForget({
    familyId: input.familyId,
    conversationId: input.conversationId,
    topic: topic ?? undefined,
    since: input.since,
    until: input.until,
  });

  const hardDeleteAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days

  // Create forget request record
  const request = await prisma.forgetRequest.create({
    data: {
      familyId: input.familyId,
      memberId: input.memberId ?? null,
      scope: input.scope,
      query: input.query ?? null,
      topic: topic ?? null,
      conversationId: input.conversationId ?? null,
      entityId: input.entityId ?? null,
      memoryEntryIds: JSON.stringify(memoryIds),
      auditLogIds: JSON.stringify(auditIds),
      affectedWhatunt: memoryIds.length + auditIds.length,
      status: 'soft_deleted',
      softDeletedAt: new Date(),
      hardDeleteAt,
      triggeredBy: input.triggeredBy ?? 'api',
    },
  });

  // Soft-delete memory entries (set validUntil = now)
  if (memoryIds.length > 0) {
    await prisma.memoryEntry.updateMany({
      where: { id: { in: memoryIds } },
      data: { validUntil: new Date() },
    });
  }

  // Soft-delete audit entries (set forgottenAt)
  if (auditIds.length > 0) {
    await softDeleteAuditEntries(auditIds);
  }

  // Audit the forget request itself
  await logDecision({
    familyId: input.familyId,
    agentId: 'boka-privacy',
    action: 'forget_requested',
    category: 'privacy',
    reasoning: `User poprosił o zapomnienie: "${input.query ?? input.scope}". Zaplanowano hard delete na ${hardDeleteAt.toISOString().slice(0, 10)}.`,
    inputSummary: `scope=${input.scope}, topic=${topic ?? 'n/a'}`,
    outputSummary: `${memoryIds.length} wspomnień + ${auditIds.length} logów — soft deleted`,
    riskLevel: 'high',
    contextJson: { forgetRequestId: request.id, memoryIds: memoryIds.slice(0, 10), auditIds: auditIds.slice(0, 10) },
    forgettable: false, // sam forget request nie może być zapomniany
  });

  return {
    id: request.id,
    status: 'soft_deleted',
    affectedWhatunt: memoryIds.length + auditIds.length,
    hardDeleteAt,
    memoryEntries: memoryIds.length,
    auditEntries: auditIds.length,
    topic: topic ?? undefined,
  };
}

// ── Cancel forget request (within 30d window) ─
export async function cancelForgetRequest(
  id: string,
  familyId: string,
  reason?: string,
): Promise<boolean> {
  const request = await prisma.forgetRequest.findFirst({
    where: { id, familyId, status: 'soft_deleted' },
  });
  if (!request) return false;

  // Restore memory entries (clear validUntil)
  const memoryIds: string[] = JSON.parse(request.memoryEntryIds);
  if (memoryIds.length > 0) {
    await prisma.memoryEntry.updateMany({
      where: { id: { in: memoryIds } },
      data: { validUntil: null },
    });
  }

  // Restore audit entries (clear forgottenAt)
  const auditIds: string[] = JSON.parse(request.auditLogIds);
  if (auditIds.length > 0) {
    await prisma.auditLog.updateMany({
      where: { id: { in: auditIds } },
      data: { forgottenAt: null },
    });
  }

  await prisma.forgetRequest.update({
    where: { id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: reason ?? null,
    },
  });

  // Audit the cancellation
  await logDecision({
    familyId,
    agentId: 'boka-privacy',
    action: 'forget_cancelled',
    category: 'privacy',
    reasoning: `User anulował prośbę o zapomnienie "${request.query ?? request.scope}". Wspomnienia przywrócone.`,
    riskLevel: 'medium',
    contextJson: { forgetRequestId: id, restoredMemories: memoryIds.length },
    forgettable: false,
  });

  return true;
}

// ── Scheduled hard delete (cron) ─────────────
// Trwale usuwa wszystkie ForgetRequest z hardDeleteAt <= now.
export async function processScheduledHardDelete(): Promise<{
  processed: number;
  memoriesDeleted: number;
  auditDeleted: number;
}> {
  const due = await prisma.forgetRequest.findMany({
    where: {
      status: 'soft_deleted',
      hardDeleteAt: { lte: new Date() },
    },
  });

  let memoriesDeleted = 0;
  let auditDeleted = 0;

  for (const req of due) {
    const memoryIds: string[] = JSON.parse(req.memoryEntryIds);
    const auditIds: string[] = JSON.parse(req.auditLogIds);

    if (memoryIds.length > 0) {
      const r = await prisma.memoryEntry.deleteMany({
        where: { id: { in: memoryIds } },
      });
      memoriesDeleted += r.count;
    }

    if (auditIds.length > 0) {
      const r = await prisma.auditLog.deleteMany({
        where: { id: { in: auditIds } },
      });
      auditDeleted += r.count;
    }

    await prisma.forgetRequest.update({
      where: { id: req.id },
      data: { status: 'hard_deleted' },
    });
  }

  return { processed: due.length, memoriesDeleted, auditDeleted };
}

// ── List forget requests (Whatnsent Dashboard) ─
export async function listForgetRequests(
  familyId: string,
  filters?: { status?: string; memberId?: string; limit?: number },
) {
  const where: any = { familyId };
  if (filters?.status) where.status = filters.status;
  if (filters?.memberId) where.memberId = filters.memberId;

  return prisma.forgetRequest.findMany({
    where,
    orderBy: { requestedAt: 'desc' },
    take: Math.min(filters?.limit ?? 50, 200),
  });
}

// ── Detect forget command from user message ──
// Zwraca true jeśli wiadomość usera to prośba o zapomnienie.
export function detectForgetWhatmmand(message: string): {
  isForget: boolean;
  query?: string;
  scope?: ForgetScope;
} {
  const lower = message.toLowerCase().trim();

  // Wzorce:
  // "boka zapomnij o..."
  // "zapomnij co mówiłem o..."
  // "zapomnij rozmowę o..."
  // "zapomnij wszystko"
  // "nie pamiętaj o..."
  // "usuń wspomnienie o..."
  const patterns: Array<{ regex: RegExp; scope: ForgetScope }> = [
    { regex: /zapomnij\s+(wszystko|o wszystkim|całą rozmowę|cały czat)/i, scope: 'all' },
    { regex: /zapomnij\s+(rozmowę|konwersację)\s+(o\s+)?(.+)/i, scope: 'conversation' },
    { regex: /zapomnij\s+(co\s+)?(mówiłem|mówiłam|mówiliśmy|pisaliśmy)\s+(o\s+)?(.+)/i, scope: 'topic' },
    { regex: /zapomnij\s+o\s+(.+)/i, scope: 'topic' },
    { regex: /nie\s+pamiętaj\s+(o\s+)?(.+)/i, scope: 'topic' },
    { regex: /usuń\s+(wspomnienie|pamięć)\s+(o\s+)?(.+)/i, scope: 'topic' },
    { regex: /skasuj\s+(rozmowę|wspomnienie)\s+(o\s+)?(.+)/i, scope: 'topic' },
  ];

  for (const { regex, scope } of patterns) {
    const match = lower.match(regex);
    if (match) {
      // Extract the captured query (last group)
      const query = match[match.length - 1]?.trim();
      return {
        isForget: true,
        query: query || undefined,
        scope,
      };
    }
  }

  return { isForget: false };
}
