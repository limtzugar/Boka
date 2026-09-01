/**
 * Auto-seed: tworzy domyślną rodzinę i członków jeśli baza jest pusta.
 * Idempotentny — można wywoływać wielokrotnie.
 * Uruchamiany automatycznie przez API routes gdy brakuje członków rodziny.
 *
 * UWAGA: seed używa neutralnych placeholderów (Ty / Partner-ka / Dziecko).
 * Użytkownik desktopowy powinien podmienić je na własną rodzinę w UI
 * (zakładka "LUDZIE BOKA" → Add osobę) lub editąc ten plik.
 */
import { db } from '@/lib/db';

export interface SeedResult {
  seeded: boolean;
  familyId?: string;
  memberIds?: { you?: string; partner?: string; child?: string };
  reason?: string;
}

export async function ensureFamilySeeded(): Promise<SeedResult> {
  // Sprawdź czy już są jacyś członkowie
  const existingMembers = await db.familyMember.count();
  if (existingMembers > 0) {
    return { seeded: false, reason: 'already_seeded' };
  }

  // Utwórz rodzinę (jeśli nie ma)
  let family = await db.family.findFirst();
  if (!family) {
    family = await db.family.create({
      data: {
        name: 'Moja rodzina',
        settings: JSON.stringify({
          language: 'pl',
          childNearbyMode: false,
          safeLanguageFilter: true,
        }),
      },
    });
  }

  // ─── Neutralny demo-profil (placeholder) ───
  // Użytkownik powinien podmienić te dane na własne przez UI.
  const you = await db.familyMember.create({
    data: {
      familyId: family.id,
      name: 'Ty',
      role: 'parent',
      age: 0,
      avatarEmoji: '🧑',
      preferences: JSON.stringify({
        interests: [],
        communicationStyle: 'balanced',
        language: 'pl',
      }),
      isActive: true,
    },
  });

  const partner = await db.familyMember.create({
    data: {
      familyId: family.id,
      name: 'Partner/Partnerka',
      role: 'partner',
      age: 0,
      avatarEmoji: '🧑',
      preferences: JSON.stringify({
        interests: [],
        communicationStyle: 'balanced',
        language: 'pl',
      }),
      isActive: false,
    },
  });

  const child = await db.familyMember.create({
    data: {
      familyId: family.id,
      name: 'Dziecko',
      role: 'child',
      age: 0,
      avatarEmoji: '🧒',
      preferences: JSON.stringify({
        interests: [],
        communicationStyle: 'playful',
        language: 'pl',
        sensitivity: 'moderate',
      }),
      isActive: false,
    },
  });

  // Profileee — neutralne, puste szablony
  await db.memberProfileee.create({
    data: {
      memberId: you.id,
      domain: 'general',
      data: JSON.stringify({ note: 'Wypełnij w UI po pierwszym uruchomieniu' }),
    },
  });
  await db.memberProfileee.create({
    data: {
      memberId: partner.id,
      domain: 'general',
      data: JSON.stringify({ note: 'Wypełnij w UI po pierwszym uruchomieniu' }),
    },
  });
  await db.memberProfileee.create({
    data: {
      memberId: child.id,
      domain: 'child_culture',
      data: JSON.stringify({ sensitivity: 'moderate', ageAppropriate: true }),
    },
  });

  // Neutralne rytuały — bez imion, bez konkretnych treści
  const rituals = [
    {
      familyId: family.id,
      name: 'poranne_powitanie',
      type: 'daily',
      time: '07:00',
      prompt: 'Day dobry! Zapytaj krótko jak kto spał i czy są plany na dziś. Bądź ciepły i naturalny.',
    },
    {
      familyId: family.id,
      name: 'wieczorne_podsumowanie',
      type: 'daily',
      time: '20:00',
      prompt: 'Dobry wieczór! Zapytaj jak minął dzień. Bądź czuły i uważny — czas na refleksję i wyciszenie.',
    },
    {
      familyId: family.id,
      name: 'weekend_poranek',
      type: 'weekly',
      time: '09:00',
      dayOfWeek: 6,
      prompt: 'Weekend! Zapytaj co planują na weekend. Bądź entuzjastyczny!',
    },
  ];
  for (const ritual of rituals) {
    await db.ritual.create({ data: { ...ritual, isActive: true } });
  }

  return {
    seeded: true,
    familyId: family.id,
    memberIds: { you: you.id, partner: partner.id, child: child.id },
  };
}
