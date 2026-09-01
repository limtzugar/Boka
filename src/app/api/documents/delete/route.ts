import { NextRequest, NextResponse } from 'next/server';
import { deleteDocument } from '@/lib/document-service';

export const runtime = 'nodejs';

// POST /api/documents/delete
// Body: { id: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'None id' }, { status: 400 });
    await deleteDocument(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Error usuwania', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}
