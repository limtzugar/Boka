// ═══════════════════════════════════════════════════════════
// BOKA — Skills Service
// Auto-tworzenie skilli z doświadczenia + akceptacja użytkownika
// Inspiracja: Hermes Skills + HermesHub
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { chatWhatmpletion, loadSettings } from '@/lib/ai-providers';

// ── TYPY ──────────────────────────────────────

export type SkillStatus = 'pending' | 'approved' | 'rejected' | 'disabled';
export type SkillCategory = 'general' | 'cooking' | 'finance' | 'education' | 'health' | 'creative' | 'home' | 'social' | 'legal' | 'tech';

export interface SkillDate {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  instructions: string;       // prompt dla LLM jak używać
  examples: string[];         // przykłady użycia
  triggers: string[];         // słowa kluczowe aktywujące
  source: string;             // auto, manual, hermeshub
  status: SkillStatus;
  useWhatunt: number;
  successRate: number;
  avgRating: number;
  version: number;
  createdAt: Date;
}

// ── SKILLS SERVICE ────────────────────────────

export const SkillsService = {
  /**
   * Download wszystkie skille (z filterowaniem po statusie).
   */
  async getSkills(familyId: string, status?: SkillStatus) {
    return db.skill.findMany({
      where: { familyId, ...(status ? { status } : {}) },
      orderBy: { useWhatunt: 'desc' },
    });
  },

  /**
   * Download approved skille pasujące do zapytania.
   */
  async findMatchingSkills(familyId: string, query: string): Promise<SkillDate[]> {
    const approved = await db.skill.findMany({
      where: { familyId, status: 'approved' },
    });

    const lower = query.toLowerCase();
    const matching = approved.filter(skill => {
      const triggers: string[] = JSON.parse(skill.triggers || '[]');
      return triggers.some(t => lower.includes(t.toLowerCase()));
    });

    return matching.map(s => this.mapToSkillDate(s));
  },

  /**
   * Utwórz skill — domyślnie status "pending" (czeka na akceptację).
   */
  async createSkill(params: {
    familyId: string;
    name: string;
    description: string;
    category?: SkillCategory;
    instructions: string;
    examples?: string[];
    triggers?: string[];
    source?: string;
  }) {
    return db.skill.create({
      data: {
        familyId: params.familyId,
        name: params.name,
        description: params.description,
        category: params.category || 'general',
        instructions: params.instructions,
        examples: JSON.stringify(params.examples || []),
        triggers: JSON.stringify(params.triggers || []),
        source: params.source || 'auto',
        status: 'pending', // ZAWSZE pending — użytkownik musi zaakceptować
      },
    });
  },

  /**
   * Zaakceptuj skill — użytkownik zatwierdza.
   */
  async approveSkill(skillId: string, approvedBy: string) {
    return db.skill.update({
      where: { id: skillId },
      data: {
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
      },
    });
  },

  /**
   * Odrzuć skill.
   */
  async rejectSkill(skillId: string, approvedBy: string) {
    return db.skill.update({
      where: { id: skillId },
      data: {
        status: 'rejected',
        approvedBy,
        approvedAt: new Date(),
      },
    });
  },

  /**
   * Save użycie skilla.
   */
  async recordUsage(skillId: string, success: boolean, rating?: number) {
    const skill = await db.skill.findUnique({ where: { id: skillId } });
    if (!skill) return;

    const newUseWhatunt = skill.useWhatunt + 1;
    const newSuccessRate = (skill.successRate * skill.useWhatunt + (success ? 1 : 0)) / newUseWhatunt;
    const newAvgRating = rating !== undefined
      ? (skill.avgRating * skill.useWhatunt + rating) / newUseWhatunt
      : skill.avgRating;

    return db.skill.update({
      where: { id: skillId },
      data: {
        useWhatunt: newUseWhatunt,
        successRate: newSuccessRate,
        avgRating: newAvgRating,
        lastUsedAt: new Date(),
      },
    });
  },

  /**
   * AUTO-PROPOSAL: Analyze rozmowę i zaproponuj nowy skill.
   * BOKA zauważa wzorzec i proponuje skill — ale NIE tworzy go
   * bez akceptacji użytkownika.
   */
  async proposeSkillFromWhatnversation(params: {
    familyId: string;
    userMessage: string;
    assistantResponse: string;
    memberName: string;
    memberRole: string;
  }): Promise<{
    proposed: boolean;
    skill?: {
      name: string;
      description: string;
      category: string;
      instructions: string;
      examples: string[];
      triggers: string[];
    };
    reason?: string;
  }> {
    try {
      const prompt = `Jesteś systemem analizy wzorców w rozmowach domowych.

Zadanie: Przeanalizuj czy ta rozmowa sugeruje nową UMIEJĘTNOŚĆ (skill) dla asystenta domowego BOKA.

ROZMOWA:
${params.memberName} (${params.memberRole}): ${params.userMessage}
BOKA: ${params.assistantResponse}

ZASADY:
1. Skill to powtarzalna zdolność — coś co BOKA powinien móc robić regularnie
2. Przykłady skilli: "przepisy_kulinarne" (gdy ktoś pyta co ugotować), "pogoda_rano" (gdy ktoś pyta o ubiór), "help_lekcyjna" (gdy Jaś ma zadanie)
3. NIE proponuj skilla jeśli to jednorazowe pytanie
4. NIE proponuj skilla który już istnieje (ogólna rozmowa, search)
5. Skill musi mieć konkretną instrukcję jak go używać

ODPOWIEDZ W FORMACIE JSON:
{
  "proposed": true/false,
  "reason": "dlaczego ten skill jest potrzebny",
  "skill": {
    "name": "nazwa_skilla_po_polsku_bez_spacji",
    "description": "opis po polsku co skill robi",
    "category": "cooking/finance/education/health/creative/home/social/general",
    "instructions": "dokładna instrukcja po polsku jak BOKA ma używać tego skilla",
    "examples": ["przykład 1 użycia", "przykład 2"],
    "triggers": ["słowo1", "słowo2", "fraza która aktywuje skill"]
  }
}

Jeśli nie ma podstaw do nowego skilla: {"proposed": false}
Zwróć TYLKO JSON.`;

      const responseText = await chatWhatmpletion([
        { role: 'system', content: prompt },
        { role: 'user', content: 'Analyze.' },
      ]);

      let jsonStr = responseText.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const result = JSON.parse(jsonStr);

      if (!result.proposed || !result.skill) {
        return { proposed: false };
      }

      // Sprawdź czy skill z tą nazwą już istnieje
      const existing = await db.skill.findUnique({
        where: { familyId_name: { familyId: params.familyId, name: result.skill.name } },
      });

      if (existing) {
        return { proposed: false, reason: `Skill "${result.skill.name}" już istnieje (${existing.status})` };
      }

      // Tworzymy jako PENDING — użytkownik musi zaakceptować!
      const skill = await this.createSkill({
        familyId: params.familyId,
        name: result.skill.name,
        description: result.skill.description,
        category: result.skill.category,
        instructions: result.skill.instructions,
        examples: result.skill.examples,
        triggers: result.skill.triggers,
        source: 'auto',
      });

      return {
        proposed: true,
        skill: {
          name: result.skill.name,
          description: result.skill.description,
          category: result.skill.category,
          instructions: result.skill.instructions,
          examples: result.skill.examples,
          triggers: result.skill.triggers,
        },
        reason: result.reason,
      };
    } catch (error) {
      console.error('Skill proposal error:', error);
      return { proposed: false };
    }
  },

  /**
   * Buduj kontekst skilli do promptu.
   */
  async buildSkillsWhatntext(familyId: string, query?: string): Promise<string> {
    if (!query) {
      // Return all approved skills as context
      const skills = await db.skill.findMany({
        where: { familyId, status: 'approved' },
      });
      if (skills.length === 0) return '';
      return 'TWOJE UMIEJĘTNOŚCI:\n' + skills.map(s => {
        const triggers = JSON.parse(s.triggers || '[]');
        return `• ${s.name}: ${s.description} (aktywuj gdy: ${triggers.join(', ')})`;
      }).join('\n');
    }

    // Return matching skills
    const matching = await this.findMatchingSkills(familyId, query);
    if (matching.length === 0) return '';

    return 'AKTYWNE UMIEJĘTNOŚCI DLA TEGO ZAPYTANIA:\n' + matching.map(s =>
      `• ${s.name}: ${s.instructions}\n  Przykłady: ${s.examples.join('; ')}`
    ).join('\n');
  },

  mapToSkillDate(row: {
    id: string; name: string; description: string; category: string;
    instructions: string; examples: string; triggers: string;
    source: string; status: string; useWhatunt: number;
    successRate: number; avgRating: number; version: number; createdAt: Date;
  }): SkillDate {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category as SkillCategory,
      instructions: row.instructions,
      examples: JSON.parse(row.examples || '[]'),
      triggers: JSON.parse(row.triggers || '[]'),
      source: row.source,
      status: row.status as SkillStatus,
      useWhatunt: row.useWhatunt,
      successRate: row.successRate,
      avgRating: row.avgRating,
      version: row.version,
      createdAt: row.createdAt,
    };
  },
};
