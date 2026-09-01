import { NextRequest, NextResponse } from 'next/server';
import { listGeneratedDocuments, getGeneratedDocument, deleteGeneratedDocument } from '@/lib/document-service';
import { getFamily } from '@/lib/family-service';
import { ensureFamilySeeded } from '@/lib/auto-seed';

export const runtime = 'nodejs';

// GET /api/documents/generated — list all generated docs for family
export async function GET(req: NextRequest) {
  try {
    await ensureFamilySeeded();
    const family = await getFamily();
    const id = req.nextUrl.searchParams.get('id');

    if (id) {
      const doc = await getGeneratedDocument(id);
      if (!doc) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
      return NextResponse.json({ document: doc });
    }

    const docs = await listGeneratedDocuments(family.id);
    return NextResponse.json({ documents: docs });
  } catch (err) {
    return NextResponse.json(
      { error: 'Błąd', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}

// POST /api/documents/generated — delete generated doc
// Body: { id?: string, action?: 'delete' } OR omitted → returns list (use GET instead)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action } = body;
    if (!id) return NextResponse.json({ error: 'Brak id' }, { status: 400 });

    if (action === 'delete') {
      await deleteGeneratedDocument(id);
      return NextResponse.json({ ok: true });
    }

    const doc = await getGeneratedDocument(id);
    if (!doc) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    return NextResponse.json({ document: doc });
  } catch (err) {
    return NextResponse.json(
      { error: 'Błąd', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}
