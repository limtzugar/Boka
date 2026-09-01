// ═══════════════════════════════════════════════════════════
// BOKA OS — Supermemory-inspired Auto SoulProfile
// ═══════════════════════════════════════════════════════════
//
// Źródło: github.com/supermemorydotcom/supermemory — `/v4/profile`
// Adaptacja: analizuje N ostatnich MemoryEntry danego membera
// i generuje/aktualizuje MemberProfile (traits, interests, communication style).
//
// Diff (przed/po) zapisywany w SoulProfileRevision dla audytowalności.
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { chatCompletion } from '@/lib/ai-providers';

// ── Typy ───────────────────────────────────

export interface AutoProfileResult {
  memberId: string;
  traits: Record<string, number>;
  interests: string[];
  communicationStyle: string;
  emotionalBaseline: string;
  reasoningSummary: string;
  memoriesAnalyzed: number;
  revisionId: string;
}

// ── LLM prompt ─────────────────────────────

const PROFILE_PROMPT = `Analizujesz wspomnienia BOKA o domowniku i tworzysz profil psychologiczny.

WSPOMNIENIA (chronologicznie, najnowsze ostatnie):
"""
{MEMORIES}
"""

Zwróć WYŁĄCZNIE JSON:
{{
  "traits": {{"otwartość": 0.7, "urodowaość": 0.5, "sumienność": 0.8, "ekstrawersja": 0.6, "stabilność_emocjonalna": 0.7}},
  "interests": ["programowanie", "gotowanie", "wędkarstwo"],
  "communicationStyle": "bezpośredni, konkretny, lubi żarty",
  "emotionalBaseline": "zwykle pogodny, ale stresuje się przed deadline'ami",
  "reasoningSummary": "1-2 zdania: co się zmieniło od ostatniego profilu"
}}

Traits: skala 0.0-1.0. Max 5 cech.
Interests: max 8 pozycji.
communicationStyle: 1 zdanie po polsku.
emotionalBaseline: 1 zdanie po polsku.
reasoningSummary: 1-2 zdania po polsku, co się ZMIANIŁO względem poprzedniego profilu.`;

// ── Main function ─────────────────────────

export async function refreshAutoProfile(
  familyId: string,
  memberId: string,
  memoriesLimit = 30
): Promise<AutoProfileResult> {
  // Pobierz ostatnie wspomnienia
  const memories = await db.memoryEntry.findMany({
    where: { familyId, memberId, validUntil: null },
    orderBy: { createdAt: 'desc' },
    take: memoriesLimit,
  });

  if (memories.length === 0) {
    throw new Error('Brak wspomnień do analizy profilu');
  }

  const memoriesText = memories
    .map((m, i) => `[${i + 1}] (${m.createdAt.toISOString().slice(0, 10)}) ${m.content.slice(0, 200)}`)
    .join('\n');

  // Snapshot poprzedniego profilu
  const existingProfile = await db.memberProfile.findUnique({
    where: { memberId_domain: { memberId, domain: 'psychology' } },
  });
  const before = existingProfile?.data || '{}';

  // LLM analiza
  const prompt = PROFILE_PROMPT.replace('{MEMORIES}', memoriesText);
  const resp = await chatCompletion([
    { role: 'system', content: 'Analizujesz wspomnienia. Zwracasz WYŁĄCZNIE JSON bez markdown.' },
    { role: 'user', content: prompt },
  ]);

  // Parse
  const match = resp.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM nie zwrócił JSON');
  const parsed = JSON.parse(match[0]);

  const after = JSON.stringify({
    traits: parsed.traits || {},
    interests: parsed.interests || [],
    communicationStyle: parsed.communicationStyle || '',
    emotionalBaseline: parsed.emotionalBaseline || '',
    updatedAt: new Date().toISOString(),
  });

  // Upsert MemberProfile
  const updated = await db.memberProfile.upsert({
    where: { memberId_domain: { memberId, domain: 'psychology' } },
    create: { memberId, domain: 'psychology', data: after },
    update: { data: after },
  });

  // Zapisz rewizję
  const lastRevision = await db.soulProfileRevision.findFirst({
    where: { familyId, memberId },
    orderBy: { revisionNumber: 'desc' },
  });
  const revisionNumber = (lastRevision?.revisionNumber || 0) + 1;

  const revision = await db.soulProfileRevision.create({
    data: {
      familyId,
      memberId,
      revisionNumber,
      traitsBefore: existingProfile ? (JSON.parse(before).traits ? JSON.stringify(JSON.parse(before).traits) : null) : null,
      traitsAfter: JSON.stringify(parsed.traits || {}),
      interestsBefore: existingProfile ? (JSON.parse(before).interests ? JSON.stringify(JSON.parse(before).interests) : null) : null,
      interestsAfter: JSON.stringify(parsed.interests || []),
      communicationStyleBefore: existingProfile ? (JSON.parse(before).communicationStyle || null) : null,
      communicationStyleAfter: parsed.communicationStyle || null,
      memoriesAnalyzed: memories.length,
      reasoningSummary: parsed.reasoningSummary || '',
      modelUsed: 'auto-profile',
    },
  });

  return {
    memberId,
    traits: parsed.traits || {},
    interests: parsed.interests || [],
    communicationStyle: parsed.communicationStyle || '',
    emotionalBaseline: parsed.emotionalBaseline || '',
    reasoningSummary: parsed.reasoningSummary || '',
    memoriesAnalyzed: memories.length,
    revisionId: revision.id,
  };
}

// ── Get profile + history ─────────────────

export async function getAutoProfile(memberId: string) {
  const profile = await db.memberProfile.findUnique({
    where: { memberId_domain: { memberId, domain: 'psychology' } },
  });
  if (!profile) return null;
  try {
    return JSON.parse(profile.data);
  } catch {
    return null;
  }
}

export async function getProfileHistory(memberId: string, limit = 10) {
  return db.soulProfileRevision.findMany({
    where: { memberId },
    orderBy: { revisionNumber: 'desc' },
    take: limit,
  });
}
