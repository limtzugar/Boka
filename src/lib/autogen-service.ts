// ═══════════════════════════════════════════════════════════
// BOKA OS — AutoGen-inspired Multi-Agent Messaging
// ═══════════════════════════════════════════════════════════
//
// Źródło: github.com/microsoft/autogen — actor model + async messaging
// Adaptacja: agenci BOKA komunikują się asynchronicznie przez topics.
//
// Wzorce:
//   - send(fromAgent, toAgent, topic, payload) — point-to-point
//   - broadcast(fromAgent, topic, payload) — do wszystkich subskrybentów tematu
//   - SelectorGroupChat — LLM wybiera kto odpowiada
//   - RoundRobin — po kolei każdy agent
//
// Agenci:
//   - orchestrator    — główny koordynator (domyślny)
//   - child_agent     — specjalizacja dla dzieci
//   - finance_agent   — finanse rodziny
//   - health_agent    — zdrowie
//   - education_agent — edukacja
//   - reflection_agent — refleksja nad działaniami
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { chatCompletion } from '@/lib/ai-providers';

// ── Typy ───────────────────────────────────

export type AgentId =
  | 'orchestrator'
  | 'child_agent'
  | 'finance_agent'
  | 'health_agent'
  | 'education_agent'
  | 'reflection_agent'
  | string;

export type MessageTopic =
  | 'discussion'
  | 'reflection'
  | 'research'
  | 'ritual'
  | 'alert'
  | 'planning'
  | string;

export interface AgentMessagePayload {
  content: string;
  structuredData?: Record<string, any>;
  replyExpected?: boolean;
}

export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string | null;
  topic: string;
  payload: AgentMessagePayload;
  inReplyTo: string | null;
  status: string;
  createdAt: Date;
}

// ── Agent registry — specjalizacje ────────

export const AGENT_REGISTRY: Record<string, {
  role: string;
  systemPrompt: string;
  specialties: string[];
}> = {
  orchestrator: {
    role: 'Koordynator',
    systemPrompt: 'Jesteś głównym koordynatorem rodziny. Decydujesz kto odpowiada i syntetyzujesz odpowiedzi podagentów.',
    specialties: ['general', 'coordination'],
  },
  child_agent: {
    role: 'Agent dziecięcy',
    systemPrompt: 'Mówisz do dziecka prostym, ciepłym językiem. Unikasz trudnych słów. Zawsze bezpiecznie.',
    specialties: ['child_culture', 'education', 'play'],
  },
  finance_agent: {
    role: 'Agent finansowy',
    systemPrompt: 'Specjalizujesz się w budżecie, wydatkach, oszczędnościach. Pragmatyczny, konkretny.',
    specialties: ['finance', 'budget', 'savings'],
  },
  health_agent: {
    role: 'Agent zdrowia',
    systemPrompt: 'Zdrowie fizyczne i psychiczne rodziny. Empatyczny, ostrożny, nie dajesz rad medycznych.',
    specialties: ['health', 'wellbeing', 'mental'],
  },
  education_agent: {
    role: 'Agent edukacyjny',
    systemPrompt: 'Pomagasz w nauce, edukacji, rozwijaniu ciekawości. Inspirujący, cierpliwy.',
    specialties: ['education', 'learning', 'curiosity'],
  },
  reflection_agent: {
    role: 'Agent refleksyjny',
    systemPrompt: 'Refleksja nad działaniami BOKA. Co poszło dobrze, co poprawić. Generuje ImprovementLog.',
    specialties: ['reflection', 'meta', 'improvement'],
  },
};

// ── Send / Broadcast ───────────────────────

export async function sendMessage(params: {
  familyId: string;
  fromAgent: string;
  toAgent: string;
  topic: string;
  payload: AgentMessagePayload;
  inReplyTo?: string;
}): Promise<AgentMessage> {
  const msg = await db.agentMessage.create({
    data: {
      familyId: params.familyId,
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      topic: params.topic,
      payload: JSON.stringify(params.payload),
      inReplyTo: params.inReplyTo || null,
      status: 'queued',
    },
  });

  return {
    id: msg.id,
    fromAgent: msg.fromAgent,
    toAgent: msg.toAgent,
    topic: msg.topic,
    payload: JSON.parse(msg.payload),
    inReplyTo: msg.inReplyTo,
    status: msg.status,
    createdAt: msg.createdAt,
  };
}

export async function broadcast(params: {
  familyId: string;
  fromAgent: string;
  topic: string;
  payload: AgentMessagePayload;
}): Promise<AgentMessage> {
  return sendMessage({
    ...params,
    toAgent: '', // pusty = broadcast
  });
}

// ── Receive messages ───────────────────────

export async function receiveMessages(
  familyId: string,
  agentId: string,
  opts?: { topic?: string; includeBroadcast?: boolean; limit?: number }
): Promise<AgentMessage[]> {
  const where: any = {
    familyId,
    status: { in: ['queued', 'delivered'] },
    OR: [
      { toAgent: agentId },
      ...(opts?.includeBroadcast === false ? [] : [{ toAgent: '' }]),
    ],
  };
  if (opts?.topic) where.topic = opts.topic;

  const messages = await db.agentMessage.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: opts?.limit || 20,
  });

  // Mark as delivered
  await db.agentMessage.updateMany({
    where: { id: { in: messages.map(m => m.id) } },
    data: { status: 'delivered', deliveredAt: new Date() },
  });

  return messages.map(m => ({
    id: m.id,
    fromAgent: m.fromAgent,
    toAgent: m.toAgent,
    topic: m.topic,
    payload: JSON.parse(m.payload),
    inReplyTo: m.inReplyTo,
    status: m.status,
    createdAt: m.createdAt,
  }));
}

export async function markProcessed(messageId: string) {
  await db.agentMessage.update({
    where: { id: messageId },
    data: { status: 'processed', processedAt: new Date() },
  });
}

// ── SelectorGroupChat — LLM wybiera kto odpowiada ──

export interface GroupChatResult {
  selectedAgent: string;
  reply: string;
  reasoning: string;
  messages: AgentMessage[];
}

/**
 * SelectorGroupChat (AutoGen pattern):
 *   1. Pobierz wszystkie wiadomości w temacie (kolejność chronologiczna)
 *   2. LLM wybiera kto ma odpowiedzieć
 *   3. Wybrany agent generuje odpowiedź
 *   4. Zapisz odpowiedź do bazy
 */
export async function selectorGroupChat(params: {
  familyId: string;
  topic: string;
  trigger: string;       // treść inicjująca
  availableAgents: string[];
  maxRounds?: number;    // default 3
}): Promise<GroupChatResult> {
  const maxRounds = params.maxRounds ?? 3;
  const messages: AgentMessage[] = [];

  // Inicjuj rozmowę: orchestrator wysyła trigger
  const initial = await sendMessage({
    familyId: params.familyId,
    fromAgent: 'orchestrator',
    toAgent: '', // broadcast
    topic: params.topic,
    payload: { content: params.trigger, replyExpected: true },
  });
  messages.push(initial);

  let lastReply = params.trigger;
  let lastAgent = 'orchestrator';

  for (let round = 0; round < maxRounds; round++) {
    // Kto odpowiada? (selector)
    const agentDescriptions = params.availableAgents
      .map(a => `- ${a}: ${AGENT_REGISTRY[a]?.role || 'agent'} — ${AGENT_REGISTRY[a]?.specialties.join(', ') || 'general'}`)
      .join('\n');

    const selectorPrompt = `Ostatnia wiadomość w temacie "${params.topic}":
"""
${lastReply}
"""

Dostępni agenci:
${agentDescriptions}

Który agent ma odpowiedzieć? Zwróć WYŁĄCZNIE nazwę agenta (string).`;

    let selectedAgent: string;
    try {
      const resp = await chatCompletion([
        { role: 'system', content: 'Wybierasz agenta do odpowiedzi. Zwróć WYŁĄCZNIE nazwę agenta.' },
        { role: 'user', content: selectorPrompt },
      ]);
      selectedAgent = resp.trim().split('\n')[0].replace(/[^a-z_]/gi, '');
      if (!params.availableAgents.includes(selectedAgent)) {
        selectedAgent = 'orchestrator';
      }
    } catch {
      selectedAgent = 'orchestrator';
    }

    // Wybrany agent generuje odpowiedź
    const agent = AGENT_REGISTRY[selectedAgent] || AGENT_REGISTRY.orchestrator;
    let reply: string;
    try {
      reply = await chatCompletion([
        { role: 'system', content: agent.systemPrompt },
        { role: 'user', content: `Temat: ${params.topic}\n\nOstatnia wiadomość:\n${lastReply}\n\nTwoja odpowiedź:` },
      ]);
    } catch (e: any) {
      reply = `[Błąd agenta ${selectedAgent}: ${e.message}]`;
    }

    const msg = await sendMessage({
      familyId: params.familyId,
      fromAgent: selectedAgent,
      toAgent: lastAgent,
      topic: params.topic,
      payload: { content: reply, replyExpected: round < maxRounds - 1 },
      inReplyTo: messages[messages.length - 1].id,
    });
    messages.push(msg);

    lastReply = reply;
    lastAgent = selectedAgent;

    // Jeśli agent nie oczekuje odpowiedzi, kończymy
    if (round === maxRounds - 1) break;
  }

  return {
    selectedAgent: lastAgent,
    reply: lastReply,
    reasoning: `SelectorGroupChat zakończony po ${messages.length} wiadomościach`,
    messages,
  };
}

// ── Get topic history ──────────────────────

export async function getTopicHistory(
  familyId: string,
  topic: string,
  limit = 50
): Promise<AgentMessage[]> {
  const messages = await db.agentMessage.findMany({
    where: { familyId, topic },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  return messages.map(m => ({
    id: m.id,
    fromAgent: m.fromAgent,
    toAgent: m.toAgent,
    topic: m.topic,
    payload: JSON.parse(m.payload),
    inReplyTo: m.inReplyTo,
    status: m.status,
    createdAt: m.createdAt,
  }));
}
