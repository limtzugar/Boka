import { NextRequest, NextResponse } from 'next/server';
import { generateDocument, type LegalArea } from '@/lib/document-service';

export const runtime = 'nodejs';
export const maxDuration = 90;

// POST /api/documents/generate
// Body: { templateId?, legalArea, documentKind, title, fieldsValues, customInstructions? }
// → Generates a legal document from template + LLM fill-in
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { templateId, legalArea, documentKind, title, fieldsValues, customInstructions } = body;

    if (!legalArea || !documentKind || !title) {
      return NextResponse.json({ error: 'Brak legalArea/documentKind/title' }, { status: 400 });
    }

    const result = await generateDocument({
      templateId,
      legalArea: legalArea as LegalArea,
      documentKind,
      title,
      fieldsValues: fieldsValues || {},
      customInstructions,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/documents/generate] error:', err);
    return NextResponse.json(
      { error: 'Błąd generowania', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}
