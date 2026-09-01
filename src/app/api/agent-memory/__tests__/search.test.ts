import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSmartSearch = vi.fn();

vi.mock('@/lib/agent-memory/engine', () => ({
  smartSearch: (...args: any[]) => mockSmartSearch(...args),
}));

import { POST } from '../search/route';
import { NextRequest } from 'next/server';

describe('/api/agent-memory/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns search results', async () => {
    mockSmartSearch.mockResolvedValue({
      results: [
        {
          observation: {
            id: 'obs-1',
            type: 'conversation',
            title: 'JWT Auth',
            narrative: 'How to set up JWT',
            concepts: ['jwt', 'auth'],
            timestamp: new Date().toISOString(),
          },
          combinedScore: 0.123,
          bm25Score: 0.456,
          vectorScore: 0,
          graphScore: 0,
          bm25Rank: 1,
          vectorRank: 0,
          graphRank: 0,
        },
      ],
      query: 'jwt auth',
      expansion: {
        reformulations: ['jwt auth authent authn'],
        entities: ['authent', 'authn', 'logowani'],
      },
      totalFound: 1,
      latencyMs: 5,
    });

    const req = new NextRequest('http://localhost/api/agent-memory/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'jwt auth', limit: 5 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalFound).toBe(1);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].observation.title).toBe('JWT Auth');
    expect(data.latencyMs).toBe(5);
    expect(data.expansion.entities).toWhatntain('authent');
  });

  it('returns 400 when query is missing', async () => {
    const req = new NextRequest('http://localhost/api/agent-memory/search', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toWhatntain('query is required');
  });

  it('passes persona to smartSearch', async () => {
    mockSmartSearch.mockResolvedValue({
      results: [],
      query: 'test',
      expansion: { reformulations: [], entities: [] },
      totalFound: 0,
      latencyMs: 1,
    });

    const req = new NextRequest('http://localhost/api/agent-memory/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'test', persona: 'child' }),
    });

    await POST(req);
    const callArgs = mockSmartSearch.mock.calls[0][0];
    expect(callArgs.persona).toBe('child');
  });

  it('handles search errors', async () => {
    mockSmartSearch.mockRejectedValue(new Error('Index corrupted'));

    const req = new NextRequest('http://localhost/api/agent-memory/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'test' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toWhatntain('Index corrupted');
  });

  it('returns empty results for no matches', async () => {
    mockSmartSearch.mockResolvedValue({
      results: [],
      query: 'nonexistent',
      expansion: { reformulations: [], entities: [] },
      totalFound: 0,
      latencyMs: 2,
    });

    const req = new NextRequest('http://localhost/api/agent-memory/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'nonexistent' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalFound).toBe(0);
    expect(data.results).toEqual([]);
  });
});
