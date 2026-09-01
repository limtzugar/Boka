import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAutoForget = vi.fn();
const mockConsolidate = vi.fn();

vi.mock('@/lib/agent-memory/engine', () => ({
  autoForget: (...args: any[]) => mockAutoForget(...args),
  consolidate: (...args: any[]) => mockConsolidate(...args),
}));

import { POST as forgetPOST } from '../forget/route';
import { POST as consolidatePOST } from '../consolidate/route';
import { NextRequest } from 'next/server';

describe('/api/agent-memory/forget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs auto-forget in dry-run mode', async () => {
    mockAutoForget.mockResolvedValue({
      ttlExpired: ['mem-1', 'mem-2'],
      contradictions: [{ memoryA: 'mem-3', memoryB: 'mem-4', similarity: 0.92 }],
      lowValueObs: ['obs-1'],
      dryRun: true,
    });

    const req = new NextRequest('http://localhost/api/agent-memory/forget', {
      method: 'POST',
      body: JSON.stringify({ dryRun: true }),
    });

    const res = await forgetPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ttlExpired).toHaveLength(2);
    expect(data.contradictions).toHaveLength(1);
    expect(data.lowValueObs).toHaveLength(1);
    expect(data.dryRun).toBe(true);
  });

  it('executes forget when dryRun is false', async () => {
    mockAutoForget.mockResolvedValue({
      ttlExpired: ['mem-1'],
      contradictions: [],
      lowValueObs: [],
      dryRun: false,
    });

    const req = new NextRequest('http://localhost/api/agent-memory/forget', {
      method: 'POST',
      body: JSON.stringify({ dryRun: false }),
    });

    const res = await forgetPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dryRun).toBe(false);
  });

  it('defaults to dryRun false when no body', async () => {
    mockAutoForget.mockResolvedValue({
      ttlExpired: [],
      contradictions: [],
      lowValueObs: [],
      dryRun: false,
    });

    const req = new NextRequest('http://localhost/api/agent-memory/forget', {
      method: 'POST',
      body: '{}',
    });

    const res = await forgetPOST(req);
    expect(res.status).toBe(200);
    const callArgs = mockAutoForget.mock.calls[0][0];
    expect(callArgs.dryRun).toBe(false);
  });

  it('handles engine errors', async () => {
    mockAutoForget.mockRejectedValue(new Error('DB locked'));

    const req = new NextRequest('http://localhost/api/agent-memory/forget', {
      method: 'POST',
      body: JSON.stringify({ dryRun: true }),
    });

    const res = await forgetPOST(req);
    expect(res.status).toBe(500);
  });
});

describe('/api/agent-memory/consolidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs decay-only consolidation', async () => {
    mockConsolidate.mockResolvedValue({
      tier: 'all',
      memoriesCreated: 0,
      memoriesSuperseded: 0,
      observationsConsumed: 0,
      decayedMemories: 5,
    });

    const req = new NextRequest('http://localhost/api/agent-memory/consolidate', {
      method: 'POST',
      body: JSON.stringify({ decayDays: 30, withLLM: false }),
    });

    const res = await consolidatePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.decayedMemories).toBe(5);
    expect(data.memoriesCreated).toBe(0);
  });

  it('runs consolidation with LLM extraction', async () => {
    mockConsolidate.mockResolvedValue({
      tier: 'all',
      memoriesCreated: 3,
      memoriesSuperseded: 1,
      observationsConsumed: 10,
      decayedMemories: 2,
    });

    const req = new NextRequest('http://localhost/api/agent-memory/consolidate', {
      method: 'POST',
      body: JSON.stringify({ withLLM: true, batchSize: 15 }),
    });

    const res = await consolidatePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.memoriesCreated).toBe(3);
    expect(data.observationsConsumed).toBe(10);

    const callArgs = mockConsolidate.mock.calls[0][0];
    expect(callArgs.withLLM).toBe(true);
    expect(callArgs.batchSize).toBe(15);
  });

  it('defaults to withLLM false', async () => {
    mockConsolidate.mockResolvedValue({
      tier: 'all',
      memoriesCreated: 0,
      memoriesSuperseded: 0,
      observationsConsumed: 0,
      decayedMemories: 0,
    });

    const req = new NextRequest('http://localhost/api/agent-memory/consolidate', {
      method: 'POST',
      body: '{}',
    });

    const res = await consolidatePOST(req);
    expect(res.status).toBe(200);
    const callArgs = mockConsolidate.mock.calls[0][0];
    expect(callArgs.withLLM).toBe(false);
  });

  it('handles consolidation errors', async () => {
    mockConsolidate.mockRejectedValue(new Error('LLM timeout'));

    const req = new NextRequest('http://localhost/api/agent-memory/consolidate', {
      method: 'POST',
      body: JSON.stringify({ withLLM: true }),
    });

    const res = await consolidatePOST(req);
    expect(res.status).toBe(500);
  });
});
