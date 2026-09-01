import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/family/update?id=<memberId>
// Body: { name?, role?, age?, avatarEmoji?, category?, color?, preferences?, isActive? }
export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('id');
    if (!memberId) return NextResponse.json({ error: 'Brak id' }, { status: 400 });

    const body = await req.json();
    const update: Record<string, unknown> = {};

    if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim().slice(0, 60);
    if (typeof body.role === 'string') update.role = body.role;
    if (Number.isFinite(body.age)) update.age = parseInt(body.age, 10);
    if (typeof body.avatarEmoji === 'string') update.avatarEmoji = body.avatarEmoji.slice(0, 8);

    const validCategories = ['family', 'friend', 'colleague', 'acquaintance', 'other'];
    if (validCategories.includes(body.category)) update.category = body.category;

    if (body.color === null || typeof body.color === 'string') {
      update.color = body.color || null;
    }

    if (typeof body.preferences === 'object' && body.preferences !== null) {
      update.preferences = JSON.stringify(body.preferences);
    }

    if (typeof body.isActive === 'boolean') update.isActive = body.isActive;

    const member = await db.familyMember.update({
      where: { id: memberId },
      data: update,
    });

    return NextResponse.json({ member, ok: true });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
