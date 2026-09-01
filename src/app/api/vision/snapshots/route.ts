import { NextRequest, NextResponse } from 'next/server';
import { getRecentSnapshots } from '@/lib/vision-service';
import fs from 'fs';

// ═══════════════════════════════════════════════════════════
// BOKA — Vision Snapshots List API
// GET /api/vision/snapshots?familyId=&limit=
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const familyId = url.searchParams.get('familyId');
    if (!familyId) {
      return NextResponse.json({ error: 'familyId required' }, { status: 400 });
    }

    const limit = parseInt(url.searchParams.get('limit') ?? '20');
    const snapshots = await getRecentSnapshots(familyId, limit);

    // For each snapshot, check if image still exists
    const result = snapshots.map((s) => ({
      id: s.id,
      capturedAt: s.capturedAt,
      description: s.description,
      sceneSummary: s.sceneSummary,
      detectedObjects: JSON.parse(s.detectedObjects),
      moodLabel: s.moodLabel,
      model: s.model,
      triggerReason: s.triggerReason,
      triggeredAction: s.triggeredAction,
      imageExists: fs.existsSync(s.imagePath),
    }));

    return NextResponse.json({ snapshots: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
