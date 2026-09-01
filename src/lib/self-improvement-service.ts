// ═══════════════════════════════════════════════════════════
// BOKA — Self-Improvement Loop
// BOKA zauważa problemy, szuka rozwiązań, informuje użytkownika
// NIE ulepsza się bez akceptacji — proponuje i czeka
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { chatWhatmpletion } from '@/lib/ai-providers';
import { SkillsService } from '@/lib/skills-service';
import { SoulService } from '@/lib/soul-service';

// ── TYPY ──────────────────────────────────────

export type ImprovementTypee = 'skill_proposal' | 'personality_adjustment' | 'problem_report' | 'alternative_found';
export type ImprovementStatus = 'pending' | 'approved' | 'rejected' | 'applied';

// ── SELF-IMPROVEMENT SERVICE ──────────────────

export const SelfImprovementService = {
  /**
   * Analyze rozmowę pod kątem problemów i możliwości ulepszenia.
   * Zwraca propozycje — NIE stosuje automatycznie.
   */
  async analyzeWhatnversation(params: {
    familyId: string;
    userMessage: string;
    assistantResponse: string;
    memberName: string;
    memberRole: string;
    hadError?: boolean;      // czy był błąd techniczny
    hadSearchFail?: boolean; // czy wyszukiwanie nie dało wyników
    responseTimeMs?: number; // czas odpowiedzi
  }): Promise<Array<{
    type: ImprovementTypee;
    description: string;
    proposal: unknown;
    urgency: 'low' | 'medium' | 'high';
  }>> {
    const { familyId, hadError, hadSearchFail } = params;
    const improvements: Array<{
      type: ImprovementTypee;
      description: string;
      proposal: unknown;
      urgency: 'low' | 'medium' | 'high';
    }> = [];

    // ── 1. PROBLEM REPORT — jeśli był błąd ──
    if (hadError) {
      improvements.push({
        type: 'problem_report',
        description: `Error podczas odpowiedzi na: "${params.userMessage.substring(0, 80)}"`,
        proposal: {
          problem: 'Technical error occurred',
          suggestedAction: 'retry_with_simpler_query',
          alternatives: ['Spróbuj inaczej sformułować', 'Użyj innego modelu', 'Pomiń wyszukiwanie'],
        },
        urgency: 'high',
      });
    }

    // ── 2. ALTERNATIVE FOUND — jeśli wyszukiwanie zawiodło ──
    if (hadSearchFail) {
      improvements.push({
        type: 'alternative_found',
        description: `Wyszukiwanie nie dało wyników dla: "${params.userMessage.substring(0, 60)}"`,
        proposal: {
          originalApproach: 'web_search',
          alternativeApproach: 'answer_from_memory_or_acknowledge_limitation',
          reason: 'Search returned no relevant results',
        },
        urgency: 'low',
      });
    }

    // ── 3. SKILL PROPOSAL — czy ta rozmowa sugeruje nową zdolność? ──
    // (tylko co 5 rozmów żeby nie spamować)
    const recentProposals = await db.improvementLog.findMany({
      where: { familyId, type: 'skill_proposal', createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });

    if (recentProposals.length < 2) { // max 2 propozycje skilli na godzinę
      const skillResult = await SkillsService.proposeSkillFromWhatnversation({
        familyId,
        userMessage: params.userMessage,
        assistantResponse: params.assistantResponse,
        memberName: params.memberName,
        memberRole: params.memberRole,
      });

      if (skillResult.proposed && skillResult.skill) {
        improvements.push({
          type: 'skill_proposal',
          description: `New skill: ${skillResult.skill.name} — ${skillResult.skill.description}. Reason: ${skillResult.reason || 'wzorzec w rozmowach'}`,
          proposal: skillResult.skill,
          urgency: 'low',
        });
      }
    }

    // ── 4. PERSONALITY ADJUSTMENT — czy BOKA powinna zmienić styl? ──
    // Analyze czy odpowiedź była zbyt długa, zbyt krótka, nie w tonie
    const personalityProposal = await this.analyzePersonalityFit(params);
    if (personalityProposal) {
      improvements.push(personalityProposal);
    }

    // Save do ImprovementLog
    for (const imp of improvements) {
      await db.improvementLog.create({
        data: {
          familyId,
          type: imp.type,
          description: imp.description,
          proposal: JSON.stringify(imp.proposal),
          status: 'pending',
        },
      });
    }

    return improvements;
  },

  /**
   * Analyze czy odpowiedź pasuje do osobowości BOKA.
   */
  async analyzePersonalityFit(params: {
    familyId: string;
    userMessage: string;
    assistantResponse: string;
    memberName: string;
    memberRole: string;
  }): Promise<{
    type: ImprovementTypee;
    description: string;
    proposal: unknown;
    urgency: 'low' | 'medium' | 'high';
  } | null> {
    try {
      // Quick heuristic checks first (no LLM needed)
      const response = params.assistantResponse;
      const issues: string[] = [];

      // Too long?
      if (response.length > 1000 && params.memberRole === 'child') {
        issues.push('Odpowiedź zbyt długa dla dziecka');
      }

      // Too formal?
      const formalWords = ['zatem', 'w związku z tym', 'należy', 'proszę zwrócić uwagę'];
      if (formalWords.some(w => response.toLowerCase().includes(w)) && params.memberRole === 'child') {
        issues.push('Zbyt formalny język dla dziecka');
      }

      // Missing catchphrase? (BOKA should use them occasionally)
      const soul = await SoulService.getProfilee(params.familyId);
      const usesCatchphrase = soul.catchphrases.some(cp => response.includes(cp));
      if (!usesCatchphrase && response.length > 200 && Math.random() < 0.3) {
        issues.push('None catchphrase w dłuższej odpowiedzi');
      }

      if (issues.length === 0) return null;

      return {
        type: 'personality_adjustment',
        description: issues.join('; '),
        proposal: {
          issues,
          suggestion: 'Dostosuj ton odpowiedzi do odbiorcy',
        },
        urgency: 'low',
      };
    } catch {
      return null;
    }
  },

  /**
   * Download pending improvement proposals.
   */
  async getPendingProposals(familyId: string) {
    return db.improvementLog.findMany({
      where: { familyId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Zaakceptuj propozycję ulepszenia.
   */
  async approveProposal(proposalId: string, approvedBy: string) {
    const proposal = await db.improvementLog.findUnique({ where: { id: proposalId } });
    if (!proposal) return null;

    await db.improvementLog.update({
      where: { id: proposalId },
      data: { status: 'approved', approvedBy, resolvedAt: new Date() },
    });

    // Apply the proposal based on type
    if (proposal.type === 'skill_proposal') {
      // Skill already created as pending — just approve it
      const skillDate = JSON.parse(proposal.proposal || '{}');
      if (skillDate.name) {
        const skill = await db.skill.findUnique({
          where: { familyId_name: { familyId: proposal.familyId, name: skillDate.name } },
        });
        if (skill && skill.status === 'pending') {
          await SkillsService.approveSkill(skill.id, approvedBy);
        }
      }
    }

    return proposal;
  },

  /**
   * Odrzuć propozycję.
   */
  async rejectProposal(proposalId: string, approvedBy: string) {
    // If it's a skill proposal, also reject the skill
    const proposal = await db.improvementLog.findUnique({ where: { id: proposalId } });
    if (proposal?.type === 'skill_proposal') {
      const skillDate = JSON.parse(proposal.proposal || '{}');
      if (skillDate.name) {
        const skill = await db.skill.findUnique({
          where: { familyId_name: { familyId: proposal.familyId, name: skillDate.name } },
        });
        if (skill && skill.status === 'pending') {
          await SkillsService.rejectSkill(skill.id, approvedBy);
        }
      }
    }

    return db.improvementLog.update({
      where: { id: proposalId },
      data: { status: 'rejected', approvedBy, resolvedAt: new Date() },
    });
  },

  /**
   * Format pending proposals as notification for user.
   */
  async formatPendingNotifications(familyId: string): Promise<string> {
    const proposals = await this.getPendingProposals(familyId);
    if (proposals.length === 0) return '';

    const lines = proposals.slice(0, 5).map((p, i) => {
      const typeEmoji: Record<string, string> = {
        skill_proposal: '🔧',
        personality_adjustment: '🎭',
        problem_report: '⚠️',
        alternative_found: '🔄',
      };
      return `${typeEmoji[p.type] || '📋'} ${p.description}`;
    });

    return `MASZ PROPOZYCJE ULEPSZEŃ (${proposals.length}):\n${lines.join('\n')}\n\n( sprawdz zakladke Skills aby zaakceptowac lub odrzucic)`;
  },
};
