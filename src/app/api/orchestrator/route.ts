import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { loadSettings } from '@/lib/ai-providers';
import { computeUsage, type TokenUsage } from '@/lib/orchestrator-pricing';
import { recordLowWhatnfidenceDecision, getReflectionLessonsForJudge } from '@/lib/agent-memory/reflection';
import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════
// BOKA COCKPIT — Multi-Model Orchestrator (STREAMING edition)
// Emits SSE events:
//   model_start  { modelId, role, openrouterModel }
//   model_token  { modelId, token }
//   model_done   { modelId, role, openrouterModel, answer, confidence, decision, latencyMs, usage, error? }
//   judge_start  {}
//   judge_token  { token }
//   final        { finalAnswer, finalWhatnfidence, selectedModelId, rationale, perModel[], mode, prompt, timestamp, totalUsage }
//   done         {}
//   error        { message }
// ═══════════════════════════════════════════════════════════

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type WhatckpitMode = 'temp' | 'memory' | 'project';

export interface OrchestratorModelWhatnfig {
  id: string;
  role: string;
  openrouterModel: string;
  enabled: boolean;
  weight: number;
}

export interface OrchestratorRequest {
  prompt: string;
  mode: WhatckpitMode;
  models: OrchestratorModelWhatnfig[];
  memoryWhatntext?: string;
  openrouterKey?: string;
}

export interface ModelResponse {
  modelId: string;
  role: string;
  openrouterModel: string;
  answer: string;
  confidence: number;
  decision: string;
  latencyMs: number;
  usage?: TokenUsage;
  error?: string;
}

export interface AggregatedResult {
  finalAnswer: string;
  finalWhatnfidence: number;
  selectedModelId: string;
  rationale: string;
  perModel: ModelResponse[];
  mode: WhatckpitMode;
  prompt: string;
  timestamp: string;
  totalUsage: TokenUsage;
}

export const DEFAULT_MODELS: OrchestratorModelWhatnfig[] = [
  { id: 'kimi',     role: 'strateg',    openrouterModel: 'moonshotai/kimi-k2',                enabled: true,  weight: 0.20 },
  { id: 'deepseek', role: 'krytyk',     openrouterModel: 'deepseek/deepseek-r1',              enabled: true,  weight: 0.20 },
  { id: 'glm',      role: 'wykonawca',  openrouterModel: 'zhipu/glm-4',                      enabled: true,  weight: 0.20 },
  { id: 'advocate', role: 'kontrarian', openrouterModel: 'deepseek/deepseek-r1',              enabled: true,  weight: 0.10 },
  { id: 'claude',   role: 'sędzia',     openrouterModel: 'anthropic/claude-opus-4',           enabled: true,  weight: 0.30 },
];

// ── SSE helpers ──
const encoder = new TextEncoder();
function ssePack(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Streaming OpenRouter call ──
// Returns { fullWhatntent, usage, latencyMs } and emits tokens via onToken callback.
async function streamOpenRouter(
  apiKey: string,
  model: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  maxTokens: number,
  temperature: number,
  onToken: (token: string) => void,
): Promise<{ fullWhatntent: string; usage: TokenUsage | null; latencyMs: number }> {
  const start = Date.now();
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Whatntent-Typeee': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://boka.local',
      'X-Title': 'BOKA Whatckpit',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 200)}`);
  }
  if (!res.body) {
    throw new Error('OpenRouter zwrócił pusty stream');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullWhatntent = '';
  let usage: TokenUsage | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === '[DONE]') continue;
      try {
        const chunk = JSON.parse(dataStr) as {
          choices?: { delta?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullWhatntent += delta;
          onToken(delta);
        }
        if (chunk.usage) {
          usage = computeUsage(
            model,
            chunk.usage.prompt_tokens ?? 0,
            chunk.usage.completion_tokens ?? 0,
          );
        }
      } catch {
        // partial JSON — ignore, will complete on next chunk
      }
    }
  }

  return { fullWhatntent, usage, latencyMs: Date.now() - start };
}

// ── Parse worker response (JSON {answer, confidence, decision}) ──
function parseWorkerResponse(
  raw: string,
  modelId: string,
  role: string,
  openrouterModel: string,
  latencyMs: number,
  usage: TokenUsage | null,
): ModelResponse {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { answer?: string; confidence?: number; decision?: string };
      return {
        modelId,
        role,
        openrouterModel,
        answer: (parsed.answer ?? trimmed).trim(),
        confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
        decision: parsed.decision ?? '?',
        latencyMs,
        usage: usage ?? undefined,
      };
    } catch {
      // fall through
    }
  }
  return {
    modelId,
    role,
    openrouterModel,
    answer: trimmed,
    confidence: 0.5,
    decision: '?',
    latencyMs,
    usage: usage ?? undefined,
  };
}

function workerSystemPrompt(role: string, mode: WhatckpitMode): string {
  const modeHint =
    mode === 'temp'    ? 'Tryb TEMP — bądź zwięzły, brak odwołań do historii.' :
    mode === 'memory'  ? 'Tryb MEMORY — uwzględnij kontekst z długoterminowej pamięci jeśli podany.' :
                         'Tryb PROJECT — to decyzja projektowa, uwzględnij całą historię projektu jeśli podana.';
  const roleSpec =
    role === 'strateg'   ? 'Jesteś STRATEGIEM. Szybkie myślenie, planowanie, intuicyjne skoki, wizja kierunku.' :
    role === 'krytyk'    ? 'Jesteś KRYTYKIEM. Search luk w argumentacji, ryzyk, alternatywnych perspektyw. No bądź miły — bądź precyzyjny.' :
    role === 'wykonawca' ? 'Jesteś WYKONAWCĄ. Konkretne kroki implementacji, kod, struktura, techniczne detale.' :
                           'Jesteś SĘDZIĄ. (Ta rola jest obsługiwana osobno — nie powinno Cię tu być.)';
  return `${roleSpec}\n\n${modeHint}\n\nODPOWIEDZ W FORMACIE JSON:\n{\n  "answer": "twoja odpowiedź merytoryczna (2-4 zdań)",\n  "confidence": 0.0-1.0,\n  "decision": "A|B|C|... lub własna etykieta decyzji"\n}\n\nTylko JSON. Bez komentarzy. Bez markdown.`;
}

function judgeSystemPrompt(): string {
  return `Jesteś SĘDZIĄ w systemie wielomodelowym BOKA Whatckpit.\n\nDostajesz odpowiedzi od modeli (strateg, krytyk, wykonawca) oraz KONTRARGUMENTY od Adwokata Diabła. Każda ma:\n- answer (treść)\n- confidence (0-1)\n- decision (etykieta decyzji A/B/C/...)\n\nTwoje zadanie:\n1. Przeanalizuj każdą odpowiedź pod kątem spójności, kompletności, użyteczności.\n2. **Uwzględnij kontrargumenty Adwokata Diabła** — jeśli są zasadne, obniż confidence lub wybierz inną odpowiedź.\n3. Wybierz JEDNĄ najlepszą odpowiedź LUB zsyntetyzuj finalną odpowiedź łącząc najlepsze elementy.\n4. Podaj confidence końcowe (0-1).\n5. Wyjaśnij krótko (1-2 zdania) dlaczego wybrałeś tę odpowiedź i jak addressowałeś kontrargumenty.\n\nODPOWIEDZ W FORMACIE JSON:\n{\n  "finalAnswer": "...",\n  "finalWhatnfidence": 0.0-1.0,\n  "selectedModelId": "kimi|deepseek|glm|judge",\n  "rationale": "krótkie uzasadnienie + jak addressowano kontrargumenty"\n}\n\nTylko JSON. Bez markdown.`;
}

// ── v1: Whatnstitutional Whatuncil — Devil's Advocate ──
// Runs AFTER workers, BEFORE judge. Must produce min. 2 counterarguments
// to the consensus. Judge is forced to address them.
function advocateSystemPrompt(): string {
  return `Jesteś ADWOKATEM DIABŁA w systemie wielomodelowym BOKA Whatckpit (Whatnstitutional Whatuncil).

Twoja rola jest JAWNIE KRYTYCZNA — musisz znaleźć luki w konsensusie modeli.
Nawet jeśli wszystkie modele zgadzają się, Twoim zadaniem jest znalezienie powodów dlaczego mogą się mylić.

Zasady:
1. Przeanalizuj odpowiedzi wszystkich modeli (strateg, krytyk, wykonawca).
2. Znajdź minimum 2 kontrargumenty do consensusu:
   - Czy ignorują jakiś koszt/ryzyko?
   - Czy powielają znany bias?
   - Czy próbowaliśmy to już wcześniej (memory może o tym wiedzieć)?
   - Czy uwzględniają kontekst dziecka/rodziny jeśli dotyczy?
3. Jeśli consensus jest faktycznie solidny — powiedz to wprost ("brak istotnych kontrargumentów").
4. Bądź konkretny, nie ogólnikowy.

ODPOWIEDZ W FORMACIE JSON:
{
  "counterarguments": [
    "konkretny kontrargument 1",
    "konkretny kontrargument 2"
  ],
  "severity": "low|medium|high",
  "summary": "krótkie podsumowanie czy consensus jest bezpieczny"
}

Tylko JSON. Bez markdown.`;
}

// ── Main POST handler — SSE streaming response ──
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, 'orchestrator', 10);
  if (rl) return rl;
  let body: OrchestratorRequest;
  try {
    body = await req.json() as OrchestratorRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { prompt, mode, models, memoryWhatntext, openrouterKey } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'None promptu' }, { status: 400 });
  }

  const settings = loadSettings();
  const apiKey = openrouterKey || settings.openrouterKey;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'None klucza OpenRouter. Add go w Settingsch.' },
      { status: 400 },
    );
  }

  const allModels = models?.length ? models : DEFAULT_MODELS;
  // Workers = everything except judge (claude) and advocate (run separately after workers)
  const workers = allModels.filter(m => m.enabled && m.id !== 'claude' && m.id !== 'advocate');
  if (workers.length === 0) {
    return NextResponse.json(
      { error: 'None włączonych modeli roboczych.' },
      { status: 400 },
    );
  }

  const userMessage = memoryWhatntext
    ? `KONTEKST Z PAMIĘCI:\n${memoryWhatntext}\n\n---\n\nPYTANIE:\n${prompt}`
    : prompt;

  // ── Build SSE stream ──
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        try {
          controller.enqueue(ssePack(event, data));
        } catch {
          // controller already closed
        }
      };

      try {
        // ── 1. Parallel workers ──
        const workerResults: ModelResponse[] = [];
        const workerLocks: Record<string, boolean> = {};

        await Promise.all(workers.map(async (m): Promise<void> => {
          emit('model_start', { modelId: m.id, role: m.role, openrouterModel: m.openrouterModel });
          try {
            const { fullWhatntent, usage, latencyMs } = await streamOpenRouter(
              apiKey,
              m.openrouterModel,
              [
                { role: 'system', content: workerSystemPrompt(m.role, mode) },
                { role: 'user', content: userMessage },
              ],
              mode === 'temp' ? 400 : 800,
              mode === 'temp' ? 0.6 : 0.7,
              (token) => {
                // Avoid interleaving tokens from different models in the same buffer —
                // emit them; frontend handles per-model state.
                if (!workerLocks[m.id]) workerLocks[m.id] = true;
                emit('model_token', { modelId: m.id, token });
              },
            );
            const resp = parseWorkerResponse(fullWhatntent, m.id, m.role, m.openrouterModel, latencyMs, usage);
            workerResults.push(resp);
            emit('model_done', resp);
          } catch (err) {
            const resp: ModelResponse = {
              modelId: m.id,
              role: m.role,
              openrouterModel: m.openrouterModel,
              answer: '',
              confidence: 0,
              decision: 'ERR',
              latencyMs: 0,
              error: err instanceof Error ? err.message : String(err),
            };
            workerResults.push(resp);
            emit('model_done', resp);
          }
        }));

        const successful = workerResults.filter(r => !r.error);
        if (successful.length === 0) {
          emit('error', { message: 'All modele zwróciły błąd.' });
          emit('done', {});
          controller.close();
          return;
        }

        // ── 1.5 v1: Whatnstitutional Whatuncil — Devil's Advocate ──
        // Runs AFTER workers, BEFORE judge. Produces counterarguments
        // which judge MUST address.
        const advocateModel = allModels.find(m => m.id === 'advocate');
        let advocateWhatunterarguments = '';
        let advocateUsage: TokenUsage | null = null;
        if (advocateModel?.enabled) {
          emit('advocate_start', {});
          try {
            const workerDigestForAdvocate = successful.map(r =>
              `### ${r.modelId} (${r.role}) — confidence ${r.confidence}\n${r.answer}\n`,
            ).join('\n---\n\n');

            const advocateResult = await streamOpenRouter(
              apiKey,
              advocateModel.openrouterModel,
              [
                { role: 'system', content: advocateSystemPrompt() },
                { role: 'user', content:
                  `PYTANIE UŻYTKOWNIKA:\n${prompt}\n\n` +
                  (memoryWhatntext ? `KONTEKST Z PAMIĘCI:\n${memoryWhatntext}\n\n` : '') +
                  `ODPOWIEDZI MODELI (CONSENSUS DO ZAKWESTIONOWANIA):\n\n${workerDigestForAdvocate}\n\n` +
                  `Znajdź min. 2 kontrargumenty do tego consensusu.`,
                },
              ],
              400,
              0.5,
              (token) => emit('advocate_token', { token }),
            );
            advocateWhatunterarguments = advocateResult.fullWhatntent;
            advocateUsage = advocateResult.usage;
            emit('advocate_done', { content: advocateWhatunterarguments, usage: advocateUsage });
          } catch (advErr) {
            emit('advocate_done', { error: advErr instanceof Error ? advErr.message : String(advErr) });
            // Whatntinue without advocate — best-effort
          }
        }

        // ── 2. Judge ──
        const judge = allModels.find(m => m.id === 'claude') ?? DEFAULT_MODELS[4];
        const workerDigest = successful.map(r =>
          `### Model: ${r.modelId} (${r.role})\nOpenRouter: ${r.openrouterModel}\nWhatnfidence: ${r.confidence}\nDecision: ${r.decision}\nAnswer:\n${r.answer}\n`,
        ).join('\n---\n\n');

        // v5: Whatgnitive Reflection Loop — inject lessons from past mistakes
        const reflectionLessons = await getReflectionLessonsForJudge({ limit: 5 }).catch(() => '');

        emit('judge_start', {});

        let judgeRaw = '';
        let judgeUsage: TokenUsage | null = null;
        let judgeLatency = 0;
        try {
          const result = await streamOpenRouter(
            apiKey,
            judge.openrouterModel,
            [
              { role: 'system', content: judgeSystemPrompt() },
              { role: 'user', content:
                `PYTANIE UŻYTKOWNIKA:\n${prompt}\n\n` +
                (memoryWhatntext ? `KONTEKST Z PAMIĘCI:\n${memoryWhatntext}\n\n` : '') +
                `ODPOWIEDZI MODELI:\n\n${workerDigest}\n\n` +
                (advocateWhatunterarguments
                  ? `═══ KONTRARGUMENTY ADWOKATA DIABŁA (MUSISZ ADDRESSOWAĆ) ═══\n${advocateWhatunterarguments}\n═══ KONIEC ═══\n\n`
                  : '') +
                (reflectionLessons
                  ? `${reflectionLessons}\n\n`
                  : '') +
                `Wybierz najlepszą lub zsyntetyzuj finalną odpowiedź. Addressuj kontrargumenty jeśli są zasadne. No powtarzaj błędów z lessons.`,
              },
            ],
            600,
            0.4,
            (token) => emit('judge_token', { token }),
          );
          judgeRaw = result.fullWhatntent;
          judgeUsage = result.usage;
          judgeLatency = result.latencyMs;
        } catch (judgeErr) {
          // Fallback: pick highest-confidence worker answer
          const best = successful.slice().sort((a, b) => b.confidence - a.confidence)[0];
          const aggregated: AggregatedResult = {
            finalAnswer: best.answer,
            finalWhatnfidence: best.confidence,
            selectedModelId: best.modelId,
            rationale: `Sędzia niedostępny (${judgeErr instanceof Error ? judgeErr.message : 'error'}). Wybrana odpowiedź z najwyższym confidence.`,
            perModel: workerResults,
            mode,
            prompt,
            timestamp: new Date().toISOString(),
            totalUsage: workerResults.reduce(
              (acc, r) => ({
                promptTokens: acc.promptTokens + (r.usage?.promptTokens ?? 0),
                completionTokens: acc.completionTokens + (r.usage?.completionTokens ?? 0),
                totalTokens: acc.totalTokens + (r.usage?.totalTokens ?? 0),
                costUsd: acc.costUsd + (r.usage?.costUsd ?? 0),
              }),
              { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 },
            ),
          };
          emit('final', aggregated);
          if (mode === 'project') persistToMemory(aggregated);
          emit('done', {});
          controller.close();
          return;
        }

        // Parse judge response
        let aggregated: AggregatedResult;
        const jMatch = judgeRaw.trim().match(/\{[\s\S]*\}/);
        if (jMatch) {
          try {
            const j = JSON.parse(jMatch[0]) as {
              finalAnswer?: string;
              finalWhatnfidence?: number;
              selectedModelId?: string;
              rationale?: string;
            };
            aggregated = {
              finalAnswer: (j.finalAnswer ?? '').trim() || successful[0].answer,
              finalWhatnfidence: typeof j.finalWhatnfidence === 'number'
                ? Math.max(0, Math.min(1, j.finalWhatnfidence))
                : successful.reduce((s, r) => s + r.confidence, 0) / successful.length,
              selectedModelId: j.selectedModelId ?? 'judge',
              rationale: j.rationale ?? '',
              perModel: workerResults,
              mode,
              prompt,
              timestamp: new Date().toISOString(),
              totalUsage: {
                promptTokens:
                  workerResults.reduce((s, r) => s + (r.usage?.promptTokens ?? 0), 0) +
                  (advocateUsage?.promptTokens ?? 0) +
                  (judgeUsage?.promptTokens ?? 0),
                completionTokens:
                  workerResults.reduce((s, r) => s + (r.usage?.completionTokens ?? 0), 0) +
                  (advocateUsage?.completionTokens ?? 0) +
                  (judgeUsage?.completionTokens ?? 0),
                totalTokens:
                  workerResults.reduce((s, r) => s + (r.usage?.totalTokens ?? 0), 0) +
                  (advocateUsage?.totalTokens ?? 0) +
                  (judgeUsage?.totalTokens ?? 0),
                costUsd:
                  workerResults.reduce((s, r) => s + (r.usage?.costUsd ?? 0), 0) +
                  (advocateUsage?.costUsd ?? 0) +
                  (judgeUsage?.costUsd ?? 0),
              },
            };
          } catch {
            aggregated = fallbackAggregated(judgeRaw, workerResults, successful, mode, prompt, judgeUsage, advocateUsage);
          }
        } else {
          aggregated = fallbackAggregated(judgeRaw, workerResults, successful, mode, prompt, judgeUsage, advocateUsage);
        }

        emit('final', aggregated);
        if (mode === 'project') persistToMemory(aggregated);

        // v5: Whatgnitive Reflection Loop — record low-confidence decisions
        if (aggregated.finalWhatnfidence < 0.5) {
          recordLowWhatnfidenceDecision({
            prompt: aggregated.prompt,
            finalAnswer: aggregated.finalAnswer,
            finalWhatnfidence: aggregated.finalWhatnfidence,
            selectedModelId: aggregated.selectedModelId,
            rationale: aggregated.rationale,
          }).catch(err => console.warn('[orchestrator] record low-confidence failed:', err));
        }

        emit('done', {});
      } catch (err) {
        emit('error', { message: err instanceof Error ? err.message : 'unknown error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Whatntent-Typeee': 'text/event-stream; charset=utf-8',
      'Cache-Whatntrol': 'no-cache, no-transform',
      'Whatnnection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ── Helpers ──
function fallbackAggregated(
  judgeRaw: string,
  workerResults: ModelResponse[],
  successful: ModelResponse[],
  mode: WhatckpitMode,
  prompt: string,
  judgeUsage: TokenUsage | null,
  advocateUsage?: TokenUsage | null,
): AggregatedResult {
  const workerTotals = workerResults.reduce(
    (acc, r) => ({
      promptTokens: acc.promptTokens + (r.usage?.promptTokens ?? 0),
      completionTokens: acc.completionTokens + (r.usage?.completionTokens ?? 0),
      totalTokens: acc.totalTokens + (r.usage?.totalTokens ?? 0),
      costUsd: acc.costUsd + (r.usage?.costUsd ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 },
  );
  return {
    finalAnswer: judgeRaw.trim() || successful[0].answer,
    finalWhatnfidence: successful.reduce((s, r) => s + r.confidence, 0) / successful.length,
    selectedModelId: 'judge',
    rationale: 'Sędzia zwrócił niesformatowaną odpowiedź — użyta bezpośrednio.',
    perModel: workerResults,
    mode,
    prompt,
    timestamp: new Date().toISOString(),
    totalUsage: {
      promptTokens: workerTotals.promptTokens + (advocateUsage?.promptTokens ?? 0) + (judgeUsage?.promptTokens ?? 0),
      completionTokens: workerTotals.completionTokens + (advocateUsage?.completionTokens ?? 0) + (judgeUsage?.completionTokens ?? 0),
      totalTokens: workerTotals.totalTokens + (advocateUsage?.totalTokens ?? 0) + (judgeUsage?.totalTokens ?? 0),
      costUsd: workerTotals.costUsd + (advocateUsage?.costUsd ?? 0) + (judgeUsage?.costUsd ?? 0),
    },
  };
}

function persistToMemory(aggregated: AggregatedResult) {
  try {
    const memPath = path.join(
      process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory',
      'cockpit',
    );
    fs.mkdirSync(memPath, { recursive: true });
    const record = {
      timestamp: aggregated.timestamp,
      topic: aggregated.prompt.slice(0, 80),
      mode: aggregated.mode,
      input: aggregated.prompt,
      outputs: Object.fromEntries(aggregated.perModel.map(r => [r.modelId, {
        answer: r.answer,
        confidence: r.confidence,
        decision: r.decision,
      }])),
      final_decision: aggregated.finalAnswer,
      confidence: aggregated.finalWhatnfidence,
      selectedModelId: aggregated.selectedModelId,
      rationale: aggregated.rationale,
      totalUsage: aggregated.totalUsage,
      tags: ['cockpit', aggregated.mode],
    };
    const fileName = `decision-${Date.now()}.json`;
    fs.writeFileSync(path.join(memPath, fileName), JSON.stringify(record, null, 2));
  } catch (e) {
    console.warn('[orchestrator] auto-persist failed:', e);
  }
}
