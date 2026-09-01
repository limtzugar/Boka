// BOKA OS — Family Member Photo API (v0.3.19)
// POST /api/family/photo?id=<memberId>  — upload photo (multipart/form-data with file=...)
// DELETE /api/family/photo?id=<memberId>  — remove photo
//
// Stores photos as /uploads/family-photos/<memberId>.<ext>
// Updates FamilyMember.photoUrl in DB.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir, unlink, stat } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'family-photos');
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function ensureUploadDir() {
  try {
    await stat(UPLOAD_DIR);
  } catch {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Brak id członka rodziny' }, { status: 400 });
    }

    const member = await db.familyMember.findUnique({ where: { id } });
    if (!member) {
      return NextResponse.json({ error: 'Nie znaleziono członka rodziny' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Brak pliku (pole "file")' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `Plik za duży (max ${MAX_SIZE / 1024 / 1024}MB)` }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Niedozwolony typ pliku: ${file.type}. Dozwolone: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    await ensureUploadDir();

    // Determine extension from mime type
    const ext = file.type === 'image/jpeg' ? 'jpg'
              : file.type === 'image/png' ? 'png'
              : file.type === 'image/webp' ? 'webp'
              : 'gif';

    // Remove old photo if exists
    if (member.photoUrl) {
      const oldPath = path.join(process.cwd(), 'public', member.photoUrl);
      try { await unlink(oldPath); } catch {}
    }

    // Save with random suffix to bust cache on update
    const suffix = randomBytes(4).toString('hex');
    const filename = `${id}.${suffix}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    const photoUrl = `/uploads/family-photos/${filename}`;
    await db.familyMember.update({
      where: { id },
      data: { photoUrl },
    });

    return NextResponse.json({ ok: true, photoUrl });
  } catch (e: any) {
    console.error('[family/photo] POST error:', e);
    return NextResponse.json({ error: e?.message || 'Błąd przesyłania zdjęcia' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Brak id' }, { status: 400 });
    }

    const member = await db.familyMember.findUnique({ where: { id } });
    if (!member) {
      return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    }

    if (member.photoUrl) {
      const filepath = path.join(process.cwd(), 'public', member.photoUrl);
      try { await unlink(filepath); } catch {}
      await db.familyMember.update({
        where: { id },
        data: { photoUrl: null },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[family/photo] DELETE error:', e);
    return NextResponse.json({ error: e?.message || 'Błąd usuwania zdjęcia' }, { status: 500 });
  }
}
