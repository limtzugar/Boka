import { NextRequest, NextResponse } from 'next/server';
import { requestForget, cancelForgetRequest, listForgetRequests, detectForgetCommand, type ForgetScope } from '@/lib/forget-service';
import { logDecision } from '@/lib/audit-service';

// ═══════════════════════════════════════════════════════════
// BOKA — Forget API (v0.3.17 — Privacy Layer)
// POST /api/memory/forget — request forget (soft delete + schedule hard delete)
// GET /api/memory/forget — list forget requests
// DELETE /api/memory/forget?id= — cancel forget request (within 30d window)
// ═══════════════════════════════════════════════════════════

// ── POST: Request forget ─────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { familyId, memberId, scope, query, conversationId, entityId, since, until, triggeredBy } = body;

    if (!familyId) {
      return NextResponse.json({ error: 'familyId required' }, { status: 400 });
    }

    // If no explicit scope, try to detect from query
    let finalScope: ForgetScope = scope ?? 'topic';
    let finalQuery = query;
    if (!scope && query) {
      const detected = detectForgetCommand(query);
      if (detected.isForget) {
        finalScope = detected.scope ?? 'topic';
        finalQuery = detected.query ?? query;
      }
    }

    const result = await requestForget({
      familyId,
      memberId,
      scope: finalScope,
      query: finalQuery,
      conversationId,
      entityId,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
      triggeredBy: triggeredBy ?? 'api',
    });

    return NextResponse.json({
      ok: true,
      ...result,
      message: `Zapomniano ${result.affectedCount} elementów. Trwałe usunięcie: ${result.hardDeleteAt.toISOString().slice(0, 10)}. Możesz cofnąć w ciągu 30 dni.`,
    });
  } catch (e: any) {
    console.error('[forget] POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── GET: List forget requests ────────────────
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const familyId = url.searchParams.get('familyId');
    if (!familyId) {
      return NextResponse.json({ error: 'familyId required' }, { status: 400 });
    }
    const status = url.searchParams.get('status') ?? undefined;
    const memberId = url.searchParams.get('memberId') ?? undefined;
    const limit = parseInt(url.searchParams.get('limit') ?? '50');

    const requests = await listForgetRequests(familyId, { status, memberId, limit });
    return NextResponse.json({ requests });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── DELETE: Cancel forget request ────────────
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const familyId = url.searchParams.get('familyId');
    const reason = url.searchParams.get('reason') ?? undefined;

    if (!id || !familyId) {
      return NextResponse.json({ error: 'id and familyId required' }, { status: 400 });
    }

    const success = await cancelForgetRequest(id, familyId, reason ?? undefined);
    if (!success) {
      return NextResponse.json({ error: 'Forget request not found or already processed' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      message: 'Prośba o zapomnienie anulowana. Wspomnienia przywrócone.',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
