import { NextRequest, NextResponse } from 'next/server';
import { getAuditEntry } from '@/lib/audit-service';

// ═══════════════════════════════════════════════════════════
// BOKA — Audit Decision Detail API
// GET /api/audit/decision/[id]?familyId= — single decision with full context
// Używane przez "Dlaczego to zrobiłam?" panel w chacie.
// ═══════════════════════════════════════════════════════════

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const url = new URL(req.url);
    const familyId = url.searchParams.get('familyId');
    if (!familyId) {
      return NextResponse.json({ error: 'familyId required' }, { status: 400 });
    }

    const entry = await getAuditEntry(params.id, familyId);
    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
