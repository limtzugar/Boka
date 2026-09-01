import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import {
  sendMessage, broadcast, receiveMessages, markProcessed,
  selectorGroupChat, getTopicHistory, AGENT_REGISTRY,
} from '@/lib/autogen-service';

// POST /api/autogen?action=send — send point-to-point message
// POST /api/autogen?action=broadcast — broadcast to topic subscribers
// POST /api/autogen?action=group_chat — SelectorGroupChat
// GET /api/autogen?action=receive&agentId=...&topic=... — receive messages
// GET /api/autogen?action=history&topic=... — get topic history
// GET /api/autogen?action=agents — list registered agents

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action');
    const data = await req.json();

    if (action === 'send') {
      const msg = await sendMessage({
        familyId: family.id,
        fromAgent: data.fromAgent,
        toAgent: data.toAgent,
        topic: data.topic,
        payload: data.payload,
        inReplyTo: data.inReplyTo,
      });
      return NextResponse.json({ message: msg });
    }

    if (action === 'broadcast') {
      const msg = await broadcast({
        familyId: family.id,
        fromAgent: data.fromAgent,
        topic: data.topic,
        payload: data.payload,
      });
      return NextResponse.json({ message: msg });
    }

    if (action === 'group_chat') {
      const result = await selectorGroupChat({
        familyId: family.id,
        topic: data.topic,
        trigger: data.trigger,
        availableAgents: data.availableAgents || Object.keys(AGENT_REGISTRY),
        maxRounds: data.maxRounds,
      });
      return NextResponse.json(result);
    }

    if (action === 'mark_processed') {
      await markProcessed(data.messageId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action');

    if (action === 'agents') {
      return NextResponse.json({ agents: AGENT_REGISTRY });
    }

    if (action === 'receive') {
      const agentId = req.nextUrl.searchParams.get('agentId');
      if (!agentId) return NextResponse.json({ error: 'Podaj agentId' }, { status: 400 });
      const topic = req.nextUrl.searchParams.get('topic') || undefined;
      const messages = await receiveMessages(family.id, agentId, { topic });
      return NextResponse.json({ messages });
    }

    if (action === 'history') {
      const topic = req.nextUrl.searchParams.get('topic');
      if (!topic) return NextResponse.json({ error: 'Podaj topic' }, { status: 400 });
      const history = await getTopicHistory(family.id, topic);
      return NextResponse.json({ history });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
