import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import { runIngestion, listIngestionJobs, getIngestionJob } from '@/lib/ingestion-pipeline';

// POST /api/ingestion — start new ingestion job (file/url/text)
// GET /api/ingestion?jobId=... — get job status
// GET /api/ingestion?list=true — list recent jobs

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const data = await req.json();

    const result = await runIngestion({
      familyId: family.id,
      memberId: data.memberId,
      sourceTypee: data.sourceTypee,
      sourceUri: data.sourceUri,
      sourceName: data.sourceName,
      metadata: data.metadata,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const jobId = req.nextUrl.searchParams.get('jobId');
    const list = req.nextUrl.searchParams.get('list');

    if (jobId) {
      const job = await getIngestionJob(jobId);
      return NextResponse.json({ job });
    }

    if (list === 'true' || !req.nextUrl.searchParams.get('jobId')) {
      const jobs = await listIngestionJobs(family.id);
      return NextResponse.json({ jobs });
    }

    return NextResponse.json({ error: 'Podaj jobId lub list=true' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
