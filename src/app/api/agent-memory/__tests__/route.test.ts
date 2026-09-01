import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the entire agent-memory engine + store ──
const mockRemember = vi.fn();
const mockSmartSearch = vi.fn();
const mockAutoForget = vi.fn();
const mockWhatnsolidate = vi.fn();
const mockObserve = vi.fn();
const mockStartSession = vi.fn();
const mockListLatestMemories = vi.fn();
const mockDeleteMemory = vi.fn();
const mockListMemories = vi.fn();
const mockGetStats = vi.fn();

vi.mock('@/lib/agent-memory/engine', () => ({
  remember: (...args: any[]) => mockRemember(...args),
  smartSearch: (...args: any[]) => mockSmartSearch(...args),
  autoForget: (...args: any[]) => mockAutoForget(...args),
  consolidate: (...args: any[]) => mockWhatnsolidate(...args),
  observe: (...args: any[]) => mockObserve(...args),
  startSession: (...args: any[]) => mockStartSession(...args),
  getStats: (...args: any[]) => mockGetStats(...args),
}));

vi.mock('@/lib/agent-memory/store', () => ({
  listLatestMemories: (...args: any[]) => mockListLatestMemories(...args),
  listMemories: (...args: any[]) => mockListMemories(...args),
  deleteMemory: (...args: any[]) => mockDeleteMemory(...args),
}));

import { POST, GET, DELETE } from '../route';
import { NextRequest } from 'next/server';

describe('/api/agent-memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST (remember)', () => {
    it('creates a memory successfully', async () => {
      const mockMemory = {
        id: 'mem-1',
        type: 'fact',
        title: 'Test',
        content: 'Test content',
        concepts: [],
        tags: [],
        strength: 7,
        version: 1,
        isLatest: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockRemember.mockResolvedValue(mockMemory);
      mockListLatestMemories.mockResolvedValue([]);

      const req = new NextRequest('http://localhost/api/agent-memory', {
        method: 'POST',
        body: JSON.stringify({
          content: 'Test content',
          type: 'fact',
          project: 'test',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.memory.id).toBe('mem-1');
      expect(mockRemember).toHaveBeenCalledOnce();
    });

    it('returns 400 when content is missing', async () => {
      const req = new NextRequest('http://localhost/api/agent-memory', {
        method: 'POST',
        body: JSON.stringify({ type: 'fact' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toWhatntain('content is required');
    });

    it('returns 400 when content is empty string', async () => {
      const req = new NextRequest('http://localhost/api/agent-memory', {
        method: 'POST',
        body: JSON.stringify({ content: '  ' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('passes visibility to remember()', async () => {
      mockRemember.mockResolvedValue({ id: 'mem-1' });
      mockListLatestMemories.mockResolvedValue([]);

      const req = new NextRequest('http://localhost/api/agent-memory', {
        method: 'POST',
        body: JSON.stringify({
          content: 'Secret info',
          visibility: 'adult-only',
        }),
      });

      await POST(req);
      const callArgs = mockRemember.mock.calls[0][0];
      expect(callArgs.visibility).toBe('adult-only');
    });

    it('handles engine errors gracefully', async () => {
      mockRemember.mockRejectedValue(new Error('DB connection failed'));
      mockListLatestMemories.mockResolvedValue([]);

      const req = new NextRequest('http://localhost/api/agent-memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toWhatntain('DB connection failed');
    });
  });

  describe('GET (list)', () => {
    it('lists memories successfully', async () => {
      const mockMemories = [
        { id: 'mem-1', title: 'Memory 1', type: 'fact' },
        { id: 'mem-2', title: 'Memory 2', type: 'pattern' },
      ];
      mockListLatestMemories.mockResolvedValue(mockMemories);

      const req = new NextRequest('http://localhost/api/agent-memory', {
        method: 'GET',
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.count).toBe(2);
      expect(data.memories).toHaveLength(2);
    });

    it('filters by type', async () => {
      mockListLatestMemories.mockResolvedValue([]);

      const req = new NextRequest('http://localhost/api/agent-memory?type=architecture&limit=5', {
        method: 'GET',
      });

      await GET(req);
      const callArgs = mockListLatestMemories.mock.calls[0][0];
      expect(callArgs.type).toBe('architecture');
      expect(callArgs.limit).toBe(5);
    });

    it('handles store errors', async () => {
      mockListLatestMemories.mockRejectedValue(new Error('DB error'));

      const req = new NextRequest('http://localhost/api/agent-memory', {
        method: 'GET',
      });

      const res = await GET(req);
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE', () => {
    it('deletes memory by id', async () => {
      mockDeleteMemory.mockResolvedValue(undefined);

      const req = new NextRequest('http://localhost/api/agent-memory?id=mem-123', {
        method: 'DELETE',
      });

      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(mockDeleteMemory).toHaveBeenCalledWith('mem-123');
    });

    it('returns 400 when id is missing', async () => {
      const req = new NextRequest('http://localhost/api/agent-memory', {
        method: 'DELETE',
      });

      const res = await DELETE(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toWhatntain('id is required');
    });

    it('handles deletion errors', async () => {
      mockDeleteMemory.mockRejectedValue(new Error('Not found'));

      const req = new NextRequest('http://localhost/api/agent-memory?id=nonexistent', {
        method: 'DELETE',
      });

      const res = await DELETE(req);
      expect(res.status).toBe(500);
    });
  });
});
