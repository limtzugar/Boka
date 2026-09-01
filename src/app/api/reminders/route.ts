import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════
// BOKA — Reminders API
// Function Calling / Tool Use — reminders and actions
// GET: list reminders, POST: create, DELETE: delete
// ═══════════════════════════════════════════

const VALID_CATEGORIES = [
  'general',
  'school',
  'health',
  'finance',
  'social',
] as const;

type ValidCategory = (typeof VALID_CATEGORIES)[number];

/**
 * GET — List reminders for a member
 * Query params: memberId (required), includeCompleted? (boolean)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId');
    const includeCompleted = searchParams.get('includeCompleted') === 'true';

    if (!memberId) {
      return NextResponse.json(
        { error: 'Brak parametru memberId' },
        { status: 400 },
      );
    }

    const where: {
      memberId: string;
      isCompleted?: boolean;
    } = { memberId };

    if (!includeCompleted) {
      where.isCompleted = false;
    }

    const reminders = await db.reminder.findMany({
      where,
      orderBy: { dueDate: 'asc' },
    });

    return NextResponse.json({ reminders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Nieznany błąd';
    console.error('Reminders GET error:', msg);
    return NextResponse.json(
      { error: 'Błąd pobierania przypomnień', details: msg },
      { status: 500 },
    );
  }
}

/**
 * POST — Create a new reminder
 * Body: { memberId, title, description?, dueDate, category? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { memberId, title, description, dueDate, category = 'general' } = body;

    // Validate required fields
    if (!memberId || typeof memberId !== 'string') {
      return NextResponse.json(
        { error: 'Brak identyfikatora domownika' },
        { status: 400 },
      );
    }

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Brak tytułu przypomnienia' },
        { status: 400 },
      );
    }

    if (!dueDate) {
      return NextResponse.json(
        { error: 'Brak daty przypomnienia' },
        { status: 400 },
      );
    }

    // Parse and validate due date
    const parsedDueDate = new Date(dueDate);
    if (isNaN(parsedDueDate.getTime())) {
      return NextResponse.json(
        { error: 'Nieprawidłowa data — użyj formatu ISO (np. 2025-03-15T09:00:00)' },
        { status: 400 },
      );
    }

    // Validate category
    if (!VALID_CATEGORIES.includes(category as ValidCategory)) {
      return NextResponse.json(
        {
          error: `Nieprawidłowa kategoria. Dostępne: ${VALID_CATEGORIES.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Look up the member to get their familyId
    const member = await db.familyMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return NextResponse.json(
        { error: 'Nie znaleziono domownika' },
        { status: 404 },
      );
    }

    const reminder = await db.reminder.create({
      data: {
        familyId: member.familyId,
        memberId,
        title: title.trim(),
        description: description?.trim() || null,
        dueDate: parsedDueDate,
        category,
        priority: 'normal',
      },
    });

    console.log(
      `Reminders: Created "${title}" for member ${memberId}, due ${parsedDueDate.toISOString()}`,
    );

    return NextResponse.json({ reminder }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Nieznany błąd';
    console.error('Reminders POST error:', msg);
    return NextResponse.json(
      { error: 'Błąd tworzenia przypomnienia', details: msg },
      { status: 500 },
    );
  }
}

/**
 * DELETE — Delete a reminder
 * Body: { id: string } or query param: ?id=xxx
 */
export async function DELETE(req: NextRequest) {
  try {
    let reminderId: string | null = null;

    // Try to get ID from body first
    try {
      const body = await req.json();
      reminderId = body.id;
    } catch {
      // Body might be empty, check query params
    }

    // Fallback to query param
    if (!reminderId) {
      const { searchParams } = new URL(req.url);
      reminderId = searchParams.get('id');
    }

    if (!reminderId || typeof reminderId !== 'string') {
      return NextResponse.json(
        { error: 'Brak identyfikatora przypomnienia' },
        { status: 400 },
      );
    }

    // Check if reminder exists
    const existing = await db.reminder.findUnique({
      where: { id: reminderId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Przypomnienie nie istnieje' },
        { status: 404 },
      );
    }

    // Delete the reminder
    await db.reminder.delete({
      where: { id: reminderId },
    });

    console.log(`Reminders: Deleted reminder ${reminderId}`);

    return NextResponse.json({
      success: true,
      deletedId: reminderId,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Nieznany błąd';
    console.error('Reminders DELETE error:', msg);
    return NextResponse.json(
      { error: 'Błąd usuwania przypomnienia', details: msg },
      { status: 500 },
    );
  }
}
