import { NextRequest, NextResponse } from 'next/server';
import { analyzeDocument } from '@/lib/document-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/documents/analyze
// Body: { documentId: string }
// → Triggers LLM legal analysis of the extracted text
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId } = body;
    if (!documentId) {
      return NextResponse.json({ error: 'None documentId' }, { status: 400 });
    }
    const analysis = await analyzeDocument(documentId);
    return NextResponse.json({ analysis });
  } catch (err) {
    console.error('[/api/documents/analyze] error:', err);
    return NextResponse.json(
      { error: 'Error analizy', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}
