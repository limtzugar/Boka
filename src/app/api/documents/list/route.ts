import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, ensureBuiltinTemplates } from '@/lib/document-service';
import { getFamily } from '@/lib/family-service';
import { ensureFamilySeeded } from '@/lib/auto-seed';

export const runtime = 'nodejs';

// GET /api/documents/list
// → Returns all documents for current family
export async function GET() {
  try {
    await ensureFamilySeeded();
    await ensureBuiltinTemplates();
    const family = await getFamily();
    const docs = await listDocuments(family.id);
    return NextResponse.json({ documents: docs });
  } catch (err) {
    return NextResponse.json(
      { error: 'Błąd listy', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}
