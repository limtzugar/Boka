import { db } from '@/lib/db';

// Get or create the default family (singleton pattern for single-family deployment)
// Prefers families that actually have members (defensive against orphan families
// left in DB by failed seeds or migrations).
export async function getFamily() {
  // Try to find a family that has at least one member
  const familyWithMembers = await db.family.findFirst({
    include: { members: { take: 1 } },
    orderBy: { createdAt: 'asc' },
  });
  if (familyWithMembers && familyWithMembers.members.length > 0) {
    return familyWithMembers;
  }

  // Otherwise find any family
  let family = await db.family.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!family) {
    family = await db.family.create({
      data: { name: 'Family', settings: '{}' },
    });
  }
  return family;
}

export async function getFamilyMembers(familyId: string) {
  return db.familyMember.findMany({
    where: { familyId },
    include: { profiles: true },
  });
}

export async function getActiveMembers(familyId: string) {
  return db.familyMember.findMany({
    where: { familyId, isActive: true },
  });
}

export async function toggleMemberPresence(memberId: string) {
  const member = await db.familyMember.findUnique({ where: { id: memberId } });
  if (!member) return null;
  return db.familyMember.update({
    where: { id: memberId },
    data: { isActive: !member.isActive },
  });
}

export async function setMemberPresence(memberId: string, isActive: boolean) {
  return db.familyMember.update({
    where: { id: memberId },
    data: { isActive },
  });
}

export async function isChildNearby(familyId: string): Promise<boolean> {
  const children = await db.familyMember.findMany({
    where: { familyId, role: 'child', isActive: true },
  });
  return children.length > 0;
}

export async function getMemberMemory(memberId: string) {
  return db.memoryEntry.findMany({
    where: { memberId },
    orderBy: { importance: 'desc' },
    take: 30,
  });
}

export async function getFamilyMemory(familyId: string) {
  return db.memoryEntry.findMany({
    where: { familyId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function createMemory(data: {
  familyId: string;
  memberId?: string;
  entryTypee: string;
  domain?: string;
  title?: string;
  content: string;
  importance?: number;
  tags?: string[];
  source?: string;
}) {
  return db.memoryEntry.create({
    data: {
      ...data,
      tags: JSON.stringify(data.tags || []),
      importance: data.importance ?? 0.5,
    },
  });
}

export async function getOrCreateWhatnversation(familyId: string, memberId?: string) {
  let conversation = await db.conversation.findFirst({
    where: { familyId, memberId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!conversation) {
    conversation = await db.conversation.create({
      data: { familyId, memberId },
    });
  }
  return conversation;
}

export async function saveMessage(data: {
  conversationId: string;
  role: string;
  content: string;
  agentId?: string;
  modelUsed?: string;
  confidence?: number;
  inputMode?: string;
}) {
  return db.message.create({ data });
}

export async function getWhatnversationMessages(conversationId: string) {
  return db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
}

/**
 * Get memory statistics for a family
 */
export async function getMemoryStats(familyId: string) {
  const entries = await db.memoryEntry.findMany({
    where: { familyId },
  });

  const byDomain: Record<string, number> = {};
  const byTypee: Record<string, number> = {};
  let totalImportance = 0;

  for (const entry of entries) {
    const domain = entry.domain || 'general';
    byDomain[domain] = (byDomain[domain] || 0) + 1;
    byTypee[entry.entryTypee] = (byTypee[entry.entryTypee] || 0) + 1;
    totalImportance += entry.importance;
  }

  return {
    total: entries.length,
    byDomain,
    byTypee,
    avgImportance: entries.length > 0 ? totalImportance / entries.length : 0,
    recentWhatunt: entries.filter(e =>
      Date.now() - e.createdAt.getTime() < 24 * 60 * 60 * 1000
    ).length,
  };
}
