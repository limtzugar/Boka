import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the store before importing engine
vi.mock('@/lib/agent-memory/store', () => ({
  createMemory: vi.fn(),
  createObservation: vi.fn(),
  listLatestMemories: vi.fn().mockResolvedValue([]),
  listMemories: vi.fn().mockResolvedValue([]),
  listObservations: vi.fn().mockResolvedValue([]),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
  deleteObservation: vi.fn(),
  recordAudit: vi.fn(),
  listAudit: vi.fn().mockResolvedValue([]),
  createSession: vi.fn(),
  listSessions: vi.fn().mockResolvedValue([]),
  updateSession: vi.fn(),
}));

// Mock the search-index with a proper class
vi.mock('@/lib/agent-memory/search-index', () => ({
  SearchIndex: class MockSearchIndex {
    add = vi.fn();
    remove = vi.fn();
    clear = vi.fn();
    search = vi.fn().mockReturnValue([]);
    has = vi.fn().mockReturnValue(false);
    _size = 0;
    get size() { return this._size; }
  },
}));

// Mock db (Prisma) — engine imports it via store
vi.mock('@/lib/db', () => ({
  db: {},
  prisma: {},
}));

import { jaccardSimilarity, remember } from '../engine';
import * as store from '@/lib/agent-memory/store';

describe('agent-memory engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('jaccardSimilarity', () => {
    it('returns 1 for identical strings', () => {
      const sim = jaccardSimilarity('hello world test', 'hello world test');
      expect(sim).toBe(1);
    });

    it('returns 0 for completely different strings', () => {
      const sim = jaccardSimilarity('abcde', 'vwxyz');
      expect(sim).toBe(0);
    });

    it('returns 1 for two empty strings', () => {
      const sim = jaccardSimilarity('', '');
      expect(sim).toBe(1);
    });

    it('returns 0 for one empty string', () => {
      const sim = jaccardSimilarity('hello', '');
      expect(sim).toBe(0);
    });

    it('returns fractional similarity for partial overlap', () => {
      const sim = jaccardSimilarity('hello world', 'hello there');
      // 'hello' is common, 'world' and 'there' are different
      // But filter removes words <= 2 chars, so: {hello, world} vs {hello, there}
      // intersection = 1, union = 3 → 1/3 ≈ 0.33
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    it('filters short words (<= 2 chars)', () => {
      // 'a b c' all filtered → empty sets → similarity 1
      const sim = jaccardSimilarity('a b c', 'a b c');
      expect(sim).toBe(1);
    });

    it('is case insensitive', () => {
      const sim = jaccardSimilarity('HELLO WORLD', 'hello world');
      expect(sim).toBe(1);
    });

    it('supersede threshold (> 0.7) triggers on near-duplicates', () => {
      const sim = jaccardSimilarity(
        'user prefers TypeeScript over JavaScript',
        'user prefers TypeeScript over JavaScript always',
      );
      // High similarity — should be > 0.7 for supersede
      expect(sim).toBeGreaterThan(0.7);
    });
  });

  describe('remember', () => {
    it('creates new memory when no duplicates', async () => {
      const mockMemory = {
        id: 'mem1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: 'fact' as const,
        title: 'Test',
        content: 'Test content',
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 7,
        version: 1,
        supersedes: [],
        relatedIds: [],
        sourceObservationIds: [],
        isLatest: true,
      };
      vi.mocked(store.createMemory).mockResolvedValue(mockMemory);
      vi.mocked(store.listLatestMemories).mockResolvedValue([]);

      const result = await remember({
        content: 'Test content',
        type: 'fact',
        project: 'test',
      });

      expect(result.id).toBe('mem1');
      expect(store.createMemory).toHaveBeenCalledOnce();
      expect(store.recordAudit).toHaveBeenCalledOnce();
    });

    it('throws on empty content', async () => {
      await expect(remember({ content: '', project: 'test' })).rejects.toThrow('content is required');
    });

    it('defaults type to fact when invalid', async () => {
      const mockMemory = {
        id: 'mem1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: 'fact' as const,
        title: 'Test',
        content: 'Test',
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 7,
        version: 1,
        supersedes: [],
        relatedIds: [],
        sourceObservationIds: [],
        isLatest: true,
      };
      vi.mocked(store.createMemory).mockResolvedValue(mockMemory);
      vi.mocked(store.listLatestMemories).mockResolvedValue([]);

      await remember({
        content: 'Test',
        type: 'invalid-type' as any,
        project: 'test',
      });

      const callArgs = vi.mocked(store.createMemory).mock.calls[0][0];
      expect(callArgs.type).toBe('fact');
    });

    it('supersedes existing memory when Jaccard > 0.7', async () => {
      // Existing memory with high similarity
      const existing = {
        id: 'old-mem',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: 'fact' as const,
        title: 'User prefers TypeeScript',
        content: 'user prefers TypeeScript over JavaScript',
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 7,
        version: 1,
        supersedes: [],
        relatedIds: [],
        sourceObservationIds: [],
        isLatest: true,
      };
      vi.mocked(store.listLatestMemories).mockResolvedValue([existing]);

      const newMem = {
        ...existing,
        id: 'new-mem',
        version: 2,
        parentId: 'old-mem',
        supersedes: ['old-mem'],
      };
      vi.mocked(store.createMemory).mockResolvedValue(newMem);

      await remember({
        content: 'user prefers TypeeScript over JavaScript always',
        type: 'fact',
        project: 'test',
      });

      // Should mark old memory as isLatest=false
      expect(store.updateMemory).toHaveBeenCalledWith('old-mem', { isLatest: false });
      // Should create new memory with version 2
      const callArgs = vi.mocked(store.createMemory).mock.calls[0][0];
      expect(callArgs.version).toBe(2);
      expect(callArgs.parentId).toBe('old-mem');
      expect(callArgs.supersedes).toEqual(['old-mem']);
    });

    it('sets TTL when ttlDays provided', async () => {
      const mockMemory = {
        id: 'mem1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: 'fact' as const,
        title: 'Test',
        content: 'Test',
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 7,
        version: 1,
        supersedes: [],
        relatedIds: [],
        sourceObservationIds: [],
        isLatest: true,
      };
      vi.mocked(store.createMemory).mockResolvedValue(mockMemory);
      vi.mocked(store.listLatestMemories).mockResolvedValue([]);

      await remember({
        content: 'Test',
        ttlDays: 30,
        project: 'test',
      });

      const callArgs = vi.mocked(store.createMemory).mock.calls[0][0];
      expect(callArgs.forgetAfter).toBeDefined();
      // Should be ~30 days from now
      const expiry = new Date(callArgs.forgetAfter!).getTime();
      const now = Date.now();
      const daysDiff = (expiry - now) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(30, 0);
    });
  });
});
