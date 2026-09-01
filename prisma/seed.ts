import { db } from '@/lib/db';

/**
 * Prisma seed — neutralne placeholdery.
 * Zastąp w UI (zakładka "LUDZIE BOKA") własną rodziną po pierwszym uruchomieniu.
 */
async function seed() {
  console.log('🌱 Seeding database (neutral placeholders)...');

  // Create family
  const family = await db.family.create({
    data: {
      name: 'Moja rodzina',
      settings: JSON.stringify({
        language: 'pl',
        childNearbyMode: false,
        safeLanguageFilter: true,
      }),
    },
  });

  // Create family members — neutral placeholders
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

  // Profiles — puste szablony do wypełnienia w UI
  await db.memberProfile.create({
    data: {
      memberId: you.id,
      domain: 'general',
      data: JSON.stringify({ note: 'Wypełnij w UI po pierwszym uruchomieniu' }),
    },
  });
  await db.memberProfile.create({
    data: {
      memberId: partner.id,
      domain: 'general',
      data: JSON.stringify({ note: 'Wypełnij w UI po pierwszym uruchomieniu' }),
    },
  });
  await db.memberProfile.create({
    data: {
      memberId: child.id,
      domain: 'child_culture',
      data: JSON.stringify({ sensitivity: 'moderate', ageAppropriate: true }),
    },
  });

  // ══ RYTUAŁY DNIA — neutralne, bez imion ══
  console.log('📅 Seeding rituals...');

  const rituals = [
    {
      familyId: family.id,
      name: 'poranne_powitanie',
      type: 'daily',
      time: '07:00',
      prompt: 'Dzień dobry! Zapytaj krótko jak kto spał i czy są plany na dziś. Bądź ciepły i naturalny.',
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
      dayOfWeek: 6, // sobota
      prompt: 'Weekend! Zapytaj co planują na weekend. Bądź entuzjastyczny!',
    },
  ];

  for (const ritual of rituals) {
    await db.ritual.create({ data: { ...ritual, isActive: true } });
  }

  console.log('✅ Seed complete!');
  console.log(`   Family: ${family.id}`);
  console.log(`   You: ${you.id}`);
  console.log(`   Partner: ${partner.id}`);
  console.log(`   Child: ${child.id}`);
  console.log(`   Rituals: ${rituals.length}`);
  console.log('   → Podmień placeholdery w UI "LUDZIE BOKA" po pierwszym uruchomieniu.');
}

seed()
  .catch(console.error)
  .finally(() => db.$disconnect());
