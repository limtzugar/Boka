import { NextRequest, NextResponse } from 'next/server';
import { getAuditStats } from '@/lib/audit-service';
import { listForgetRequests } from '@/lib/forget-service';

// ═══════════════════════════════════════════════════════════
// BOKA — Audit Stats API (Consent Dashboard)
// GET /api/audit/stats?familyId=&days=30 — aggregated decision stats
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const familyId = url.searchParams.get('familyId');
    if (!familyId) {
      return NextResponse.json({ error: 'familyId required' }, { status: 400 });
    }
    const days = parseInt(url.searchParams.get('days') ?? '30');

    const [stats, forgetRequests] = await Promise.all([
      getAuditStats(familyId, days),
      listForgetRequests(familyId, { limit: 20 }),
    ]);

    return NextResponse.json({
      stats,
      forgetRequests,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
