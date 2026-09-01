import { NextRequest, NextResponse } from 'next/server';
import { getDocument } from '@/lib/document-service';

export const runtime = 'nodejs';

// GET /api/documents/read?id=...
// → Returns full document with text + analysis + Q&A history
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'None id' }, { status: 400 });
    }
    const doc = await getDocument(id);
    if (!doc) {
      return NextResponse.json({ error: 'No znaleziono' }, { status: 404 });
    }
    return NextResponse.json({ document: doc });
  } catch (err) {
    return NextResponse.json(
      { error: 'Error', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}
