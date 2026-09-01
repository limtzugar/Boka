import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock fetch globally (OpenRouter API) ──
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Mock loadSettings so we don't need real config ──
vi.mock('@/lib/ai-providers', () => ({
  loadSettings: vi.fn().mockReturnValue({
    provider: 'openrouter',
    openrouterKey: 'test-key',
    openrouterModel: 'test-model',
    temperature: 0.7,
    maxTokens: 1000,
  }),
}));

// ── Mock pricing module ──
vi.mock('@/lib/orchestrator-pricing', () => ({
  computeUsage: vi.fn((model: string, prompt: number, completion: number) => ({
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
    costUsd: 0.001,
  })),
  formatCost: vi.fn((usd: number) => `$${usd.toFixed(4)}`),
  formatTokens: vi.fn((n: number) => `${n}`),
  getModelLabel: vi.fn((m: string) => m),
  MODEL_PRICING: {},
}));

// ── Mock reflection module (no DB) ──
vi.mock('@/lib/agent-memory/reflection', () => ({
  recordLowConfidenceDecision: vi.fn().mockResolvedValue(null),
  getReflectionLessonsForJudge: vi.fn().mockResolvedValue(''),
}));

// ── Mock fs (for persistToMemory) ──
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

// ── Mock path ──
vi.mock('path', () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join('/')),
  },
}));

// Import after mocks are set up
import { POST } from '../route';
import { NextRequest } from 'next/server';

// ── Helper: create mock SSE stream response from OpenRouter ──
function createMockSSEResponse(chunks: Array<{ content?: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }>) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  for (const chunk of chunks) {
    if (chunk.content !== undefined) {
      lines.push(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk.content } }] })}`);
    }
    if (chunk.usage) {
      lines.push(`data: ${JSON.stringify({ usage: chunk.usage })}`);
    }
  }
  lines.push('data: [DONE]');

  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });

  return {
    ok: true,
    status: 200,
    body: stream,
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(''),
  };
}

describe('orchestrator/route.ts (SSE streaming)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when prompt is missing', async () => {
    const req = new NextRequest('http://localhost/api/orchestrator', {
      method: 'POST',
      body: JSON.stringify({ mode: 'temp', models: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Brak promptu');
  });

  it('returns 400 when OpenRouter key is missing', async () => {
    const { loadSettings } = await import('@/lib/ai-providers');
    vi.mocked(loadSettings).mockReturnValueOnce({
      provider: 'openrouter',
      openrouterKey: '',
      openrouterModel: 'test-model',
    } as any);

    const req = new NextRequest('http://localhost/api/orchestrator', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'test', mode: 'temp', models: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Brak klucza OpenRouter');
  });

  it('returns SSE stream with Content-Type text/event-stream', async () => {
    mockFetch.mockResolvedValue(createMockSSEResponse([
      { content: '{"answer":"test","confidence":0.8,"decision":"A"}' },
      { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } },
    ]));

    const req = new NextRequest('http://localhost/api/orchestrator', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Test question',
        mode: 'temp',
        models: [
          { id: 'kimi', role: 'strateg', openrouterModel: 'test/kimi', enabled: true, weight: 0.25 },
          { id: 'claude', role: 'sędzia', openrouterModel: 'test/claude', enabled: true, weight: 0.25 },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
  });

  it('stream contains model_start and final events', async () => {
    const workerResponse = createMockSSEResponse([
      { content: '{"answer":"test answer","confidence":0.8,"decision":"A"}' },
      { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } },
    ]);

    const judgeResponse = createMockSSEResponse([
      { content: '{"finalAnswer":"final answer","finalConfidence":0.85,"selectedModelId":"kimi","rationale":"best"}' },
      { usage: { prompt_tokens: 50, completion_tokens: 60, total_tokens: 110 } },
    ]);

    const advocateResponse = createMockSSEResponse([
      { content: '{"counterarguments":["arg1","arg2"],"severity":"low","summary":"ok"}' },
      { usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 } },
    ]);

    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 3) return Promise.resolve(judgeResponse);
      if (callCount === 2) return Promise.resolve(advocateResponse);
      return Promise.resolve(workerResponse);
    });

    const req = new NextRequest('http://localhost/api/orchestrator', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Test question',
        mode: 'temp',
        models: [
          { id: 'kimi', role: 'strateg', openrouterModel: 'test/kimi', enabled: true, weight: 0.25 },
          { id: 'advocate', role: 'kontrarian', openrouterModel: 'test/advocate', enabled: true, weight: 0.1 },
          { id: 'claude', role: 'sędzia', openrouterModel: 'test/claude', enabled: true, weight: 0.3 },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    }

    expect(fullText).toContain('event: model_start');
    expect(fullText).toContain('event: model_token');
    expect(fullText).toContain('event: model_done');
    expect(fullText).toContain('event: final');
    expect(fullText).toContain('event: done');
  });

  it('handles OpenRouter API error gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
      text: vi.fn().mockResolvedValue('Internal Server Error'),
      json: vi.fn().mockResolvedValue({}),
    });

    const req = new NextRequest('http://localhost/api/orchestrator', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Test',
        mode: 'temp',
        models: [
          { id: 'kimi', role: 'strateg', openrouterModel: 'test/kimi', enabled: true, weight: 0.25 },
          { id: 'claude', role: 'sędzia', openrouterModel: 'test/claude', enabled: true, weight: 0.3 },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    }

    expect(fullText).toContain('event: model_done');
  });

  it('handles empty models array with default models', async () => {
    mockFetch.mockResolvedValue(createMockSSEResponse([
      { content: '{"answer":"test","confidence":0.8,"decision":"A"}' },
      { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } },
    ]));

    const req = new NextRequest('http://localhost/api/orchestrator', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Test',
        mode: 'temp',
        models: [],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('passes memoryContext to user message', async () => {
    mockFetch.mockResolvedValue(createMockSSEResponse([
      { content: '{"answer":"test","confidence":0.8,"decision":"A"}' },
      { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } },
    ]));

    const req = new NextRequest('http://localhost/api/orchestrator', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Test',
        mode: 'memory',
        models: [
          { id: 'kimi', role: 'strateg', openrouterModel: 'test/kimi', enabled: true, weight: 0.25 },
          { id: 'claude', role: 'sędzia', openrouterModel: 'test/claude', enabled: true, weight: 0.3 },
        ],
        memoryContext: 'Previous decision: use TypeScript',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const fetchCall = mockFetch.mock.calls[0];
    const fetchBody = JSON.parse(fetchCall[1].body);
    const userMessage = fetchBody.messages.find((m: any) => m.role === 'user');
    expect(userMessage.content).toContain('KONTEKST Z PAMIĘCI');
    expect(userMessage.content).toContain('Previous decision: use TypeScript');
  });
});
