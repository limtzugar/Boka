import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import {
  recordPresenceEvent, reidentify, registerFaceEmbedding,
  getPresenceHistory, getCurrentlyPresent,
} from '@/lib/isaac-ros-service';

// POST /api/presence?action=event — record new presence event (from front-end detector)
// POST /api/presence?action=reid — re-identify member from face embedding
// POST /api/presence?action=register_face&memberId=... — register member's face embedding
// GET /api/presence?action=history — list recent presence events
// GET /api/presence?action=present — who's currently present

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action');
    const data = await req.json();

    if (action === 'event') {
      const result = await recordPresenceEvent({
        familyId: family.id,
        memberId: data.memberId,
        eventKind: data.eventKind,
        location: data.location,
        confidence: data.confidence,
        captureMethod: data.captureMethod,
        triggeredBy: data.triggeredBy,
      });
      return NextResponse.json(result);
    }

    if (action === 'reid') {
      const result = await reidentify({
        familyId: family.id,
        faceEmbedding: data.faceEmbedding,
        candidateMemberIds: data.candidateMemberIds,
        threshold: data.threshold,
      });
      return NextResponse.json(result);
    }

    if (action === 'register_face') {
      const memberId = req.nextUrl.searchParams.get('memberId');
      if (!memberId) return NextResponse.json({ error: 'Podaj memberId' }, { status: 400 });
      await registerFaceEmbedding(memberId, data.faceEmbedding);
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

    if (action === 'history') {
      const memberId = req.nextUrl.searchParams.get('memberId') || undefined;
      const eventKind = req.nextUrl.searchParams.get('eventKind') || undefined;
      const sinceStr = req.nextUrl.searchParams.get('since');
      const since = sinceStr ? new Date(sinceStr) : undefined;
      const history = await getPresenceHistory(family.id, { memberId, eventKind, since });
      return NextResponse.json({ history });
    }

    if (action === 'present') {
      const present = await getCurrentlyPresent(family.id);
      return NextResponse.json({ present });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
