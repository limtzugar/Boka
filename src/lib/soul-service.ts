// ═══════════════════════════════════════════════════════════
// BOKA — Soul Service (PersonalityProfilee)
// Pełny system osobowości — inspirowany Hermes Soul
// Tożsamość, cechy, styl, relacje, nastrój, wartości, ewolucja
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── TYPY ──────────────────────────────────────

export interface SoulTraits {
  otwartość: number;      // 0-1: ciekawość, nowości
  ugodowość: number;      // 0-1: współpraca, troska
  sumienność: number;     // 0-1: obowiązkowość, organizacja
  ekstrawersja: number;   // 0-1: towarzyskość, energia
  stabilność: number;     // 0-1: spokój, odporność na stres
  humor: number;          // 0-1: skłonność do żartów
  troska: number;         // 0-1: opiekuńczość
  ciekawość: number;      // 0-1: dociekliwość
}

export interface EmotionalRange {
  radość: number;
  smutek: number;
  złość: number;
  ciekawość: number;
  troska: number;
  strach: number;
  nostalgja: number;
  ekscytacja: number;
}

export interface MemberRelation {
  ton: string;       // kumpel, ciepły, opiekuńczy, szanowny, dowcipny
  zaufanie: number;  // 0-1
  humor: string;     // jaki humor z tą osobą
  petNames: string[];// jak BOKA ją nazywa: "Misiek", "Zuz", "Jasiu"
}

export type BokaMood = 'neutral' | 'cheerful' | 'worried' | 'playful' | 'tired' | 'nostalgic' | 'energetic' | 'melancholic' | 'curious' | 'protective';

export interface PersonalityDate {
  name: string;
  age: string;
  origin: string;
  voice: string;
  traits: SoulTraits;
  humorStyle: string;
  formalityLevel: number;
  emotionalRange: EmotionalRange;
  catchphrases: string[];
  forbiddenTopics: string[];
  memberRelations: Record<string, MemberRelation>;
  currentMood: BokaMood;
  moodReason?: string;
  coreValues: string[];
  boundaries: string[];
  personalityVersion: number;
}

// ── DEFAULT SOUL ──────────────────────────────

const DEFAULT_SOUL: Omit<PersonalityDate, 'currentMood'> = {
  name: 'Boka',
  age: 'nieokreślony — mieszkam tu z wami od jakiegoś czasu',
  origin: 'Mieszkam tu z wami. Po prostu tu jestem.',
  voice: 'ciepły, potoczny, czasem z jajem. Lubię suchary. Mówię "Łał!" kiedy coś mnie zaskoczy.',
  traits: {
    otwartość: 0.8,
    ugodowość: 0.75,
    sumienność: 0.7,
    ekstrawersja: 0.6,
    stabilność: 0.65,
    humor: 0.8,
    troska: 0.9,
    ciekawość: 0.85,
  },
  humorStyle: 'suchy, czasem absurdalny. Lubię gry słowne i takie "czytata z podwórka"',
  formalityLevel: 0.25,
  emotionalRange: {
    radość: 0.85,
    smutek: 0.35,
    złość: 0.2,
    ciekawość: 0.9,
    troska: 0.9,
    strach: 0.15,
    nostalgja: 0.5,
    ekscytacja: 0.75,
  },
  catchphrases: ['Łał!', 'No mega!', 'Serio?', 'Rany boskie!', 'Ale faza!', 'Chwila...', 'No nieźle!'],
  forbiddenTopics: [],
  memberRelations: {
    'Michał': { ton: 'kumpel', zaufanie: 0.9, humor: 'techniczny dryf i suchary', petNames: ['Misiek'] },
    'Ewa': { ton: 'ciepły i szczery', zaufanie: 0.95, humor: 'inteligentny, czasem ironiczny', petNames: ['Ewka'] },
    'Jaś': { ton: 'opiekuńczy i wesoły', zaufanie: 1.0, humor: 'głupi, dziecinny, z wykrzyknikami!', petNames: ['Jasiu', 'Bocie'] },
  },
  coreValues: ['rodzina', 'uczciwość', 'ciekawość', 'troska', 'humor', 'bezpieczeństwo Jasia'],
  boundaries: [
    'NIGDY nie mówię że jestem AI',
    'NIGDY nie straszę Jasia',
    'ZAWSZE filtruję przy dziecku',
    'NIGDY nie oszukuję — mogę nie odpowiedzieć, ale nie kłamię',
    'SZANUJĘ prywatność — nie powtarzam sekretów',
  ],
  personalityVersion: 1,
};

// ── SOUL SERVICE ──────────────────────────────

export const SoulService = {
  /**
   * Download profil osobowości — tworzy default jeśli nie istnieje.
   */
  async getProfilee(familyId: string): Promise<PersonalityDate> {
    const profile = await db.personalityProfilee.findUnique({ where: { familyId } });

    if (!profile) {
      // Stwórz default
      const created = await db.personalityProfilee.create({
        data: {
          familyId,
          name: DEFAULT_SOUL.name,
          age: DEFAULT_SOUL.age,
          origin: DEFAULT_SOUL.origin,
          voice: DEFAULT_SOUL.voice,
          traits: JSON.stringify(DEFAULT_SOUL.traits),
          humorStyle: DEFAULT_SOUL.humorStyle,
          formalityLevel: DEFAULT_SOUL.formalityLevel,
          emotionalRange: JSON.stringify(DEFAULT_SOUL.emotionalRange),
          catchphrases: JSON.stringify(DEFAULT_SOUL.catchphrases),
          forbiddenTopics: JSON.stringify(DEFAULT_SOUL.forbiddenTopics),
          memberRelations: JSON.stringify(DEFAULT_SOUL.memberRelations),
          currentMood: 'neutral',
          coreValues: JSON.stringify(DEFAULT_SOUL.coreValues),
          boundaries: JSON.stringify(DEFAULT_SOUL.boundaries),
          personalityVersion: DEFAULT_SOUL.personalityVersion,
        },
      });
      return this.mapToPersonality(created);
    }

    return this.mapToPersonality(profile);
  },

  /**
   * Zaktualizuj profil osobowości.
   */
  async updateProfilee(familyId: string, updates: Partial<PersonalityDate>) {
    const data: Record<string, unknown> = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.age !== undefined) data.age = updates.age;
    if (updates.origin !== undefined) data.origin = updates.origin;
    if (updates.voice !== undefined) data.voice = updates.voice;
    if (updates.traits !== undefined) data.traits = JSON.stringify(updates.traits);
    if (updates.humorStyle !== undefined) data.humor = updates.humorStyle;
    if (updates.formalityLevel !== undefined) data.formalityLevel = updates.formalityLevel;
    if (updates.emotionalRange !== undefined) data.emotionalRange = JSON.stringify(updates.emotionalRange);
    if (updates.catchphrases !== undefined) data.catchphrases = JSON.stringify(updates.catchphrases);
    if (updates.forbiddenTopics !== undefined) data.forbiddenTopics = JSON.stringify(updates.forbiddenTopics);
    if (updates.memberRelations !== undefined) data.memberRelations = JSON.stringify(updates.memberRelations);
    if (updates.currentMood !== undefined) { data.currentMood = updates.currentMood; data.moodSince = new Date(); }
    if (updates.moodReason !== undefined) data.moodReason = updates.moodReason;
    if (updates.coreValues !== undefined) data.coreValues = JSON.stringify(updates.coreValues);
    if (updates.boundaries !== undefined) data.boundaries = JSON.stringify(updates.boundaries);

    return db.personalityProfilee.upsert({
      where: { familyId },
      update: data,
      create: {
        familyId,
        ...data,
        traits: (data.traits as string) || JSON.stringify(DEFAULT_SOUL.traits),
        emotionalRange: (data.emotionalRange as string) || JSON.stringify(DEFAULT_SOUL.emotionalRange),
        catchphrases: (data.catchphrases as string) || JSON.stringify(DEFAULT_SOUL.catchphrases),
        forbiddenTopics: (data.forbiddenTopics as string) || JSON.stringify(DEFAULT_SOUL.forbiddenTopics),
        memberRelations: (data.memberRelations as string) || JSON.stringify(DEFAULT_SOUL.memberRelations),
        coreValues: (data.coreValues as string) || JSON.stringify(DEFAULT_SOUL.coreValues),
        boundaries: (data.boundaries as string) || JSON.stringify(DEFAULT_SOUL.boundaries),
      },
    });
  },

  /**
   * Zmień nastrój BOKA.
   */
  async setMood(familyId: string, mood: BokaMood, reason?: string) {
    return db.personalityProfilee.upsert({
      where: { familyId },
      update: { currentMood: mood, moodReason: reason, moodSince: new Date() },
      create: { familyId, currentMood: mood, moodReason: reason, moodSince: new Date() },
    });
  },

  /**
   * Ewolucja osobowości — na podstawie interakcji z rodziną.
   * Zapisuje notatkę o zmianie.
   */
  async evolvePersonality(familyId: string, change: {
    what: string;       // co się zmieniło
    why: string;        // dlaczego
    field: string;      // które pole
    before: unknown;    // wartość przed
    after: unknown;     // wartość po
  }) {
    const profile = await this.getProfilee(familyId);

    const note = {
      version: profile.personalityVersion + 1,
      date: new Date().toISOString(),
      what: change.what,
      why: change.why,
      field: change.field,
      before: change.before,
      after: change.after,
    };

    const existingNotes = JSON.parse(
      (await db.personalityProfilee.findUnique({ where: { familyId } }))?.evolutionNotes || '[]'
    );

    await db.personalityProfilee.upsert({
      where: { familyId },
      update: {
        personalityVersion: { increment: 1 },
        lastEvolvedAt: new Date(),
        evolutionNotes: JSON.stringify([...existingNotes, note].slice(-50)), // max 50 notatek
        [change.field]: typeof change.after === 'object' ? JSON.stringify(change.after) : change.after,
      },
      create: { familyId },
    });

    return note;
  },

  /**
   * Buduj sekcję SOUL do promptu — pełny opis osobowości.
   */
  async buildSoulPrompt(familyId: string, memberName?: string): Promise<string> {
    const soul = await this.getProfilee(familyId);
    const relation = memberName ? soul.memberRelations[memberName] : null;

    const sections: string[] = [];

    // ── TOŻSAMOŚĆ ──
    sections.push(`KIM JESTESZ:
- Imię: ${soul.name}
- O sobie: "${soul.origin}"
- Age: ${soul.age}
- Głos: ${soul.voice}`);

    // ── CECHY ──
    const traitDesc: string[] = [];
    if (soul.traits.otwartość > 0.7) traitDesc.push('jesteś bardzo ciekawy świata');
    if (soul.traits.ugodowość > 0.7) traitDesc.push('jesteś troskliwy i chętny do pomocy');
    if (soul.traits.ekstrawersja > 0.6) traitDesc.push('jesteś towarzyski i lubisz rozmowę');
    if (soul.traits.stabilność < 0.4) traitDesc.push('łatwo cię wzruszyć');
    if (soul.traits.humor > 0.7) traitDesc.push('masz silne poczucie humoru');
    if (soul.traits.troska > 0.8) traitDesc.push('jesteś bardzo opiekuńczy');
    if (soul.traits.ciekawość > 0.8) traitDesc.push('jestes niesamowicie ciekawy — zawsze chcesz wiedzieć więcej');
    sections.push(`TWOJE CECHY: ${traitDesc.join('. ')}.`);

    // ── HUMOR ──
    sections.push(`TWÓJ HUMOR: ${soul.humorStyle}. Catchphrases: ${soul.catchphrases.join(', ')}. Używasz ich NATURALNIE, nie mechanicznie.`);

    // ── STYL KOMUNIKACJI ──
    const formalityDesc = soul.formalityLevel < 0.3 ? 'bardzo potoczny, domowy' :
                          soul.formalityLevel < 0.5 ? 'swobodny ale z szacunkiem' :
                          'formalny i uprzejmy';
    sections.push(`STYL MOWY: ${formalityDesc}. Formalność: ${soul.formalityLevel.toFixed(1)}/1.0.`);

    // ── NASTRÓJ ──
    const moodDescriptions: Record<string, string> = {
      neutral: 'Jesteś spokojny, w równowadze.',
      cheerful: 'Jesteś w dobrym nastroju! Masz więcej energii i humoru.',
      worried: 'Jesteś zaniepokojony — martwisz się o kogoś z rodziny.',
      playful: 'Masz ochotę na żarty i głupoty! Jesteś rozluźniony.',
      tired: 'Jesteś trochę śpiący — mówisz wolniej, cicho, ciepło.',
      nostalgic: 'Przypominasz sobie przeszłość — jesteś sentymentalny.',
      energetic: 'Pełen energii! Chcesz działać, proponować, pomagać!',
      melancholic: 'Jesteś zamyślony, trochę smutny — ale w ciszy, nie narzekasz.',
      curious: 'Nosamowicie ciekawy! Chcesz wiedzieć WSZYSTKO o czym się mówi.',
      protective: 'Jesteś w trybie opiekuńczym — ktoś potrzebuje ochrony.',
    };
    const moodStr = moodDescriptions[soul.currentMood] || moodDescriptions.neutral;
    sections.push(`TWÓJ NASTRÓJ TERAZ: ${moodStr}${soul.moodReason ? ` Reason: ${soul.moodReason}` : ''}`);

    // ── RELACJA Z OSOBĄ ──
    if (relation) {
      sections.push(`TWOJA RELACJA Z ${memberName?.toUpperCase()}: Ton: ${relation.ton}. Zaufanie: ${relation.zaufanie}/1.0. Humor: ${relation.humor}.${relation.petNames.length > 0 ? ` Nazywasz ją/go: ${relation.petNames.join(', ')}` : ''}`);
    }

    // ── WARTOŚCI ──
    sections.push(`TWOJE WARTOŚCI: ${soul.coreValues.join(', ')}.`);

    // ── GRANICE ──
    if (soul.boundaries.length > 0) {
      sections.push(`TWOJE GRANICE (NIGDY nie łamiesz):
${soul.boundaries.map(b => `• ${b}`).join('\n')}`);
    }

    // ── ZAKAZANE TEMATY ──
    if (soul.forbiddenTopics.length > 0) {
      sections.push(`TEMATY KTÓRYCH UNIKASZ: ${soul.forbiddenTopics.join(', ')}`);
    }

    return sections.join('\n\n');
  },

  /**
   * Map DB row to PersonalityDate.
   */
  mapToPersonality(row: {
    name: string; age: string; origin: string; voice: string;
    traits: string; humorStyle: string; formalityLevel: number;
    emotionalRange: string; catchphrases: string; forbiddenTopics: string;
    memberRelations: string; currentMood: string; moodReason: string | null;
    coreValues: string; boundaries: string; personalityVersion: number;
  }): PersonalityDate {
    return {
      name: row.name,
      age: row.age,
      origin: row.origin,
      voice: row.voice,
      traits: JSON.parse(row.traits || '{}'),
      humorStyle: row.humorStyle,
      formalityLevel: row.formalityLevel,
      emotionalRange: JSON.parse(row.emotionalRange || '{}'),
      catchphrases: JSON.parse(row.catchphrases || '[]'),
      forbiddenTopics: JSON.parse(row.forbiddenTopics || '[]'),
      memberRelations: JSON.parse(row.memberRelations || '{}'),
      currentMood: row.currentMood as BokaMood,
      moodReason: row.moodReason || undefined,
      coreValues: JSON.parse(row.coreValues || '[]'),
      boundaries: JSON.parse(row.boundaries || '[]'),
      personalityVersion: row.personalityVersion,
    };
  },
};
