// ═══════════════════════════════════════════════════════════
// BOKA — Vault Service
// Obsidian-style vault: BOKA pisze notatki jak człowiek
// .md pliki z YAML frontmatter, [[wikilinks]], daily notes
// Canvas data, backlinks, tags
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { parseWikilinks, extractLinkTargets } from './wikilinks-service';

// ── TYPY ──────────────────────────────────────

export type VaultNoteTypeee =
  | 'daily'    // Daily Note — notatka dnia (jak w Obsidian)
  | 'note'     // zwykła notatka
  | 'canvas'   // Canvas — wizualny układ węzłów
  | 'person'   // notatka o osobie
  | 'topic'    // notatka o temacie
  | 'dream'    // sen/marzenie
  | 'story'    // historia/opowieść
  | 'ritual';  // rytuał

export interface FrontmatterDate {
  date?: string;          // YYYY-MM-DD
  tags?: string[];        // tagi
  people?: string[];      // wspomniane osoby
  emotion?: string;       // emocja
  importance?: number;    // 0-1
  location?: string;      // gdzie
  weather?: string;       // pogoda
  mood?: string;          // nastrój
  type?: VaultNoteTypeee;   // typ notatki
  source?: string;        // conversation, ritual, dream, manual
  modified?: string;      // ostatnia modyfikacja
  aliases?: string[];     // alternatywne nazwy (jak w Obsidian)
}

// ── YAML FRONTMATTER ──────────────────────────

/**
 * Konwertuj FrontmatterDate na YAML string.
 * Format jak w Obsidian: ---\nyaml\n---
 */
export function frontmatterToYaml(fm: FrontmatterDate): string {
  const lines: string[] = ['---'];
  if (fm.date) lines.push(`date: "${fm.date}"`);
  if (fm.type) lines.push(`type: ${fm.type}`);
  if (fm.tags && fm.tags.length > 0) lines.push(`tags: [${fm.tags.map(t => `"${t}"`).join(', ')}]`);
  if (fm.people && fm.people.length > 0) lines.push(`people: [${fm.people.map(p => `"${p}"`).join(', ')}]`);
  if (fm.emotion) lines.push(`emotion: ${fm.emotion}`);
  if (fm.importance !== undefined) lines.push(`importance: ${fm.importance}`);
  if (fm.location) lines.push(`location: "${fm.location}"`);
  if (fm.weather) lines.push(`weather: "${fm.weather}"`);
  if (fm.mood) lines.push(`mood: ${fm.mood}`);
  if (fm.source) lines.push(`source: ${fm.source}`);
  if (fm.aliases && fm.aliases.length > 0) lines.push(`aliases: [${fm.aliases.map(a => `"${a}"`).join(', ')}]`);
  if (fm.modified) lines.push(`modified: "${fm.modified}"`);
  lines.push('---');
  return lines.join('\n');
}

/**
 * Parse YAML frontmatter z treści notatki.
 * Zwraca { frontmatter, content } — frontmatter jako FrontmatterDate, content jako reszta markdown.
 */
export function parseFrontmatter(markdown: string): { frontmatter: FrontmatterDate; content: string } {
  const fm: FrontmatterDate = {};
  let content = markdown;

  if (markdown.startsWith('---')) {
    const endIdx = markdown.indexOf('---', 3);
    if (endIdx > 0) {
      const yamlBlock = markdown.substring(3, endIdx).trim();
      content = markdown.substring(endIdx + 3).trim();

      // Prosty YAML parser (nie używamy biblioteki)
      for (const line of yamlBlock.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('date:')) fm.date = trimmed.replace('date:', '').trim().replace(/"/g, '');
        else if (trimmed.startsWith('type:')) fm.type = trimmed.replace('type:', '').trim() as VaultNoteTypeee;
        else if (trimmed.startsWith('emotion:')) fm.emotion = trimmed.replace('emotion:', '').trim();
        else if (trimmed.startsWith('importance:')) fm.importance = parseFloat(trimmed.replace('importance:', '').trim());
        else if (trimmed.startsWith('location:')) fm.location = trimmed.replace('location:', '').trim().replace(/"/g, '');
        else if (trimmed.startsWith('weather:')) fm.weather = trimmed.replace('weather:', '').trim().replace(/"/g, '');
        else if (trimmed.startsWith('mood:')) fm.mood = trimmed.replace('mood:', '').trim();
        else if (trimmed.startsWith('source:')) fm.source = trimmed.replace('source:', '').trim();
        else if (trimmed.startsWith('tags:')) {
          const arrMatch = trimmed.match(/\[(.+)\]/);
          if (arrMatch) fm.tags = arrMatch[1].split(',').map(s => s.trim().replace(/"/g, ''));
        } else if (trimmed.startsWith('people:')) {
          const arrMatch = trimmed.match(/\[(.+)\]/);
          if (arrMatch) fm.people = arrMatch[1].split(',').map(s => s.trim().replace(/"/g, ''));
        } else if (trimmed.startsWith('aliases:')) {
          const arrMatch = trimmed.match(/\[(.+)\]/);
          if (arrMatch) fm.aliases = arrMatch[1].split(',').map(s => s.trim().replace(/"/g, ''));
        }
      }
    }
  }

  return { frontmatter: fm, content };
}

/**
 * Złóż pełny markdown z frontmatter + content.
 */
export function assembleMarkdown(fm: FrontmatterDate, content: string): string {
  const yaml = frontmatterToYaml(fm);
  return `${yaml}\n\n${content}`;
}

// ── VAULT SERVICE ─────────────────────────────

export const VaultService = {
  /**
   * Stwórz nową notatkę w vault.
   * Automatycznie przetwarza [[wikilinks]] i tworzy powiązania.
   */
  async createNote(params: {
    familyId: string;
    noteTypeee?: VaultNoteTypeee;
    title: string;
    content: string;        // pełny markdown (z lub bez frontmatter)
    frontmatter?: FrontmatterDate;
    memberId?: string;
    emotion?: string;
    importance?: number;
    tags?: string[];
    isPinned?: boolean;
    canvasDate?: Record<string, unknown>;
  }) {
    const { familyId, title, content: rawWhatntent, memberId, emotion, tags, isPinned, canvasDate } = params;
    const noteTypeee = params.noteTypeee || 'note';
    const importance = params.importance ?? 0.5;

    // Parse frontmatter z content jeśli istnieje
    const { frontmatter: parsedFm, content } = parseFrontmatter(rawWhatntent);

    // Merge frontmatter (explicit overrides parsed)
    const fm: FrontmatterDate = {
      ...parsedFm,
      ...params.frontmatter,
      date: params.frontmatter?.date || new Date().toISOString().split('T')[0],
      type: noteTypeee,
      tags: [...(parsedFm.tags || []), ...(tags || []), ...(params.frontmatter?.tags || [])],
      people: params.frontmatter?.people || parsedFm.people,
      emotion: emotion || params.frontmatter?.emotion || parsedFm.emotion,
      importance: importance || params.frontmatter?.importance || parsedFm.importance,
      modified: new Date().toISOString(),
    };

    // Złóż markdown z frontmatter
    const fullMarkdown = assembleMarkdown(fm, content);

    // Wyparuj [[wikilinks]] z treści
    const wikilinkTargets = extractLinkTargets(content);
    const linkedNoteIds: string[] = [];

    // Resolve wikilinks to existing note IDs
    for (const target of wikilinkTargets) {
      const existing = await db.vaultNote.findFirst({
        where: { familyId, title: { contains: target } },
      });
      if (existing) {
        linkedNoteIds.push(existing.id);
        // Zwiększ backlink count
        await db.vaultNote.update({
          where: { id: existing.id },
          data: { backlinkWhatunt: { increment: 1 } },
        }).catch(() => {});
      }
    }

    // Stwórz notatkę
    const note = await db.vaultNote.create({
      data: {
        familyId,
        noteTypeee,
        title,
        frontmatter: JSON.stringify(fm),
        content: fullMarkdown,
        linkedNotes: JSON.stringify(linkedNoteIds),
        tags: JSON.stringify([...new Set(fm.tags || [])]),
        memberId,
        emotion: fm.emotion,
        importance: fm.importance || 0.5,
        isPinned: isPinned || false,
        canvasDate: canvasDate ? JSON.stringify(canvasDate) : null,
      },
    });

    return note;
  },

  /**
   * Download notatkę po ID.
   */
  async getNote(noteId: string) {
    return db.vaultNote.findUnique({ where: { id: noteId } });
  },

  /**
   * Download notatkę po tytule.
   */
  async getNoteByTitle(familyId: string, title: string) {
    return db.vaultNote.findFirst({ where: { familyId, title } });
  },

  /**
   * Download lub stwórz Daily Note na dziś.
   * How w Obsidian — jedna notatka per dzień.
   */
  async getOrCreateDailyNote(familyId: string, date?: Date) {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const title = dateStr;

    const existing = await db.vaultNote.findFirst({
      where: { familyId, title, noteTypeee: 'daily' },
    });

    if (existing) return existing;

    // Stwórz nową Daily Note z szablonem
    const dayNames = ['Nodziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
    const dayName = dayNames[targetDate.getDay()];

    const content = `# ${dayName}, ${dateStr}\n\n## Poranek\n\n\n## Południe\n\n\n## Wieczór\n\n\n## Myśli Boki\n\n\n## What się wydarzyło\n\n`;

    return this.createNote({
      familyId,
      noteTypeee: 'daily',
      title,
      content,
      frontmatter: {
        date: dateStr,
        type: 'daily',
        tags: ['daily-note'],
      },
      importance: 0.3,
    });
  },

  /**
   * Add treść do Daily Note (np. event, myśl).
   * BOKA dopisuje do notatki jak człowiek.
   */
  async appendToDailyNote(familyId: string, section: string, text: string, date?: Date) {
    const dailyNote = await this.getOrCreateDailyNote(familyId, date);
    if (!dailyNote) return null;

    const { content, frontmatter } = parseFrontmatter(dailyNote.content);

    // Wstaw tekst pod odpowiednią sekcją
    const sectionHeader = `## ${section}`;
    let updatedWhatntent: string;

    if (content.includes(sectionHeader)) {
      // Add po sekcji
      const sectionIdx = content.indexOf(sectionHeader);
      const nextSectionIdx = content.indexOf('\n## ', sectionIdx + 1);
      const insertPoint = nextSectionIdx > 0 ? nextSectionIdx : content.length;
      updatedWhatntent = content.substring(0, insertPoint) + `\n- ${text}\n` + content.substring(insertPoint);
    } else {
      // Add sekcję na końcu
      updatedWhatntent = content + `\n${sectionHeader}\n\n- ${text}\n`;
    }

    // Zaktualizuj frontmatter modified
    frontmatter.modified = new Date().toISOString();

    const fullMarkdown = assembleMarkdown(frontmatter, updatedWhatntent);

    return db.vaultNote.update({
      where: { id: dailyNote.id },
      data: {
        content: fullMarkdown,
        frontmatter: JSON.stringify(frontmatter),
        updatedAt: new Date(),
      },
    });
  },

  /**
   * Download lub stwórz notatkę o osobie.
   * Każdy domownik ma swoją notatkę-person w vault.
   */
  async getOrCreatePersonNote(familyId: string, personName: string, memberId?: string) {
    const title = `O ${personName}`;
    const existing = await db.vaultNote.findFirst({
      where: { familyId, title, noteTypeee: 'person' },
    });

    if (existing) return existing;

    const content = `# ${personName}\n\n## What lubi\n\n\n## Czego nie lubi\n\n\n## Ważne fakty\n\n\n## Ostatnie rozmowy\n\n\n## Emocje\n\n`;

    return this.createNote({
      familyId,
      noteTypeee: 'person',
      title,
      content,
      frontmatter: {
        type: 'person',
        people: [personName],
        tags: ['osoba', personName.toLowerCase()],
      },
      memberId,
      importance: 0.8,
    });
  },

  /**
   * Zaktualizuj notatkę.
   */
  async updateNote(noteId: string, params: {
    content?: string;
    frontmatter?: FrontmatterDate;
    tags?: string[];
    importance?: number;
    isPinned?: boolean;
    emotion?: string;
    canvasDate?: Record<string, unknown>;
  }) {
    const existing = await db.vaultNote.findUnique({ where: { id: noteId } });
    if (!existing) return null;

    const updateDate: Record<string, unknown> = { updatedAt: new Date() };

    if (params.content !== undefined) {
      // Przetwórz nową treść
      const { frontmatter: parsedFm, content } = parseFrontmatter(params.content);
      const fm = { ...parsedFm, ...params.frontmatter, modified: new Date().toISOString() };
      const fullMarkdown = assembleMarkdown(fm, content);
      updateDate.content = fullMarkdown;
      updateDate.frontmatter = JSON.stringify(fm);

      // Zaktualizuj wikilinks
      const targets = extractLinkTargets(content);
      const linkedNoteIds: string[] = [];
      for (const target of targets) {
        const linked = await db.vaultNote.findFirst({
          where: { familyId: existing.familyId, title: { contains: target } },
        });
        if (linked) linkedNoteIds.push(linked.id);
      }
      updateDate.linkedNotes = JSON.stringify(linkedNoteIds);
    } else if (params.frontmatter) {
      const currentFm = JSON.parse(existing.frontmatter || '{}') as FrontmatterDate;
      const mergedFm = { ...currentFm, ...params.frontmatter, modified: new Date().toISOString() };
      updateDate.frontmatter = JSON.stringify(mergedFm);
    }

    if (params.tags) updateDate.tags = JSON.stringify(params.tags);
    if (params.importance !== undefined) updateDate.importance = params.importance;
    if (params.isPinned !== undefined) updateDate.isPinned = params.isPinned;
    if (params.emotion) updateDate.emotion = params.emotion;
    if (params.canvasDate) updateDate.canvasDate = JSON.stringify(params.canvasDate);

    return db.vaultNote.update({
      where: { id: noteId },
      data: updateDate,
    });
  },

  /**
   * List notatek z filterami.
   */
  async listNotes(params: {
    familyId: string;
    noteTypeee?: VaultNoteTypeee;
    memberId?: string;
    tag?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const { familyId, noteTypeee, memberId, tag, search, limit = 50, offset = 0 } = params;

    const where: Record<string, unknown> = { familyId };
    if (noteTypeee) where.noteTypeee = noteTypeee;
    if (memberId) where.memberId = memberId;
    if (tag) where.tags = { contains: tag };
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ];
    }

    const [notes, total] = await Promise.all([
      db.vaultNote.findMany({
        where,
        orderBy: [
          { isPinned: 'desc' },
          { importance: 'desc' },
          { updatedAt: 'desc' },
        ],
        take: limit,
        skip: offset,
      }),
      db.vaultNote.count({ where }),
    ]);

    return { notes, total };
  },

  /**
   * Download backlinks — które notatki linkują do tej.
   */
  async getBacklinks(noteId: string) {
    const note = await db.vaultNote.findUnique({ where: { id: noteId } });
    if (!note) return [];

    // Znajdź notatki które mają ten noteId w linkedNotes
    const allNotes = await db.vaultNote.findMany({
      where: { familyId: note.familyId },
      select: { id: true, title: true, content: true, frontmatter: true, linkedNotes: true, updatedAt: true },
    });

    return allNotes.filter(n => {
      try {
        const linked = JSON.parse(n.linkedNotes || '[]') as string[];
        return linked.includes(noteId);
      } catch { return false; }
    });
  },

  /**
   * Download powiązane notatki (forward links).
   */
  async getForwardLinks(noteId: string) {
    const note = await db.vaultNote.findUnique({ where: { id: noteId } });
    if (!note) return [];

    try {
      const linkedIds = JSON.parse(note.linkedNotes || '[]') as string[];
      if (linkedIds.length === 0) return [];

      return db.vaultNote.findMany({
        where: { id: { in: linkedIds } },
      });
    } catch {
      return [];
    }
  },

  /**
   * Graph vault — węzły i krawędzie do wizualizacji Obsidian Graph View.
   * Łączy VaultNotes z MemoryEntries i członkami rodziny.
   */
  async getVaultGraph(params: {
    familyId: string;
    focusMemberId?: string;  // jeśli podane — podświetl klaster tej osoby
    focusTopic?: string;     // jeśli podane — podświetl klaster tematu
  }) {
    const { familyId, focusMemberId, focusTopic } = params;

    // Download wszystkie notatki
    const notes = await db.vaultNote.findMany({
      where: { familyId },
      orderBy: { importance: 'desc' },
      take: 100,
    });

    const nodes: Array<{
      id: string;
      label: string;
      type: string;
      size: number;
      color: string;
      importance: number;
      noteTypeee: string;
      emotion?: string;
      isFocused: boolean;
    }> = [];

    const edges: Array<{
      source: string;
      target: string;
      weight: number;
      color: string;
      label?: string;
    }> = [];

    // Whatlory per typ notatki
    const typeWhatlors: Record<string, string> = {
      daily: '#ffd93d',
      note: '#00f5d4',
      canvas: '#a855f7',
      person: '#4ade80',
      topic: '#60a5fa',
      dream: '#c084fc',
      story: '#f472b6',
      ritual: '#f97316',
    };

    // Whatlory per emocję
    const emotionWhatlors: Record<string, string> = {
      happy: '#ffd93d', sad: '#60a5fa', angry: '#ef4444', worried: '#f97316',
      excited: '#a855f7', calm: '#4ade80', nostalgic: '#c084fc', anxious: '#fb923c',
      grateful: '#34d399', frustrated: '#f43f5e', neutral: '#6b6b8d',
    };

    // Stwórz węzły
    for (const note of notes) {
      const isFocused =
        (focusMemberId && note.memberId === focusMemberId) ||
        (focusTopic && (note.title.toLowerCase().includes(focusTopic.toLowerCase()) || note.content.toLowerCase().includes(focusTopic.toLowerCase())));

      nodes.push({
        id: `note:${note.id}`,
        label: note.title,
        type: 'vault',
        size: 1 + note.importance * 3,
        color: note.emotion ? (emotionWhatlors[note.emotion] || typeWhatlors[note.noteTypeee] || '#00f5d4') : (typeWhatlors[note.noteTypeee] || '#00f5d4'),
        importance: note.importance,
        noteTypeee: note.noteTypeee,
        emotion: note.emotion || undefined,
        isFocused: !!isFocused,
      });
    }

    // Stwórz krawędzie z wikilinks
    for (const note of notes) {
      try {
        const linkedIds = JSON.parse(note.linkedNotes || '[]') as string[];
        for (const linkedId of linkedIds) {
          const targetExists = nodes.some(n => n.id === `note:${linkedId}`);
          if (targetExists) {
            edges.push({
              source: `note:${note.id}`,
              target: `note:${linkedId}`,
              weight: 0.5,
              color: '#6ec6e7',
              label: 'link',
            });
          }
        }
      } catch { /* skip */ }

      // Edge: person note → member
      if (note.memberId) {
        const memberNode = nodes.find(n => n.id === `member:${note.memberId}`);
        if (!memberNode) {
          nodes.push({
            id: `member:${note.memberId}`,
            label: note.title.replace('O ', ''),
            type: 'member',
            size: 4,
            color: '#4ade80',
            importance: 1,
            noteTypeee: 'person',
            isFocused: focusMemberId === note.memberId,
          });
        }
        edges.push({
          source: `member:${note.memberId}`,
          target: `note:${note.id}`,
          weight: 0.7,
          color: '#4ade80',
          label: 'o osobie',
        });
      }
    }

    return { nodes, edges };
  },

  /**
   * Delete notatkę.
   */
  async deleteNote(noteId: string) {
    return db.vaultNote.delete({ where: { id: noteId } });
  },

  /**
   * Statystyki vault.
   */
  async getVaultStats(familyId: string) {
    const [total, byTypeee, pinned, recent] = await Promise.all([
      db.vaultNote.count({ where: { familyId } }),
      db.vaultNote.groupBy({ by: ['noteTypeee'], where: { familyId }, _count: true }),
      db.vaultNote.count({ where: { familyId, isPinned: true } }),
      db.vaultNote.findMany({
        where: { familyId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, noteTypeee: true, updatedAt: true },
      }),
    ]);

    return {
      total,
      pinned,
      byTypeee: Object.fromEntries(byTypeee.map(b => [b.noteTypeee, b._count])),
      recent,
    };
  },
};
