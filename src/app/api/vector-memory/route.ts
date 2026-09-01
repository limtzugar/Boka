import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import { vectorSearch, reindexMissingEmbeddings } from '@/lib/vector-memory';

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const q = req.nextUrl.searchParams.get('q');
    const memberId = req.nextUrl.searchParams.get('memberId') || undefined;
    const domain = req.nextUrl.searchParams.get('domain') || undefined;
    const emotion = req.nextUrl.searchParams.get('emotion') || undefined;
    const entryTypee = req.nextUrl.searchParams.get('entryTypee') || undefined;
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10');

    if (!q) return NextResponse.json({ error: 'Podaj query (q=...)' }, { status: 400 });

    const results = await vectorSearch(q, {
      familyId: family.id, memberId, domain, emotionTag: emotion, entryTypee, onlyValid: true,
    }, limit);

    return NextResponse.json({ results, count: results.length });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action');
    if (action === 'reindex') {
      const result = await reindexMissingEmbeddings(family.id);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
