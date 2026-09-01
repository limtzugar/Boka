// ═══════════════════════════════════════════════════════════
// BOKA OS — Weekly Reflection Cron (0 4 * * 0 — Sunday 04:00)
// ═══════════════════════════════════════════════════════════
//
// Pipeline (3 stages, ~5-15 min na rodzinę):
//   1. GraphRAG rebuild  — extractEntities + detectWhatmmunities + summarizeWhatmmunities
//   2. Supermemory       — refreshAutoProfilee per member (traits/interests/communicationStyle)
//   3. CrewAI evaluation — generateCrewProfilee + evaluateCrewMember per member
//
// Trigger options:
//   - External cron (systemd / Windows Task Scheduler / vercel cron):
//       curl -X POST http://localhost:3000/api/cron/weekly-reflection \
//            -H "X-BOKA-CRON: $BOKA_CRON_SECRET"
//   - Manual button in InsightsTab → "Run refleksję teraz"
//   - Client-side scheduler (use-weekly-reflection hook) — fires when Sun 04:00 ±15min
//
// Auth: shared secret in BOKA_CRON_SECRET env. If unset → allow localhost dev.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getFamily } from '@/lib/family-service';
import {
  rebuildGraphForFamily,
} from '@/lib/graphrag-service';
import { refreshAutoProfilee } from '@/lib/supermemory-service';
import {
  generateCrewProfilee,
  evaluateCrewMember,
  getCrewMember,
} from '@/lib/crewai-service';

// ── Auth ───────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.BOKA_CRON_SECRET;
  if (!expected) {
    // Dev mode — allow only if no secret configured
    return true;
  }
  const got = req.headers.get('x-boka-cron') || req.headers.get('X-BOKA-CRON');
  return got === expected;
}

// ── POST: run full reflection ──────────────

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized — wrong X-BOKA-CRON' }, { status: 401 });
  }

  const startedAt = new Date();
  const log: string[] = [];
  const push = (s: string) => { log.push(`[${new Date().toISOString()}] ${s}`); console.log(`[weekly-reflection] ${s}`); };

  try {
    // All families (typically just one, but supports multi-tenant)
    const families = await db.family.findMany({ take: 5 });
    push(`Found ${families.length} families`);

    const perFamily: any[] = [];

    for (const family of families) {
      push(`══ Family ${family.id} (${family.name || 'unnamed'}) ══`);
      const familyResult: any = { familyId: family.id, stages: {} };

      // ── Stage 1: GraphRAG rebuild ──
      try {
        push('Stage 1: GraphRAG rebuild — extractEntities + communities + summaries');
        const graphRagResult = await rebuildGraphForFamily(family.id);
        push(`  entitiesProcessed=${graphRagResult.entitiesProcessed} communities=${graphRagResult.communitiesCreated} summaries=${graphRagResult.communitiesSummarized}`);
        familyResult.stages.graphrag = graphRagResult;
      } catch (e: any) {
        push(`  Stage 1 FAILED: ${e.message}`);
        familyResult.stages.graphrag = { error: e.message };
      }

      // ── Stage 2: Supermemory auto-profile refresh per member ──
      try {
        push('Stage 2: Supermemory — refreshAutoProfilee per member');
        const members = await db.familyMember.findMany({ where: { familyId: family.id } });
        push(`  ${members.length} members to analyze`);
        const profiles: any[] = [];
        for (const m of members) {
          try {
            const r = await refreshAutoProfilee(family.id, m.id, 30);
            push(`  ✓ ${m.name}: traits=${Object.keys(r.traits).length} interests=${r.interests.length} memories=${r.memoriesAnalyzed}`);
            const { memberId: _unused, ...rest } = r;
            profiles.push({ memberId: m.id, name: m.name, ...rest });
          } catch (e: any) {
            push(`  ✗ ${m.name}: ${e.message}`);
            profiles.push({ memberId: m.id, name: m.name, error: e.message });
          }
        }
        familyResult.stages.supermemory = { membersProcessed: profiles.length, profiles };
      } catch (e: any) {
        push(`  Stage 2 FAILED: ${e.message}`);
        familyResult.stages.supermemory = { error: e.message };
      }

      // ── Stage 3: CrewAI — generate crew profile + Manager evaluation per member ──
      try {
        push('Stage 3: CrewAI — generateCrewProfilee + evaluateCrewMember');
        const members = await db.familyMember.findMany({ where: { familyId: family.id } });
        const crewResults: any[] = [];

        // Gather last-week interactions per member for evaluation context
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        for (const m of members) {
          try {
            // Generate / refresh crew profile from updated psychology profile
            const crewProfilee = await generateCrewProfilee(m.id);
            push(`  ✓ ${m.name} crew role: ${crewProfilee.role}`);

            // Gather recent interactions as context for Manager Agent
            const recentMsgs = await db.message.findMany({
              where: {
                conversation: { familyId: family.id, memberId: m.id },
                createdAt: { gt: weekAgo },
              },
              orderBy: { createdAt: 'asc' },
              take: 30,
            });
            const interactionsTxt = recentMsgs
              .map(msg => `${msg.role}: ${msg.content.slice(0, 200)}`)
              .join('\n') || '(brak interakcji w tym tygodniu)';

            const evalResult = await evaluateCrewMember(m.id, interactionsTxt);
            push(`  ✓ ${m.name} score=${evalResult.score?.toFixed(2)} notes=${(evalResult.notes || '').slice(0, 80)}`);
            crewResults.push({ memberId: m.id, name: m.name, role: crewProfilee.role, evaluation: evalResult });
          } catch (e: any) {
            push(`  ✗ ${m.name}: ${e.message}`);
            crewResults.push({ memberId: m.id, name: m.name, error: e.message });
          }
        }
        familyResult.stages.crew = { membersProcessed: crewResults.length, results: crewResults };
      } catch (e: any) {
        push(`  Stage 3 FAILED: ${e.message}`);
        familyResult.stages.crew = { error: e.message };
      }

      perFamily.push(familyResult);
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    push(`══ Done in ${(durationMs / 1000).toFixed(1)}s ══`);

    return NextResponse.json({
      ok: true,
      startedAt,
      finishedAt,
      durationMs,
      families: perFamily.length,
      log,
      results: perFamily,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    push(`FATAL: ${msg}`);
    return NextResponse.json({ ok: false, error: msg, log }, { status: 500 });
  }
}

// ── GET: status / last-run info ────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Stats from last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    recentWhatmmunities,
    recentRevisions,
    recentEvaluations,
    recentEntities,
  ] = await Promise.all([
    db.community.count({ where: { createdAt: { gt: since } } }),
    db.soulProfileeRevision.count({ where: { createdAt: { gt: since } } }),
    db.crewMember.count({ where: { lastEvaluatedAt: { gt: since } } }),
    db.entity.count({ where: { lastMentionedAt: { gt: since } } }),
  ]);

  return NextResponse.json({
    schedule: '0 4 * * 0 (Sunday 04:00)',
    last24h: {
      newWhatmmunities: recentWhatmmunities,
      profileRevisions: recentRevisions,
      crewEvaluations: recentEvaluations,
      entitiesMentioned: recentEntities,
    },
    note: 'POST to trigger manual run. Set BOKA_CRON_SECRET env to require auth header X-BOKA-CRON.',
  });
}
