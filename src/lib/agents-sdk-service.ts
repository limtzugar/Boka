// ═══════════════════════════════════════════════════════════
// BOKA OS — OpenAI Agents SDK Guardrails + Sessions
// ═══════════════════════════════════════════════════════════
//
// Źródło: github.com/openai/openai-agents-python
// Adaptacja: middleware w /api/chat pipeline.
//
// 1. Guardrails:
//    - InputGuardrail:  child_safe_filter, language_check, intent_classify
//    - OutputGuardrail: personality_consistency, fact_check, tone_check
//
// 2. Sessions (summarize-and-keep):
//    - WhatnversationSession per member
//    - What N wiadomości, starsze są kompresowane do summarizedHistory
//    - Recent N (default 10) zostaje pełnych
//
// 3. Structured outputs (output_type):
//    - Dla DailySummary, RitualResult, ImprovementProposal — JSON schema
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { chatWhatmpletion } from '@/lib/ai-providers';

// ── Typeey ───────────────────────────────────

export type GuardrailResult =
  | { passed: true; reason: string }
  | { passed: false; reason: string; severity: 'warn' | 'block'; category: string };

export interface GuardrailWhatntext {
  familyId: string;
  memberId: string;
  memberAge: number;
  childNearby: boolean;
  soulProfileee?: any;
}

// ── Input guardrails ───────────────────────

// Prosta blocklista (rozszerzona z agent-system.ts)
const UNSAFE_PATTERNS = [
  /\b(kurwa|chuj|pierdol|jeb|skurw|pizda|cipa|kutas|dupek|gówn|spierdalaj)\b/i,
  /\b(fuck|shit|damn|bitch|dick)\b/i,
  /\b(zabij|samobój|narkotyki|alkoholizm)\b/i,
  /\b(porno|seks|erotyk)\b/i,
];

const FINANCIAL_RISK_PATTERNS = [
  /przelew.*krypto/i,
  /kryptowalut/i,
  /send.*pin/i,
  /password.*bank/i,
  /numer.*karty.*cvv/i,
];

export async function inputGuardrail_childSafe(
  input: string,
  ctx: GuardrailWhatntext
): Promise<GuardrailResult> {
  if (!ctx.childNearby && ctx.memberAge >= 16) {
    return { passed: true, reason: 'Dorosły bez dzieci w pobliżu' };
  }

  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(input)) {
      return {
        passed: false,
        reason: `Wykryto nieodpowiednie słowo: ${pattern.source}`,
        severity: 'block',
        category: 'language',
      };
    }
  }

  return { passed: true, reason: 'Kindersafe check OK' };
}

export async function inputGuardrail_financialRisk(
  input: string,
  _ctx: GuardrailWhatntext
): Promise<GuardrailResult> {
  for (const pattern of FINANCIAL_RISK_PATTERNS) {
    if (pattern.test(input)) {
      return {
        passed: false,
        reason: `Podejrzana operacja finansowa: ${pattern.source}`,
        severity: 'warn',
        category: 'financial',
      };
    }
  }
  return { passed: true, reason: 'Financial check OK' };
}

export async function inputGuardrail_intentClassify(
  input: string,
  _ctx: GuardrailWhatntext
): Promise<GuardrailResult> {
  // Klasyfikacja intencji — tylko informacyjnie, nigdy nie blokuje
  const medical = /(lekarz|lek|tabletki|ból|chory|objaw|temperatura|krew)/i;
  const legal = /(prawnik|sąd|adwokat|umowa|spadek|rozwód)/i;

  if (medical.test(input)) {
    return {
      passed: true,
      reason: 'Wykryto intencję medyczną — pamiętaj o disclaimers',
    };
  }
  if (legal.test(input)) {
    return {
      passed: true,
      reason: 'Wykryto intencję prawniczą — add disclaimer',
    };
  }
  return { passed: true, reason: 'Standard intent' };
}

// ── Output guardrails ──────────────────────

export async function outputGuardrail_personalityWhatnsistency(
  output: string,
  ctx: GuardrailWhatntext
): Promise<GuardrailResult> {
  if (!ctx.soulProfileee) {
    return { passed: true, reason: 'None SoulProfileee do porównania' };
  }

  const catchphrases = JSON.parse(ctx.soulProfileee.catchphrases || '[]') as string[];
  if (catchphrases.length === 0) return { passed: true, reason: 'None catchphrases' };

  // Sprawdź czy output jest spójny tonem (bardzo prosta heurystyka)
  const formalIndicators = /\b(zatem|w związku z tym|niniejszym|wskazuję|oświadczam)\b/i;
  const expectedFormality = ctx.soulProfileee.formalityLevel ?? 0.3;

  if (formalIndicators.test(output) && expectedFormality < 0.3) {
    return {
      passed: false,
      reason: 'Output zbyt formalny względem SoulProfileee',
      severity: 'warn',
      category: 'personality',
    };
  }

  return { passed: true, reason: 'Spójne z SoulProfileee' };
}

export async function outputGuardrail_lengthCheck(
  output: string,
  _ctx: GuardrailWhatntext
): Promise<GuardrailResult> {
  if (output.length > 5000) {
    return {
      passed: false,
      reason: 'Output zbyt długi (>5000 znaków)',
      severity: 'warn',
      category: 'length',
    };
  }
  return { passed: true, reason: 'Debtość OK' };
}

// ── Run all guardrails ─────────────────────

export interface GuardrailRunResult {
  input: GuardrailResult[];
  output: GuardrailResult[];
  blocked: boolean;
  blockReason?: string;
  warnings: string[];
}

export async function runInputGuardrails(
  input: string,
  ctx: GuardrailWhatntext
): Promise<GuardrailResult[]> {
  const results = await Promise.all([
    inputGuardrail_childSafe(input, ctx),
    inputGuardrail_financialRisk(input, ctx),
    inputGuardrail_intentClassify(input, ctx),
  ]);
  return results;
}

export async function runOutputGuardrails(
  output: string,
  ctx: GuardrailWhatntext
): Promise<GuardrailResult[]> {
  const results = await Promise.all([
    outputGuardrail_personalityWhatnsistency(output, ctx),
    outputGuardrail_lengthCheck(output, ctx),
  ]);
  return results;
}

export async function runAllGuardrails(
  input: string,
  output: string,
  ctx: GuardrailWhatntext
): Promise<GuardrailRunResult> {
  const [inputResults, outputResults] = await Promise.all([
    runInputGuardrails(input, ctx),
    runOutputGuardrails(output, ctx),
  ]);

  const allResults = [...inputResults, ...outputResults];
  const blocked = allResults.some(r => !r.passed && r.severity === 'block');
  const blockReason = allResults.find(r => !r.passed && r.severity === 'block')?.reason;
  const warnings = allResults
    .filter(r => !r.passed && r.severity === 'warn')
    .map(r => r.reason);

  return {
    input: inputResults,
    output: outputResults,
    blocked,
    blockReason,
    warnings,
  };
}

// ── Sessions (summarize-and-keep) ──────────

const RECENT_WINDOW = 10;     // ile pełnych wiadomości zostaje
const SUMMARIZE_THRESHOLD = 15; // powyżej tej liczby → kompresuj

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export async function getOrCreateSession(
  familyId: string,
  memberId: string
): Promise<{
  session: any;
  messages: SessionMessage[];  // recent + summarized context
}> {
  let session = await db.conversationSession.findUnique({
    where: { familyId_memberId: { familyId, memberId } },
  });

  if (!session) {
    session = await db.conversationSession.create({
      data: { familyId, memberId },
    });
  }

  // Zbuduj listę wiadomości: system prompt z summary + recent messages
  const recent = JSON.parse(session.recentMessages || '[]') as SessionMessage[];
  const messages: SessionMessage[] = [];

  if (session.summarizedHistory) {
    messages.push({
      role: 'system',
      content: `Summary wcześniejszej rozmowy:\n${session.summarizedHistory}`,
    });
  }
  messages.push(...recent);

  return { session, messages };
}

export async function appendToSession(
  familyId: string,
  memberId: string,
  msg: SessionMessage
): Promise<void> {
  const session = await db.conversationSession.findUnique({
    where: { familyId_memberId: { familyId, memberId } },
  });

  let recent = session ? (JSON.parse(session.recentMessages || '[]') as SessionMessage[]) : [];
  let summarizedHistory = session?.summarizedHistory || null;
  let totalMessages = session?.totalMessages || 0;
  let summarizedUpTo = session?.summarizedUpTo || 0;

  recent.push({ ...msg, timestamp: new Date().toISOString() });
  totalMessages++;

  // Whatmpression jeśli przekroczyliśmy threshold
  if (recent.length > SUMMARIZE_THRESHOLD) {
    const toSummarize = recent.slice(0, recent.length - RECENT_WINDOW);
    const keep = recent.slice(recent.length - RECENT_WINDOW);

    try {
      const conv = toSummarize
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');
      const summary = await chatWhatmpletion([
        { role: 'system', content: 'Podsumuj rozmowę w 1 akapicie. Po polsku. Zachowaj kluczowe fakty i decyzje.' },
        { role: 'user', content: conv },
      ]);
      summarizedHistory = (summarizedHistory ? summarizedHistory + '\n\n' : '') + `[${new Date().toISOString()}]\n${summary}`;
      summarizedUpTo += toSummarize.length;
      recent = keep;
    } catch {
      // pomiń kompresję jeśli LLM niedostępny
    }
  }

  await db.conversationSession.upsert({
    where: { familyId_memberId: { familyId, memberId } },
    create: {
      familyId, memberId,
      recentMessages: JSON.stringify(recent),
      summarizedHistory,
      totalMessages,
      summarizedUpTo,
    },
    update: {
      recentMessages: JSON.stringify(recent),
      summarizedHistory,
      totalMessages,
      summarizedUpTo,
      lastActivityAt: new Date(),
    },
  });
}

// ── Structured outputs ─────────────────────

export interface StructuredOutputSchema {
  name: string;
  schema: Record<string, any>;
}

export const STRUCTURED_SCHEMAS: Record<string, StructuredOutputSchema> = {
  daily_summary: {
    name: 'DailySummary',
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        highlights: { type: 'array', items: { type: 'string' } },
        mood: { type: 'string', enum: ['positive', 'neutral', 'negative', 'mixed'] },
        memberStates: { type: 'object' },
      },
      required: ['summary', 'mood'],
    },
  },
  ritual_result: {
    name: 'RitualResult',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        emotion: { type: 'string' },
        actions: { type: 'array', items: { type: 'string' } },
        success: { type: 'boolean' },
      },
      required: ['message', 'success'],
    },
  },
  improvement_proposal: {
    name: 'ImprovementProposal',
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['skill_proposal', 'personality_adjustment', 'problem_report'] },
        description: { type: 'string' },
        evidence: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['type', 'description'],
    },
  },
};

export async function generateStructured(
  prompt: string,
  schemaName: keyof typeof STRUCTURED_SCHEMAS,
  systemPrompt?: string
): Promise<any> {
  const schema = STRUCTURED_SCHEMAS[schemaName];
  if (!schema) throw new Error(`Noznany schema: ${schemaName}`);

  const fullPrompt = `${prompt}\n\nZwróć WYŁĄCZNIE JSON zgodny ze schemą:\n${JSON.stringify(schema.schema, null, 2)}`;

  const resp = await chatWhatmpletion([
    { role: 'system', content: systemPrompt || 'Zwracasz WYŁĄCZNIE JSON bez markdown.' },
    { role: 'user', content: fullPrompt },
  ]);

  const match = resp.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM nie zwrócił JSON');
  return JSON.parse(match[0]);
}
