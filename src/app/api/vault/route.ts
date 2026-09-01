import { NextRequest, NextResponse } from 'next/server';
import { VaultService } from '@/lib/vault-service';
import { getFamily } from '@/lib/family-service';

// ═══════════════════════════════════════════════════════════
// VAULT API — CRUD for BOKA's Obsidian-style vault
// GET: list notes, GET single note, get daily note
// POST: create note
// PUT: update note
// DELETE: delete note
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action');
    const noteId = req.nextUrl.searchParams.get('id');
    const noteType = req.nextUrl.searchParams.get('type') as 'daily' | 'note' | 'canvas' | 'person' | 'topic' | 'dream' | 'story' | 'ritual' | null;
    const memberId = req.nextUrl.searchParams.get('memberId');
    const tag = req.nextUrl.searchParams.get('tag');
    const search = req.nextUrl.searchParams.get('search');
    const title = req.nextUrl.searchParams.get('title');
    const dateStr = req.nextUrl.searchParams.get('date');

    // Get daily note
    if (action === 'daily') {
      const date = dateStr ? new Date(dateStr) : undefined;
      const dailyNote = await VaultService.getOrCreateDailyNote(family.id, date);
      return NextResponse.json({ note: dailyNote });
    }

    // Get note by ID
    if (noteId) {
      const note = await VaultService.getNote(noteId);
      if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      // Also get backlinks
      const backlinks = await VaultService.getBacklinks(noteId);
      const forwardLinks = await VaultService.getForwardLinks(noteId);

      return NextResponse.json({ note, backlinks, forwardLinks });
    }

    // Get note by title
    if (title) {
      const note = await VaultService.getNoteByTitle(family.id, title);
      if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ note });
    }

    // Get person note
    if (action === 'person') {
      const personName = req.nextUrl.searchParams.get('name');
      if (!personName) return NextResponse.json({ error: 'name required' }, { status: 400 });
      const note = await VaultService.getOrCreatePersonNote(family.id, personName, memberId || undefined);
      return NextResponse.json({ note });
    }

    // Get backlinks
    if (action === 'backlinks') {
      const targetId = req.nextUrl.searchParams.get('targetId');
      if (!targetId) return NextResponse.json({ error: 'targetId required' }, { status: 400 });
      const backlinks = await VaultService.getBacklinks(targetId);
      return NextResponse.json({ backlinks });
    }

    // Get vault graph
    if (action === 'graph') {
      const focusMemberId = req.nextUrl.searchParams.get('focusMemberId') || undefined;
      const focusTopic = req.nextUrl.searchParams.get('focusTopic') || undefined;
      const graph = await VaultService.getVaultGraph({ familyId: family.id, focusMemberId, focusTopic });
      return NextResponse.json(graph);
    }

    // Get stats
    if (action === 'stats') {
      const stats = await VaultService.getVaultStats(family.id);
      return NextResponse.json(stats);
    }

    // Append to daily note
    if (action === 'append-daily') {
      const section = req.nextUrl.searchParams.get('section') || 'Co się wydarzyło';
      const text = req.nextUrl.searchParams.get('text');
      if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
      const date = dateStr ? new Date(dateStr) : undefined;
      const note = await VaultService.appendToDailyNote(family.id, section, text, date);
      return NextResponse.json({ note });
    }

    // Default: list notes
    const result = await VaultService.listNotes({
      familyId: family.id,
      noteType: noteType || undefined,
      memberId: memberId || undefined,
      tag: tag || undefined,
      search: search || undefined,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const body = await req.json();

    const note = await VaultService.createNote({
      familyId: family.id,
      noteType: body.noteType,
      title: body.title,
      content: body.content,
      frontmatter: body.frontmatter,
      memberId: body.memberId,
      emotion: body.emotion,
      importance: body.importance,
      tags: body.tags,
      isPinned: body.isPinned,
      canvasData: body.canvasData,
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const note = await VaultService.updateNote(id, updates);
    if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ note });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await VaultService.deleteNote(id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
