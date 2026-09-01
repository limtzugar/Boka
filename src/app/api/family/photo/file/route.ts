// BOKA OS — Family Photo File Server (v0.3.19)
// GET /api/family/photo/file?id=<memberId>  → serves photo bytes with correct content-type
// Needed because Next.js production build doesn't serve dynamically-added files in public/.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile, stat } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'family-photos');

function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return new NextResponse('Brak id', { status: 400 });
    }

    const member = await db.familyMember.findUnique({ where: { id } });
    if (!member || !member.photoUrl) {
      return new NextResponse('Nie znaleziono zdjęcia', { status: 404 });
    }

    // photoUrl is stored as /uploads/family-photos/<filename>
    const filename = path.basename(member.photoUrl);
    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return new NextResponse('Nieprawidłowa nazwa pliku', { status: 400 });
    }

    const filepath = path.join(UPLOAD_DIR, filename);
    try {
      await stat(filepath);
    } catch {
      return new NextResponse('Plik nie istnieje', { status: 404 });
    }

    const bytes = await readFile(filepath);
    const contentType = getContentType(filename);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': bytes.length.toString(),
      },
    });
  } catch (e: any) {
    console.error('[family/photo/file] error:', e);
    return new NextResponse('Błąd serwera', { status: 500 });
  }
}
