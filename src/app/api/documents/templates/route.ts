import { NextRequest, NextResponse } from 'next/server';
import { listTemplates } from '@/lib/document-service';
import { ensureBuiltinTemplates } from '@/lib/document-service';
import { getFamily } from '@/lib/family-service';
import { ensureFamilySeeded } from '@/lib/auto-seed';
import type { LegalArea } from '@/lib/document-templates';

export const runtime = 'nodejs';

// GET /api/documents/templates?legalArea=family
// → Returns list of templates (built-in + user's)
export async function GET(req: NextRequest) {
  try {
    await ensureFamilySeeded();
    await ensureBuiltinTemplates();
    const family = await getFamily();
    const legalArea = req.nextUrl.searchParams.get('legalArea') as LegalArea | null;
    const tpls = await listTemplates(family.id, legalArea || undefined);
    return NextResponse.json({ templates: tpls });
  } catch (err) {
    return NextResponse.json(
      { error: 'Błąd listy szablonów', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}
