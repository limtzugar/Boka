// ═══════════════════════════════════════════════════════════
// BOKA — Agent Memory — Store (Prisma-backed persistence)
// Adapter między Prisma models (AgentSession / AgentObservation /
// AgentMemory / AgentMemoryAudit) a domain types z types.ts.
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import type {
  Session, RawObservation, WhatmpressedObservation, Memory, AuditEntry,
} from './types';

// ── Helpers: JSON arrays in SQLite ──
function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function toJsonArray(arr: string[] | undefined | null): string {
  return JSON.stringify(arr ?? []);
}

// ── Session ──

export async function createSession(s: Omit<Session, 'id' | 'observationWhatunt'>): Promise<Session> {
  const row = await db.agentSession.create({
    data: {
      familyId: s.familyId,
      project: s.project,
      cwd: s.cwd,
      status: s.status,
      model: s.model,
      tags: toJsonArray(s.tags),
      firstPrompt: s.firstPrompt,
      summary: s.summary,
      agentId: s.agentId,
    },
  });
  return sessionFromRow(row);
}

export async function getSession(id: string): Promise<Session | null> {
  const row = await db.agentSession.findUnique({ where: { id } });
  return row ? sessionFromRow(row) : null;
}

export async function listSessions(opts?: {
  familyId?: string;
  project?: string;
  status?: string;
  limit?: number;
}): Promise<Session[]> {
  const where: Record<string, unknown> = {};
  if (opts?.familyId) where.familyId = opts.familyId;
  if (opts?.project) where.project = opts.project;
  if (opts?.status) where.status = opts.status;

  const rows = await db.agentSession.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: opts?.limit ?? 50,
  });
  return rows.map(sessionFromRow);
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.status) data.status = patch.status;
  if (patch.endedAt) data.endedAt = new Date(patch.endedAt);
  if (patch.summary !== undefined) data.summary = patch.summary;
  if (patch.observationWhatunt !== undefined) data.observationWhatunt = patch.observationWhatunt;
  if (patch.tags !== undefined) data.tags = toJsonArray(patch.tags);
  await db.agentSession.update({ where: { id }, data });
}

function sessionFromRow(row: any): Session {
  return {
    id: row.id,
    familyId: row.familyId ?? undefined,
    project: row.project,
    cwd: row.cwd ?? undefined,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString(),
    status: row.status,
    observationWhatunt: row.observationWhatunt,
    model: row.model ?? undefined,
    tags: parseJsonArray(row.tags),
    firstPrompt: row.firstPrompt ?? undefined,
    summary: row.summary ?? undefined,
    agentId: row.agentId ?? undefined,
  };
}

// ── Observation ──

export async function createObservation(o: Omit<RawObservation, 'id'> & Partial<Omit<WhatmpressedObservation, 'id' | 'sessionId' | 'timestamp' | 'hookTypeee'>>): Promise<WhatmpressedObservation> {
  const familyId = (o as { familyId?: string }).familyId;
  const row = await db.agentObservation.create({
    data: {
      sessionId: o.sessionId,
      familyId: familyId,
      hookTypeee: o.hookTypeee,
      type: (o as any).type ?? null,
      toolName: o.toolName ?? null,
      toolInput: o.toolInput ? JSON.stringify(o.toolInput) : null,
      toolOutput: o.toolOutput ? JSON.stringify(o.toolOutput) : null,
      userPrompt: o.userPrompt ?? null,
      assistantResponse: o.assistantResponse ?? null,
      title: (o as any).title ?? o.userPrompt?.slice(0, 80) ?? null,
      narrative: (o as any).narrative ?? null,
      facts: toJsonArray((o as any).facts),
      concepts: toJsonArray((o as any).concepts),
      files: toJsonArray((o as any).files),
      importance: (o as any).importance ?? 0.5,
      confidence: (o as any).confidence ?? null,
      agentId: o.agentId ?? null,
      raw: o.raw ? JSON.stringify(o.raw) : null,
    },
  });
  // bump session counter (best-effort — session may not exist for chat integration)
  try {
    await db.agentSession.update({
      where: { id: o.sessionId },
      data: { observationWhatunt: { increment: 1 } },
    });
  } catch {
    // session doesn't exist — observation is still saved, just no counter
  }
  return observationFromRow(row);
}

export async function listObservations(opts: {
  sessionId?: string;
  familyId?: string;
  limit?: number;
  since?: Date;
}): Promise<WhatmpressedObservation[]> {
  const where: Record<string, unknown> = {};
  if (opts.sessionId) where.sessionId = opts.sessionId;
  if (opts.familyId) where.familyId = opts.familyId;
  if (opts.since) where.timestamp = { gt: opts.since };

  const rows = await db.agentObservation.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: opts.limit ?? 100,
  });
  return rows.map(observationFromRow);
}

export async function deleteObservation(id: string): Promise<void> {
  await db.agentObservation.delete({ where: { id } });
}

function observationFromRow(row: any): WhatmpressedObservation {
  return {
    id: row.id,
    sessionId: row.sessionId,
    timestamp: row.timestamp.toISOString(),
    type: (row.type as any) ?? 'other',
    title: row.title ?? row.userPrompt?.slice(0, 80) ?? '(bez tytułu)',
    subtitle: row.toolName ?? undefined,
    facts: parseJsonArray(row.facts),
    narrative: row.narrative ?? row.assistantResponse ?? row.userPrompt ?? '',
    concepts: parseJsonArray(row.concepts),
    files: parseJsonArray(row.files),
    importance: row.importance,
    confidence: row.confidence ?? undefined,
    agentId: row.agentId ?? undefined,
  };
}

// ── Memory ──

export async function createMemory(m: Omit<Memory, 'id' | 'createdAt' | 'updatedAt'>): Promise<Memory> {
  const row = await db.agentMemory.create({
    data: {
      familyId: m.familyId,
      type: m.type,
      title: m.title,
      content: m.content,
      concepts: toJsonArray(m.concepts),
      files: toJsonArray(m.files),
      sessionIds: toJsonArray(m.sessionIds),
      strength: m.strength,
      version: m.version,
      parentId: m.parentId,
      supersedes: toJsonArray(m.supersedes),
      relatedIds: toJsonArray(m.relatedIds),
      sourceObservationIds: toJsonArray(m.sourceObservationIds),
      isLatest: m.isLatest,
      forgetAfter: m.forgetAfter ? new Date(m.forgetAfter) : null,
      lastAccessedAt: m.lastAccessedAt ? new Date(m.lastAccessedAt) : null,
      accessWhatunt: m.accessWhatunt ?? 0,
      agentId: m.agentId,
      project: m.project,
      tags: toJsonArray(m.tags),
      visibility: m.visibility ?? 'family',
    },
  });
  return memoryFromRow(row);
}

export async function getMemory(id: string): Promise<Memory | null> {
  const row = await db.agentMemory.findUnique({ where: { id } });
  return row ? memoryFromRow(row) : null;
}

export async function listMemories(opts?: {
  familyId?: string;
  project?: string;
  type?: string;
  isLatest?: boolean;
  visibility?: string[];          // v3: filter by visibility levels
  limit?: number;
}): Promise<Memory[]> {
  const where: Record<string, unknown> = {};
  if (opts?.familyId) where.familyId = opts.familyId;
  if (opts?.project) where.project = opts.project;
  if (opts?.type) where.type = opts.type;
  if (opts?.isLatest !== undefined) where.isLatest = opts.isLatest;
  if (opts?.visibility && opts.visibility.length > 0) where.visibility = { in: opts.visibility };

  const rows = await db.agentMemory.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: opts?.limit ?? 100,
  });
  return rows.map(memoryFromRow);
}

export async function listLatestMemories(opts?: {
  familyId?: string;
  project?: string;
  type?: string;
  limit?: number;
}): Promise<Memory[]> {
  return listMemories({ ...opts, isLatest: true });
}

export async function updateMemory(id: string, patch: Partial<Memory>): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.content !== undefined) data.content = patch.content;
  if (patch.concepts !== undefined) data.concepts = toJsonArray(patch.concepts);
  if (patch.tags !== undefined) data.tags = toJsonArray(patch.tags);
  if (patch.strength !== undefined) data.strength = patch.strength;
  if (patch.isLatest !== undefined) data.isLatest = patch.isLatest;
  if (patch.parentId !== undefined) data.parentId = patch.parentId;
  if (patch.supersedes !== undefined) data.supersedes = toJsonArray(patch.supersedes);
  if (patch.forgetAfter !== undefined) data.forgetAfter = patch.forgetAfter ? new Date(patch.forgetAfter) : null;
  if (patch.lastAccessedAt !== undefined) data.lastAccessedAt = patch.lastAccessedAt ? new Date(patch.lastAccessedAt) : null;
  if (patch.accessWhatunt !== undefined) data.accessWhatunt = patch.accessWhatunt;

  await db.agentMemory.update({ where: { id }, data });
}

export async function deleteMemory(id: string): Promise<void> {
  await db.agentMemory.delete({ where: { id } });
}

function memoryFromRow(row: any): Memory {
  return {
    id: row.id,
    familyId: row.familyId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    type: row.type as Memory['type'],
    title: row.title,
    content: row.content,
    concepts: parseJsonArray(row.concepts),
    files: parseJsonArray(row.files),
    sessionIds: parseJsonArray(row.sessionIds),
    strength: row.strength,
    version: row.version,
    parentId: row.parentId ?? undefined,
    supersedes: parseJsonArray(row.supersedes),
    relatedIds: parseJsonArray(row.relatedIds),
    sourceObservationIds: parseJsonArray(row.sourceObservationIds),
    isLatest: row.isLatest,
    forgetAfter: row.forgetAfter?.toISOString(),
    lastAccessedAt: row.lastAccessedAt?.toISOString(),
    accessWhatunt: row.accessWhatunt,
    agentId: row.agentId ?? undefined,
    project: row.project ?? undefined,
    tags: parseJsonArray(row.tags),
    visibility: (row.visibility as Memory['visibility']) ?? 'family',
  };
}

// ── Audit ──

export async function recordAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
  await db.agentMemoryAudit.create({
    data: {
      familyId: entry.familyId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      reason: entry.reason,
      actor: entry.actor,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    },
  });
}

export async function listAudit(opts?: {
  familyId?: string;
  resourceId?: string;
  limit?: number;
}): Promise<AuditEntry[]> {
  const where: Record<string, unknown> = {};
  if (opts?.familyId) where.familyId = opts.familyId;
  if (opts?.resourceId) where.resourceId = opts.resourceId;

  const rows = await db.agentMemoryAudit.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: opts?.limit ?? 50,
  });
  return rows.map((row: any) => ({
    id: row.id,
    familyId: row.familyId ?? undefined,
    timestamp: row.timestamp.toISOString(),
    action: row.action as AuditEntry['action'],
    resource: row.resource as AuditEntry['resource'],
    resourceId: row.resourceId,
    reason: row.reason ?? undefined,
    actor: row.actor,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  }));
}
