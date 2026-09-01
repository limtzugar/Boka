import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import {
  createPlan, getPlans, getPlan, updatePlanStep,
  offloadContext, recallContext, listContextBlobs,
} from '@/lib/deepagents-service';

// ══ PLANS ══
// POST /api/deepagents?action=create_plan — create new plan
// GET /api/deepagents?action=plans&memberId=... — list plans
// PATCH /api/deepagents?action=update_step&planId=...&stepId=... — update step

// ══ CONTEXT BLOBS (vestibule) ══
// POST /api/deepagents?action=offload — offload context to blob
// GET /api/deepagents?action=blobs — list blobs
// GET /api/deepagents?action=recall&blobId=... — recall full content

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action');
    const data = await req.json();

    if (action === 'create_plan') {
      const plan = await createPlan({
        familyId: family.id,
        memberId: data.memberId,
        title: data.title,
        scope: data.scope,
        steps: data.steps,
      });
      return NextResponse.json({ plan });
    }

    if (action === 'offload') {
      const result = await offloadContext({
        familyId: family.id,
        memberId: data.memberId,
        kind: data.kind,
        title: data.title,
        content: data.content,
        tags: data.tags,
        summarize: data.summarize,
        ttlHours: data.ttlHours,
      });
      return NextResponse.json(result);
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
    const memberId = req.nextUrl.searchParams.get('memberId') || undefined;

    if (action === 'plans') {
      const status = req.nextUrl.searchParams.get('status') || undefined;
      const plans = await getPlans(family.id, memberId, status);
      return NextResponse.json({ plans });
    }

    if (action === 'blobs') {
      const kind = req.nextUrl.searchParams.get('kind') || undefined;
      const blobs = await listContextBlobs(family.id, { kind, memberId });
      return NextResponse.json({ blobs });
    }

    if (action === 'recall') {
      const blobId = req.nextUrl.searchParams.get('blobId');
      if (!blobId) return NextResponse.json({ error: 'Podaj blobId' }, { status: 400 });
      const result = await recallContext(blobId);
      if (!result) return NextResponse.json({ error: 'Blob nie znaleziony' }, { status: 404 });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const planId = req.nextUrl.searchParams.get('planId');
    const stepId = req.nextUrl.searchParams.get('stepId');
    if (!planId || !stepId) {
      return NextResponse.json({ error: 'Podaj planId i stepId' }, { status: 400 });
    }

    const data = await req.json();
    const updated = await updatePlanStep(planId, stepId, data);
    return NextResponse.json({ plan: updated });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
