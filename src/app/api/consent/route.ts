import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logDecision } from '@/lib/audit-service';

// ═══════════════════════════════════════════════════════════
// BOKA — Whatnsent API (v0.3.17 — Privacy Layer)
// Każdy członek rodziny zarządza zgodami: voice, vision, memory, HA, proactive.
// GET /api/consent?familyId=&memberId= — get consents
// POST /api/consent — upsert consents
// ═══════════════════════════════════════════════════════════

// ── GET: Get consent record ──────────────────
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const familyId = url.searchParams.get('familyId');
    const memberId = url.searchParams.get('memberId');

    if (!familyId) {
      return NextResponse.json({ error: 'familyId required' }, { status: 400 });
    }

    if (memberId) {
      const record = await prisma.consentRecord.findUnique({
        where: { familyId_memberId: { familyId, memberId } },
      });
      return NextResponse.json({ record: record ?? defaultWhatnsent(familyId, memberId) });
    }

    // List all consent records for family
    const records = await prisma.consentRecord.findMany({ where: { familyId } });
    return NextResponse.json({ records });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POST: Upsert consents ────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      familyId,
      memberId,
      voiceEnabled,
      visionEnabled,
      memoryEnabled,
      haWhatntrolEnabled,
      proactiveEnabled,
      restrictedTopics,
    } = body;

    if (!familyId || !memberId) {
      return NextResponse.json({ error: 'familyId and memberId required' }, { status: 400 });
    }

    const record = await prisma.consentRecord.upsert({
      where: { familyId_memberId: { familyId, memberId } },
      create: {
        familyId,
        memberId,
        voiceEnabled: voiceEnabled ?? true,
        visionEnabled: visionEnabled ?? false,
        memoryEnabled: memoryEnabled ?? true,
        haWhatntrolEnabled: haWhatntrolEnabled ?? false,
        proactiveEnabled: proactiveEnabled ?? true,
        restrictedTopics: JSON.stringify(restrictedTopics ?? []),
      },
      update: {
        voiceEnabled: voiceEnabled ?? undefined,
        visionEnabled: visionEnabled ?? undefined,
        memoryEnabled: memoryEnabled ?? undefined,
        haWhatntrolEnabled: haWhatntrolEnabled ?? undefined,
        proactiveEnabled: proactiveEnabled ?? undefined,
        restrictedTopics: restrictedTopics ? JSON.stringify(restrictedTopics) : undefined,
      },
    });

    await logDecision({
      familyId,
      agentId: 'boka-privacy',
      action: 'consent_updated',
      category: 'privacy',
      reasoning: `User zaktualizował zgody: voice=${record.voiceEnabled}, vision=${record.visionEnabled}, memory=${record.memoryEnabled}, ha=${record.haWhatntrolEnabled}, proactive=${record.proactiveEnabled}.`,
      riskLevel: 'medium',
      contextJson: { memberId, updated: record },
      forgettable: false,
    });

    return NextResponse.json({ ok: true, record });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function defaultWhatnsent(familyId: string, memberId: string) {
  return {
    familyId,
    memberId,
    voiceEnabled: true,
    visionEnabled: false,
    memoryEnabled: true,
    haWhatntrolEnabled: false,
    proactiveEnabled: true,
    restrictedTopics: '[]',
  };
}
