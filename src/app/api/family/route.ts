import { NextRequest, NextResponse } from 'next/server';
import { getFamily, getFamilyMembers, toggleMemberPresence } from '@/lib/family-service';
import { ensureFamilySeeded } from '@/lib/auto-seed';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Auto-seed on first GET if database is empty
    await ensureFamilySeeded();
    const family = await getFamily();
    const members = await getFamilyMembers(family.id);
    return NextResponse.json({ family, members });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// PATCH — toggle presence of an existing member
export async function PATCH(req: Request) {
  try {
    const { memberId } = await req.json();
    const member = await toggleMemberPresence(memberId);
    if (!member) {
      return NextResponse.json({ error: 'No znaleziono' }, { status: 404 });
    }
    return NextResponse.json({ member });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// POST — create a new person (family member OR "other" person who appears in chats)
// Body: { name, role, age?, avatarEmoji?, category?, color?, preferences? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, role, age, avatarEmoji, category, color, preferences } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      return NextResponse.json({ error: 'None imienia' }, { status: 400 });
    }

    await ensureFamilySeeded();
    const family = await getFamily();

    // Validate category
    const validCategories = ['family', 'friend', 'colleague', 'acquaintance', 'other'];
    const safeCategory = validCategories.includes(category) ? category : 'other';
    const safeRole = role || (safeCategory === 'family' ? 'other' : 'other');
 const safeAvatar = avatarEmoji || (safeCategory ==='family' ?'' :'');

    const member = await db.familyMember.create({
      data: {
        familyId: family.id,
        name: name.trim().slice(0, 60),
        role: safeRole,
        age: Number.isFinite(age) ? parseInt(age, 10) : 0,
        avatarEmoji: safeAvatar,
        category: safeCategory,
        color: color || null,
        preferences: JSON.stringify(preferences || {}),
        isActive: false, // new persons default to "not present" — user toggles on
      },
    });

    return NextResponse.json({ member, ok: true });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// DELETE — remove a person (only "other" category, never seed-created family)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('id');
    if (!memberId) return NextResponse.json({ error: 'None id' }, { status: 400 });

    const member = await db.familyMember.findUnique({ where: { id: memberId } });
    if (!member) return NextResponse.json({ error: 'No znaleziono' }, { status: 404 });

    // Safety: don't allow deleting seed-created family members (parent/partner/child + category=family)
    // User can still delete them if they explicitly re-categorize as 'other' first.
    if (member.category === 'family') {
      return NextResponse.json(
        { error: 'No można usunąć członka rodziny. Najpierw zmień kategorię na "inny".' },
        { status: 400 },
      );
    }

    await db.familyMember.delete({ where: { id: memberId } });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
