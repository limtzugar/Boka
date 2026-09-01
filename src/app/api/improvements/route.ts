import { NextRequest, NextResponse } from 'next/server';
import { SelfImprovementService } from '@/lib/self-improvement-service';
import { getFamily } from '@/lib/family-service';

// ═══════════════════════════════════════════════════════════
// IMPROVEMENTS API — Self-Improvement Loop
// GET /api/improvements?status=pending — lista propozycji
// PATCH /api/improvements?id=...&action=approve|reject — zaakceptuj/odrzuć
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const status = req.nextUrl.searchParams.get('status');

    if (status === 'pending') {
      const proposals = await SelfImprovementService.getPendingProposals(family.id);
      return NextResponse.json({ proposals });
    }

    // Return all recent
    const { db } = await import('@/lib/db');
    const proposals = await db.improvementLog.findMany({
      where: { familyId: family.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return NextResponse.json({ proposals });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const family = await getFamily();
    const id = req.nextUrl.searchParams.get('id');
    const action = req.nextUrl.searchParams.get('action');
    const data = await req.json();

    if (!id || !action) {
      return NextResponse.json({ error: 'Podaj id i action (approve/reject)' }, { status: 400 });
    }

    const memberId = data.memberId || family.id;

    if (action === 'approve') {
      const result = await SelfImprovementService.approveProposal(id, memberId);
      return NextResponse.json({ result });
    }

    if (action === 'reject') {
      const result = await SelfImprovementService.rejectProposal(id, memberId);
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
