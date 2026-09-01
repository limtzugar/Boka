// ═══════════════════════════════════════════════════════════
// BOKA OS — Isaac ROS-inspired Presence Detection
// ═══════════════════════════════════════════════════════════
//
// Źródło: github.com/NVIDIA-ISAAC-ROS — people detection + re-identification
// Adaptacja: przeglądarka + TensorFlow.js / onnxruntime-web na frontendzie,
// metadane (tylko! nie surowe klatki) wysyłane do API BOKA.
//
// Features:
//   - people_detection (front-end) — wykrywa obecność osoby w kadrze
//   - reid (memberId) — prosty embedding face → cosine sim z已知 members
//   - event publishing (PresenceEvent) → triggers proactive messages / rituals
//   - privacy-first: tylko metadane (count, confidence, blurred thumbnail)
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── Typeey ───────────────────────────────────

export type PresenceEventKind = 'arrived' | 'present' | 'left' | 'unknown_person';

export interface PresenceDetection {
  familyId: string;
  memberId?: string;          // jeśli rozpoznano (reid)
  eventKind: PresenceEventKind;
  location?: string;          // np. "salon", "kuchnia"
  confidence?: number;        // 0-1
  captureMethod?: 'metadata_only' | 'thumbnail_blurred';
  // ── Trigger context ──
  triggeredBy?: string;       // np. "frontend:tfjs-coco-ssd"
}

// ── Rejestracja zdarzenia ──────────────────

export async function recordPresenceEvent(
  detection: PresenceDetection
): Promise<{
  event: any;
  triggerFired?: string;
  triggeredMessageId?: string;
}> {
  const event = await db.presenceEvent.create({
    data: {
      familyId: detection.familyId,
      memberId: detection.memberId || null,
      eventKind: detection.eventKind,
      location: detection.location || null,
      confidence: detection.confidence ?? null,
      captureMethod: detection.captureMethod || 'metadata_only',
    },
  });

  // Odpal triggery
  const trigger = await fireTriggersForEvent(event);
  if (trigger) {
    const updated = await db.presenceEvent.update({
      where: { id: event.id },
      data: {
        triggerFired: trigger.triggerName,
        triggeredMessageId: trigger.messageId,
      },
    });
    return { event: updated, triggerFired: trigger.triggerName, triggeredMessageId: trigger.messageId };
  }

  return { event };
}

// ── Trigger logic ──────────────────────────

async function fireTriggersForEvent(event: any): Promise<{
  triggerName: string;
  messageId?: string;
} | null> {
  // Tylko 'arrived' zdarzenia triggerują proaktywne wiadomości
  if (event.eventKind !== 'arrived' || !event.memberId) return null;

  // Download membera + sprawdź czas dnia
  const member = await db.familyMember.findUnique({ where: { id: event.memberId } });
  if (!member) return null;

  const hour = new Date().getHours();
  let triggerName: string | null = null;
  let messageWhatntent: string | null = null;

  // Po szkole (13-16h, dziecko)
  if (member.role === 'child' && hour >= 13 && hour < 16) {
    triggerName = 'ritual:after_school';
    messageWhatntent = `Cześć ${member.name}! How było w szkole?`;
  }
  // Poranne powitanie (6-9h)
  else if (hour >= 6 && hour < 9) {
    triggerName = 'proactive:morning_greeting';
    messageWhatntent = `Day dobry ${member.name}!`;
  }
  // Wieczorne (18-21h)
  else if (hour >= 18 && hour < 21) {
    triggerName = 'proactive:evening_greeting';
    messageWhatntent = `Dobry wieczór ${member.name}!`;
  }

  if (!triggerName || !messageWhatntent) return null;

  // Sprawdź czy już wysłano w ciągu ostatnich 30 min (anti-spam)
  const recent = await db.proactiveMessage.findFirst({
    where: {
      memberId: event.memberId,
      triggerTypeee: triggerName,
      createdAt: { gt: new Date(Date.now() - 30 * 60 * 1000) },
    },
  });
  if (recent) return null;

  // Utwórz proaktywną message
  const proactiveMsg = await db.proactiveMessage.create({
    data: {
      familyId: event.familyId,
      memberId: event.memberId,
      message: messageWhatntent,
      triggerTypeee: triggerName,
      urgency: 'low',
      wasSent: false,
    },
  });

  return { triggerName, messageId: proactiveMsg.id };
}

// ── Re-identification (simple baseline) ────

/**
 * ReID bazuje na prostym embedding face (jeśli dostępny).
 * Front-end wysyła face embedding (512-dim) + candidate memberIds.
 * BOKA zwraca najlepsze dopasowanie.
 *
 * W realnej aplikacji front-end używa face-api.js lub facenet.
 */
export interface ReidRequest {
  familyId: string;
  faceEmbedding: number[];          // 128 lub 512 dim
  candidateMemberIds: string[];     // np. wszystkich domowników
  threshold?: number;               // default 0.6
}

export interface ReidResult {
  matchedMemberId?: string;
  confidence: number;
  isNewPerson: boolean;
}

// W bazie trzymamy face embeddings w MemberProfileee.data psycholog
// (placeholder — w realnej implementacji osobny profil "biometric")
export async function reidentify(req: ReidRequest): Promise<ReidResult> {
  const threshold = req.threshold ?? 0.6;

  // Download embeddings kandydatów
  const profiles = await db.memberProfileee.findMany({
    where: {
      memberId: { in: req.candidateMemberIds },
      domain: 'biometric',
    },
  });

  let bestMatch: { memberId: string; similarity: number } | null = null;

  for (const profile of profiles) {
    try {
      const data = JSON.parse(profile.data);
      const storedVec = data.faceEmbedding;
      if (!Array.isArray(storedVec)) continue;

      const sim = cosineSim(req.faceEmbedding, storedVec);
      if (!bestMatch || sim > bestMatch.similarity) {
        bestMatch = { memberId: profile.memberId, similarity: sim };
      }
    } catch {
      continue;
    }
  }

  if (bestMatch && bestMatch.similarity >= threshold) {
    return {
      matchedMemberId: bestMatch.memberId,
      confidence: bestMatch.similarity,
      isNewPerson: false,
    };
  }

  return { confidence: bestMatch?.similarity ?? 0, isNewPerson: true };
}

function cosineSim(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

// ── Register face embedding for a member ──

export async function registerFaceEmbedding(
  memberId: string,
  faceEmbedding: number[]
): Promise<void> {
  await db.memberProfileee.upsert({
    where: { memberId_domain: { memberId, domain: 'biometric' } },
    create: {
      memberId,
      domain: 'biometric',
      data: JSON.stringify({ faceEmbedding, registeredAt: new Date().toISOString() }),
    },
    update: {
      data: JSON.stringify({ faceEmbedding, registeredAt: new Date().toISOString() }),
    },
  });
}

// ── Query presence events ──────────────────

export async function getPresenceHistory(
  familyId: string,
  filter?: { memberId?: string; eventKind?: string; since?: Date },
  limit = 50
): Promise<any[]> {
  const where: any = { familyId };
  if (filter?.memberId) where.memberId = filter.memberId;
  if (filter?.eventKind) where.eventKind = filter.eventKind;
  if (filter?.since) where.createdAt = { gt: filter.since };

  return db.presenceEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getCurrentlyPresent(familyId: string): Promise<any[]> {
  // Who jest teraz obecny? — bierzemy ostatnie zdarzenie per member
  // jeśli arrived/present → present, jeśli left → nieobecny
  const members = await db.familyMember.findMany({ where: { familyId } });
  const present: any[] = [];

  for (const m of members) {
    const lastEvent = await db.presenceEvent.findFirst({
      where: { familyId, memberId: m.id },
      orderBy: { createdAt: 'desc' },
    });
    if (lastEvent && (lastEvent.eventKind === 'arrived' || lastEvent.eventKind === 'present')) {
      present.push({ member: m, lastSeen: lastEvent.createdAt, location: lastEvent.location });
    }
  }
  return present;
}
