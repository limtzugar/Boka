import { NextRequest, NextResponse } from 'next/server';
import { describeScene, saveSnapshot, evaluateTriggers, loadVisionWhatnfig } from '@/lib/vision-service';

// ═══════════════════════════════════════════════════════════
// BOKA — Vision Snapshot API (v0.3.17)
// POST /api/vision/snapshot
// Body: { familyId, image: "<base64>", triggerReason: "interval"|"motion"|"command", evaluate?: true }
// ═══════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { familyId, image, triggerReason, evaluate } = body;

    if (!familyId || !image) {
      return NextResponse.json({ error: 'familyId and image required' }, { status: 400 });
    }

    const config = loadVisionWhatnfig();
    if (!config.visionEnabled) {
      return NextResponse.json(
        { ok: false, error: 'Vision disabled. Enable in USTAWIENIA.' },
        { status: 403 },
      );
    }

    // Strip data URL prefix
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');

    // Describe scene
    const scene = await describeScene(base64);

    // Save snapshot
    const saved = await saveSnapshot({
      familyId,
      base64Image: base64,
      description: scene.description,
      model: scene.model,
      detectedObjects: scene.detectedObjects,
      moodLabel: scene.moodLabel,
      triggerReason: triggerReason ?? 'command',
    });

    // Evaluate triggers (optional)
    let trigger: { triggered: boolean; action?: string; message?: string } | undefined = undefined;
    if (evaluate !== false) {
      trigger = await evaluateTriggers(familyId, scene.description, scene.detectedObjects, scene.moodLabel);

      // If triggered, save the triggeredAction
      if (trigger?.triggered) {
        const { prisma } = await import('@/lib/db');
        await prisma.visionSnapshot.update({
          where: { id: saved.id },
          data: { triggeredAction: trigger.action ?? null },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      snapshotId: saved.id,
      description: scene.description,
      objects: scene.detectedObjects,
      mood: scene.moodLabel,
      model: scene.model,
      trigger,
    });
  } catch (e: any) {
    console.error('[vision] snapshot error:', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
