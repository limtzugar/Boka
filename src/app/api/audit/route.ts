import { NextRequest, NextResponse } from 'next/server';
import { getAuditLog, logDecision, getAuditEntry, type AuditCategory, type AuditRisk } from '@/lib/audit-service';

// ═══════════════════════════════════════════════════════════
// BOKA — Audit Log API (v0.3.17 — Privacy Layer)
// GET /api/audit — list audit entries with filters
// POST /api/audit — log decision (called from agents)
// ═══════════════════════════════════════════════════════════

// ── GET: List audit entries ──────────────────
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const familyId = url.searchParams.get('familyId');
    if (!familyId) {
      return NextResponse.json({ error: 'familyId required' }, { status: 400 });
    }

    const agentId = url.searchParams.get('agentId') ?? undefined;
    const category = (url.searchParams.get('category') as AuditCategory) ?? undefined;
    const riskLevel = (url.searchParams.get('riskLevel') as AuditRisk) ?? undefined;
    const conversationId = url.searchParams.get('conversationId') ?? undefined;
    const since = url.searchParams.get('since') ? new Date(url.searchParams.get('since')!) : undefined;
    const until = url.searchParams.get('until') ? new Date(url.searchParams.get('until')!) : undefined;
    const limit = parseInt(url.searchParams.get('limit') ?? '100');
    const offset = parseInt(url.searchParams.get('offset') ?? '0');

    const result = await getAuditLog({
      familyId,
      agentId: agentId ?? undefined,
      category,
      riskLevel,
      conversationId,
      since,
      until,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POST: Log decision ───────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { familyId, agentId, messageId, conversationId, action, category, reasoning, inputSummary, outputSummary, riskLevel, contextJson, forgettable } = body;

    if (!familyId || !action || !category || !reasoning) {
      return NextResponse.json({ error: 'familyId, action, category, reasoning required' }, { status: 400 });
    }

    const id = await logDecision({
      familyId,
      agentId,
      messageId,
      conversationId,
      action,
      category,
      reasoning,
      inputSummary,
      outputSummary,
      riskLevel,
      contextJson,
      forgettable,
    });

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
