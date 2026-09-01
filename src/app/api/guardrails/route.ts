import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import { db } from '@/lib/db';
import {
  runAllGuardrails, runInputGuardrails, runOutputGuardrails,
  getOrCreateSession, appendToSession,
  generateStructured, STRUCTURED_SCHEMAS,
} from '@/lib/agents-sdk-service';

// POST /api/guardrails?action=check — run guardrails on input+output
// POST /api/guardrails?action=check_input — only input guardrails
// POST /api/guardrails?action=check_output — only output guardrails
// POST /api/guardrails?action=session_append&memberId=... — append to session
// GET /api/guardrails?action=session&memberId=... — get session messages
// POST /api/guardrails?action=structured&schema=... — generate structured output
// GET /api/guardrails?action=schemas — list available schemas

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action');
    const data = await req.json();

    if (action === 'check' || action === 'check_input' || action === 'check_output') {
      const ctx = {
        familyId: family.id,
        memberId: data.memberId,
        memberAge: data.memberAge || 18,
        childNearby: data.childNearby || false,
        soulProfile: data.soulProfile,
      };

      if (action === 'check') {
        const result = await runAllGuardrails(data.input, data.output, ctx);
        return NextResponse.json(result);
      }
      if (action === 'check_input') {
        const results = await runInputGuardrails(data.input, ctx);
        return NextResponse.json({ results });
      }
      if (action === 'check_output') {
        const results = await runOutputGuardrails(data.output, ctx);
        return NextResponse.json({ results });
      }
    }

    if (action === 'session_append') {
      const memberId = req.nextUrl.searchParams.get('memberId');
      if (!memberId) return NextResponse.json({ error: 'Podaj memberId' }, { status: 400 });
      await appendToSession(family.id, memberId, {
        role: data.role,
        content: data.content,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'structured') {
      const schemaName = req.nextUrl.searchParams.get('schema') as any;
      if (!schemaName || !STRUCTURED_SCHEMAS[schemaName]) {
        return NextResponse.json({ error: 'Podaj poprawną nazwę schemy' }, { status: 400 });
      }
      const result = await generateStructured(data.prompt, schemaName, data.systemPrompt);
      return NextResponse.json({ result });
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

    if (action === 'schemas') {
      return NextResponse.json({ schemas: Object.keys(STRUCTURED_SCHEMAS) });
    }

    if (action === 'session') {
      const memberId = req.nextUrl.searchParams.get('memberId');
      if (!memberId) return NextResponse.json({ error: 'Podaj memberId' }, { status: 400 });
      const result = await getOrCreateSession(family.id, memberId);
      return NextResponse.json({
        messages: result.messages,
        totalMessages: result.session.totalMessages,
        summarizedUpTo: result.session.summarizedUpTo,
        hasSummary: !!result.session.summarizedHistory,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
