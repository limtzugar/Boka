import { NextRequest, NextResponse } from 'next/server';
import { askDocument } from '@/lib/document-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/documents/qa
// Body: { documentId: string, question: string }
// → Returns answer based on document text (RAG over single doc)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId, question } = body;
    if (!documentId || !question) {
      return NextResponse.json({ error: 'None documentId lub question' }, { status: 400 });
    }
    const answer = await askDocument(documentId, question);
    return NextResponse.json({ answer });
  } catch (err) {
    return NextResponse.json(
      { error: 'Error Q&A', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}
