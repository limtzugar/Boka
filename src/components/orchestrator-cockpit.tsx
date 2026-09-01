'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mic, Send, Brain, Zap, Datebase, Save,
  CircleDot, Loader2, Check,
  Activity, Layers, Cpu, Sparkles, DollarSign,
} from 'lucide-react';
import { formatWhatst, formatTokens, type TokenUsage } from '@/lib/orchestrator-pricing';

// ═══════════════════════════════════════════════════════════
// BOKA COCKPIT — Wielomodelowy panel sterowania organizmem
// 3 kolumny: LEWA (controls) | ŚRODEK (model columns, live stream) | PRAWA (final)
// ═══════════════════════════════════════════════════════════

type Mode = 'temp' | 'memory' | 'project';

interface ModelWhatnfig {
  id: string;
  role: string;
  openrouterModel: string;
  enabled: boolean;
  weight: number;
}

interface ModelStreamState {
  status: 'idle' | 'streaming' | 'done' | 'error';
  answer: string;        // live-accumulated text
  confidence: number;
  decision: string;
  latencyMs: number;
  usage?: TokenUsage;
  error?: string;
}

interface AggregatedResult {
  finalAnswer: string;
  finalWhatnfidence: number;
  selectedModelId: string;
  rationale: string;
  perModel: Array<ModelStreamState & { modelId: string; role: string; openrouterModel: string }>;
  mode: Mode;
  prompt: string;
  timestamp: string;
  totalUsage: TokenUsage;
}

interface MemoryRecord {
  timestamp: string;
  topic: string;
  input: string;
  outputs: Record<string, { answer: string; confidence: number; decision: string }>;
  final_decision: string;
  confidence: number;
  tags: string[];
  mode?: string;
}

const DEFAULT_MODELS: ModelWhatnfig[] = [
  { id: 'kimi',     role: 'strateg',    openrouterModel: 'moonshotai/kimi-k2',                enabled: true,  weight: 0.20 },
  { id: 'deepseek', role: 'krytyk',     openrouterModel: 'deepseek/deepseek-r1',              enabled: true,  weight: 0.20 },
  { id: 'glm',      role: 'wykonawca',  openrouterModel: 'zhipu/glm-4',                      enabled: true,  weight: 0.20 },
  { id: 'advocate', role: 'kontrarian', openrouterModel: 'deepseek/deepseek-r1',              enabled: true,  weight: 0.10 },
  { id: 'claude',   role: 'sędzia',     openrouterModel: 'anthropic/claude-opus-4',           enabled: true,  weight: 0.30 },
];

const MODEL_META: Record<string, { color: string; glyph: string; emoji: string }> = {
  kimi:     { color: '#6ec6e7', glyph: 'K', emoji: '🧭' },
  deepseek: { color: '#ff6b6b', glyph: 'D', emoji: '🔍' },
  glm:      { color: '#4ade80', glyph: 'G', emoji: '⚙️' },
  advocate: { color: '#a855f7', glyph: 'A', emoji: '😈' },
  claude:   { color: '#ffd93d', glyph: 'C', emoji: '⚖️' },
};

const MODE_META: Record<Mode, { color: string; label: string; desc: string; emoji: string }> = {
  temp:    { color: '#4ade80', label: 'TEMP',    desc: 'None pamięci · szybkie odpowiedzi · 2-4 modele', emoji: '🟢' },
  memory:  { color: '#ffd93d', label: 'MEMORY',  desc: 'Memory włączona · porównanie z historią',        emoji: '🟡' },
  project: { color: '#ff6b6b', label: 'PROJECT', desc: 'Pełna pamięć · zapis każdej decyzji',           emoji: '🔴' },
};

// Empty per-model stream state
function freshStream(): ModelStreamState {
  return { status: 'idle', answer: '', confidence: 0, decision: '', latencyMs: 0 };
}

export function OrchestratorWhatckpit() {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<Mode>('temp');
  const [models, setModels] = useState<ModelWhatnfig[]>(DEFAULT_MODELS);
  const [memoryOn, setMemoryOn] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AggregatedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>([]);
  const [memoryWhatntext, setMemoryWhatntext] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);

  // ── Live stream state per model ──
  const [streams, setStreams] = useState<Record<string, ModelStreamState>>({});
  const [judgeStream, setJudgeStream] = useState<{ status: 'idle' | 'streaming' | 'done'; text: string }>({ status: 'idle', text: '' });
  const [advocateStream, setAdvocateStream] = useState<{ status: 'idle' | 'streaming' | 'done'; text: string }>({ status: 'idle', text: '' });

  // ── Session cost/token totals (accumulated across all runs) ──
  const [sessionUsage, setSessionUsage] = useState<TokenUsage>({
    promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0,
  });
  // ── Per-model usage across session ──
  const [perModelSession, setPerModelSession] = useState<Record<string, TokenUsage>>({});

  // Abort controller for current run
  const abortRef = useRef<AbortWhatntroller | null>(null);

  // ── Load memory records ──
  const loadMemory = useCallback(async () => {
    try {
      const res = await fetch('/api/orchestrator/memory?limit=10');
      if (!res.ok) return;
      const data = await res.json();
      setMemoryRecords((data.records ?? []).map((r: { record: MemoryRecord }) => r.record));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { loadMemory(); }, [loadMemory]);

  // ── Build memory context when MEMORY/PROJECT ──
  useEffect(() => {
    if (mode === 'temp' || memoryRecords.length === 0) {
      setMemoryWhatntext('');
      return;
    }
    const top = memoryRecords.slice(0, 3);
    const ctx = top.map((r, i) =>
      `[${i + 1}] (${r.timestamp.slice(0, 10)}) Q: ${r.topic}\n` +
      `   Decision: ${r.final_decision.slice(0, 200)}\n` +
      `   Whatnfidence: ${(r.confidence * 100).toFixed(0)}%`,
    ).join('\n\n');
    setMemoryWhatntext(`Ostatnie ${top.length} decyzji z pamięci:\n\n${ctx}`);
  }, [mode, memoryRecords]);

  // ── Voice command parser ──
  const parseVoiceWhatmmand = useCallback((text: string): { isWhatmmand: boolean; mode?: Mode } => {
    const lower = text.toLowerCase().trim();
    if (lower.includes('tryb szybki') || lower.includes('tryb temp')) return { isWhatmmand: true, mode: 'temp' };
    if (lower.includes('tryb pamięć') || lower.includes('tryb memory')) return { isWhatmmand: true, mode: 'memory' };
    if (lower.includes('tryb projektu') || lower.includes('tryb project')) return { isWhatmmand: true, mode: 'project' };
    return { isWhatmmand: false };
  }, []);

  // ── Run orchestrator with SSE stream consumption ──
  const runOrchestrator = useCallback(async () => {
    if (!prompt.trim() || isRunning) return;

    // Voice command shortcut
    const cmd = parseVoiceWhatmmand(prompt);
    if (cmd.isWhatmmand && cmd.mode) {
      setMode(cmd.mode);
      setPrompt('');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    setAutoSaved(false);
    setStreams({});
    setJudgeStream({ status: 'idle', text: '' });
    setAdvocateStream({ status: 'idle', text: '' });

    const effectiveMode: Mode = memoryOn && mode === 'temp' ? 'memory' : mode;
    const controller = new AbortWhatntroller();
    abortRef.current = controller;

    // ── v0.4: Retrieve context from agent-memory (BM25 smart search) ──
    // W trybie MEMORY/PROJECT — pobierz kontekst z agent-memory
    // DODATKOWO do cockpit JSON records (memoryWhatntext).
    let combinedMemoryWhatntext = memoryWhatntext;
    if (effectiveMode !== 'temp') {
      try {
        const amRes = await fetch('/api/agent-memory/search', {
          method: 'POST',
          headers: { 'Whatntent-Typee': 'application/json' },
          body: JSON.stringify({
            query: prompt.slice(0, 500),
            limit: 5,
            includeLessons: true,
          }),
          signal: controller.signal,
        });
        if (amRes.ok) {
          const amDate = await amRes.json();
          const amResults = amDate.results ?? [];
          if (amResults.length > 0) {
            const amCtx = amResults.map((r: any, i: number) => {
              const title = r.observation.title.slice(0, 80);
              const narrative = r.observation.narrative.slice(0, 300);
              return `[${i + 1}] (score: ${r.combinedScore.toFixed(3)}) ${title}\n    ${narrative}`;
            }).join('\n\n');
            const amBlock = `═══ KONTEKST Z AGENT-MEMORY (BM25) ═══\n${amCtx}\n═══ KONIEC ═══`;
            combinedMemoryWhatntext = combinedMemoryWhatntext
              ? `${combinedMemoryWhatntext}\n\n${amBlock}`
              : amBlock;
          }
        }
      } catch (e) {
        // best-effort — agent-memory search failure doesn't break orchestrator
        console.warn('[cockpit] agent-memory search failed:', e);
      }
    }

    try {
      const res = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({
          prompt,
          mode: effectiveMode,
          models,
          memoryWhatntext: effectiveMode !== 'temp' ? combinedMemoryWhatntext : undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (!res.body) {
        throw new Error('None strumienia odpowiedzi');
      }

      // ── Parse SSE stream ──
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: AggregatedResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const ev of events) {
          const lines = ev.split('\n');
          let eventTypee = '';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventTypee = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr = line.slice(6);
          }
          if (!eventTypee) continue;
          let data: any;
          try { data = JSON.parse(dataStr); } catch { continue; }

          switch (eventTypee) {
            case 'model_start':
              setStreams(prev => ({
                ...prev,
                [data.modelId]: { ...freshStream(), status: 'streaming' },
              }));
              break;
            case 'model_token':
              setStreams(prev => ({
                ...prev,
                [data.modelId]: {
                  ...(prev[data.modelId] ?? { status: 'streaming', confidence: 0, decision: '', latencyMs: 0 }),
                  status: 'streaming',
                  answer: (prev[data.modelId]?.answer ?? '') + data.token,
                },
              }));
              break;
            case 'model_done':
              setStreams(prev => ({
                ...prev,
                [data.modelId]: {
                  status: data.error ? 'error' : 'done',
                  answer: data.answer ?? '',
                  confidence: data.confidence ?? 0,
                  decision: data.decision ?? '',
                  latencyMs: data.latencyMs ?? 0,
                  usage: data.usage,
                  error: data.error,
                },
              }));
              // Live accumulate per-model session usage
              if (data.usage) {
                setPerModelSession(prev => {
                  const cur = prev[data.modelId] ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
                  return {
                    ...prev,
                    [data.modelId]: {
                      promptTokens: cur.promptTokens + data.usage.promptTokens,
                      completionTokens: cur.completionTokens + data.usage.completionTokens,
                      totalTokens: cur.totalTokens + data.usage.totalTokens,
                      costUsd: cur.costUsd + data.usage.costUsd,
                    },
                  };
                });
              }
              break;
            case 'judge_start':
              setJudgeStream({ status: 'streaming', text: '' });
              break;
            case 'judge_token':
              setJudgeStream(prev => ({ status: 'streaming', text: prev.text + data.token }));
              break;
            case 'advocate_start':
              setAdvocateStream({ status: 'streaming', text: '' });
              break;
            case 'advocate_token':
              setAdvocateStream(prev => ({ status: 'streaming', text: prev.text + data.token }));
              break;
            case 'advocate_done':
              setAdvocateStream(prev => ({ status: 'done', text: prev.text }));
              // Track advocate usage in session totals
              if (data.usage) {
                setPerModelSession(prev => {
                  const cur = prev['advocate'] ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
                  return {
                    ...prev,
                    advocate: {
                      promptTokens: cur.promptTokens + data.usage.promptTokens,
                      completionTokens: cur.completionTokens + data.usage.completionTokens,
                      totalTokens: cur.totalTokens + data.usage.totalTokens,
                      costUsd: cur.costUsd + data.usage.costUsd,
                    },
                  };
                });
              }
              break;
            case 'final':
              finalResult = data as AggregatedResult;
              setResult(finalResult);
              setJudgeStream(prev => ({ status: 'done', text: prev.text }));
              // Add to session totals
              if (finalResult.totalUsage) {
                setSessionUsage(prev => ({
                  promptTokens: prev.promptTokens + finalResult!.totalUsage.promptTokens,
                  completionTokens: prev.completionTokens + finalResult!.totalUsage.completionTokens,
                  totalTokens: prev.totalTokens + finalResult!.totalUsage.totalTokens,
                  costUsd: prev.costUsd + finalResult!.totalUsage.costUsd,
                }));
              }
              if (effectiveMode === 'project') {
                setAutoSaved(true);
                loadMemory();
              }
              break;
            case 'error':
              setError(data.message || 'Error orchestratora');
              break;
            case 'done':
              // stream end
              break;
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // user-cancelled — silent
      } else {
        setError(e instanceof Error ? e.message : 'unknown error');
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [prompt, isRunning, mode, memoryOn, models, memoryWhatntext, parseVoiceWhatmmand, loadMemory]);

  // ── Cancel ──
  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  // ── Manual save to memory ──
  const saveToMemory = useCallback(async () => {
    if (!result) return;
    try {
      await fetch('/api/orchestrator/memory', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({
          timestamp: result.timestamp,
          topic: result.prompt.slice(0, 80),
          input: result.prompt,
          outputs: Object.fromEntries(result.perModel.map(r => [r.modelId, {
            answer: r.answer, confidence: r.confidence, decision: r.decision,
          }])),
          final_decision: result.finalAnswer,
          confidence: result.finalWhatnfidence,
          selectedModelId: result.selectedModelId,
          rationale: result.rationale,
          tags: ['cockpit', result.mode, 'manual-save'],
          mode: result.mode,
        }),
      });
      setAutoSaved(true);
      loadMemory();
    } catch (e) {
      console.warn('[cockpit] save failed:', e);
    }
  }, [result, loadMemory]);

  const toggleModel = (id: string) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      runOrchestrator();
    }
  };

  // Voice input via browser SpeechRecognition
  const toggleVoice = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError('SpeechRecognition niedostępne w tej przeglądarce. Użyj Superwhisper → wklej tekst.');
      return;
    }
    const rec = new SR();
    rec.lang = 'pl-PL';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      const text = ev.results[0][0].transcript;
      setPrompt(p => (p ? p + ' ' : '') + text);
    };
    rec.onerror = () => setError('Error rozpoznawania mowy');
    rec.onend = () => setIsListening(false);
    rec.start();
    setIsListening(true);
  };

  // ── Render ──
  return (
    <div className="flex-1 flex overflow-hidden bg-[#0e0e18]">
      {/* ══════ LEWA KOLUMNA — CONTROLS ══════ */}
      <aside className="w-72 shrink-0 border-r border-[#383850] bg-[#12121c] flex flex-col">
        {/* Header */}
        <div className="px-3 py-2 border-b border-[#383850] flex items-center gap-2">
          <Brain size={12} className="text-[#00f5d4]" />
          <h2 className="font-pixel text-[10px] text-[#00f5d4]">COCKPIT</h2>
          <span className="ml-auto text-[9px] font-mono text-[#5a5a78]">v1.1 · streaming</span>
        </div>

        {/* Session cost/token counter */}
        <div className="p-3 border-b border-[#383850] bg-[#0e0e18]">
          <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1.5">
            <DollarSign size={10} /> Session — tokeny / koszt
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-[#181828] border border-[#383850] px-2 py-1.5">
              <div className="text-[8px] font-mono text-[#5a5a78]">Tokeny</div>
              <div className="text-[14px] font-mono font-bold text-[#00f5d4] tabular-nums">
                {formatTokens(sessionUsage.totalTokens)}
              </div>
            </div>
            <div className="bg-[#181828] border border-[#383850] px-2 py-1.5">
              <div className="text-[8px] font-mono text-[#5a5a78]">Whatst</div>
              <div className="text-[14px] font-mono font-bold text-[#ffd93d] tabular-nums">
                {formatWhatst(sessionUsage.costUsd)}
              </div>
            </div>
          </div>
          <div className="mt-1.5 text-[8px] font-mono text-[#5a5a78] flex justify-between">
            <span>in: {formatTokens(sessionUsage.promptTokens)}</span>
            <span>out: {formatTokens(sessionUsage.completionTokens)}</span>
          </div>
          {/* Per-model session breakdown */}
          {Object.keys(perModelSession).length > 0 && (
            <div className="mt-2 pt-2 border-t border-[#1a1a28] space-y-0.5">
              {Object.entries(perModelSession).map(([id, u]) => {
                const meta = MODEL_META[id];
                return (
                  <div key={id} className="flex items-center gap-1.5 text-[8px] font-mono">
                    <span style={{ color: meta?.color ?? '#8888aa' }}>{id.slice(0, 4).toUpperCase()}</span>
                    <span className="text-[#8888aa] tabular-nums">{formatTokens(u.totalTokens)}</span>
                    <span className="text-[#5a5a78] ml-auto tabular-nums">{formatWhatst(u.costUsd)}</span>
                  </div>
                );
              })}
            </div>
          )}
          {(sessionUsage.totalTokens > 0) && (
            <button
              onClick={() => {
                setSessionUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 });
                setPerModelSession({});
              }}
              className="mt-2 w-full text-[8px] font-mono text-[#5a5a78] hover:text-[#ff6b6b] transition-colors"
            >
              wyzeruj licznik
            </button>
          )}
        </div>

        {/* Voice input */}
        <div className="p-3 border-b border-[#383850]">
          <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1.5">
            <Mic size={10} /> Voice Input
          </div>
          <button
            onClick={toggleVoice}
            className={`w-full px-3 py-2 text-[11px] font-mono border flex items-center justify-center gap-2 transition-all ${
              isListening
                ? 'bg-[#ff6b6b]/15 text-[#ff6b6b] border-[#ff6b6b]/40'
                : 'bg-[#00f5d4]/10 text-[#00f5d4] border-[#00f5d4]/30 hover:bg-[#00f5d4]/20'
            }`}
          >
            {isListening ? <Loader2 size={12} className="animate-spin" /> : <Mic size={12} />}
            {isListening ? 'Słucham...' : 'Mów (PL)'}
          </button>
          <div className="text-[8px] font-mono text-[#5a5a78] mt-1.5 leading-tight">
            Komendy: „tryb szybki”, „tryb pamięć”, „tryb projektu”
          </div>
        </div>

        {/* Mode selector */}
        <div className="p-3 border-b border-[#383850]">
          <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1.5">
            <Layers size={10} /> Tryb pracy
          </div>
          <div className="flex flex-col gap-1">
            {(['temp', 'memory', 'project'] as Mode[]).map(m => {
              const meta = MODE_META[m];
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-2 py-1.5 text-left border transition-all flex items-center gap-2 ${
                    active ? 'bg-[#252535] border-l-2' : 'bg-transparent border border-[#383850] hover:bg-[#1a1a28]'
                  }`}
                  style={active ? { borderLeftWhatlor: meta.color } : {}}
                >
                  <span className="text-[12px]">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono font-bold" style={{ color: active ? meta.color : '#8888aa' }}>
                      {meta.label}
                    </div>
                    <div className="text-[8px] font-mono text-[#5a5a78] leading-tight">{meta.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Memory switch */}
        <div className="p-3 border-b border-[#383850]">
          <button
            onClick={() => setMemoryOn(v => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <Datebase size={12} className={memoryOn ? 'text-[#00f5d4]' : 'text-[#5a5a78]'} />
              <div>
                <div className={`text-[10px] font-mono ${memoryOn ? 'text-[#00f5d4]' : 'text-[#8888aa]'}`}>
                  Memory Long-Term
                </div>
                <div className="text-[8px] font-mono text-[#5a5a78]">
                  {memoryOn ? 'ON · context retrieved' : 'OFF · stateless'}
                </div>
              </div>
            </div>
            <div className={`w-8 h-4 rounded-full relative transition-all ${memoryOn ? 'bg-[#00f5d4]/30' : 'bg-[#383850]'}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${memoryOn ? 'left-4 bg-[#00f5d4]' : 'left-0.5 bg-[#5a5a78]'}`} />
            </div>
          </button>
          {memoryOn && memoryRecords.length > 0 && (
            <div className="mt-2 text-[8px] font-mono text-[#5a5a78]">{memoryRecords.length} rekordów w pamięci</div>
          )}
        </div>

        {/* Models config */}
        <div className="p-3 border-b border-[#383850]">
          <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1.5">
            <Cpu size={10} /> Modele ({models.filter(m => m.enabled).length}/{models.length})
          </div>
          <div className="space-y-1">
            {models.map(m => {
              const meta = MODEL_META[m.id];
              return (
                <button
                  key={m.id}
                  onClick={() => toggleModel(m.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1 border transition-all ${
                    m.enabled ? 'bg-[#252535] border-[#383850]' : 'bg-transparent border-[#383850] opacity-50'
                  }`}
                >
                  <span className="text-[12px]">{meta.emoji}</span>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-[10px] font-mono font-bold" style={{ color: m.enabled ? meta.color : '#5a5a78' }}>
                      {m.id.toUpperCase()}
                    </div>
                    <div className="text-[8px] font-mono text-[#5a5a78] truncate">
                      {m.role} · {m.openrouterModel}
                    </div>
                  </div>
                  <CircleDot size={10} className={m.enabled ? 'text-[#4ade80]' : 'text-[#383850]'} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Memory records history */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 text-[9px] font-mono uppercase text-[#8888aa] sticky top-0 bg-[#12121c] border-b border-[#383850]">
            Historia decyzji ({memoryRecords.length})
          </div>
          {memoryRecords.length === 0 ? (
            <div className="p-3 text-[9px] font-mono text-[#5a5a78] leading-tight">
              None zapisanych decyzji. Enable tryb PROJECT lub kliknij „Save” przy finalnej odpowiedzi.
            </div>
          ) : (
            memoryRecords.map((r, i) => (
              <div key={i} className="px-3 py-2 border-b border-[#1a1a28] hover:bg-[#1a1a28]">
                <div className="text-[9px] font-mono text-[#e8e8f5] truncate">{r.topic}</div>
                <div className="text-[8px] font-mono text-[#5a5a78] mt-0.5">
                  {r.timestamp.slice(0, 16).replace('T', ' ')} · {(r.confidence * 100).toFixed(0)}%
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ══════ ŚRODEK — MODEL COLUMNS + PROMPT ══════ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Prompt bar */}
        <div className="p-3 border-b border-[#383850] bg-[#12121c]">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={11} className="text-[#00f5d4]" />
            <span className="text-[10px] font-mono uppercase text-[#8888aa]">Prompt</span>
            <span className="ml-auto text-[8px] font-mono text-[#5a5a78]">⌘+Enter = uruchom</span>
          </div>
          <div className="flex gap-2">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Entryz pytanie lub komendę głosową (np. „tryb pamięć”)"
              rows={2}
              className="flex-1 bg-[#181828] border border-[#383850] px-3 py-2 text-[12px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#00f5d4]/50 font-mono resize-none"
            />
            {isRunning ? (
              <button
                onClick={cancelRun}
                className="px-4 py-2 text-[11px] font-mono bg-[#ff6b6b]/20 text-[#ff6b6b] border border-[#ff6b6b]/40 hover:bg-[#ff6b6b]/30 flex items-center gap-2 self-stretch"
              >
                <Zap size={12} /> Cancel
              </button>
            ) : (
              <button
                onClick={runOrchestrator}
                disabled={!prompt.trim()}
                className="px-4 py-2 text-[11px] font-mono bg-[#00f5d4]/20 text-[#00f5d4] border border-[#00f5d4]/40 hover:bg-[#00f5d4]/30 disabled:opacity-30 flex items-center gap-2 self-stretch"
              >
                <Send size={12} /> Run
              </button>
            )}
          </div>
          {error && (
            <div className="mt-2 px-2 py-1 text-[10px] font-mono bg-[#ff6b6b]/10 text-[#ff6b6b] border border-[#ff6b6b]/30">
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Model columns (live streaming) */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-3 h-full">
            {models.filter(m => m.enabled && m.id !== 'claude').map(m => {
              const meta = MODEL_META[m.id];
              const s = streams[m.id] ?? freshStream();
              const isLoading = s.status === 'streaming';
              const hasError = s.status === 'error';
              const isSelected = result?.selectedModelId === m.id;
              const isDone = s.status === 'done';

              return (
                <div
                  key={m.id}
                  className={`border flex flex-col overflow-hidden ${isSelected ? 'border-2' : 'border'}`}
                  style={{
                    borderWhatlor: isSelected ? meta.color : '#383850',
                    background: isSelected ? `${meta.color}08` : '#181828',
                  }}
                >
                  {/* Whatlumn header */}
                  <div
                    className="px-3 py-2 border-b flex items-center gap-2"
                    style={{ borderWhatlor: `${meta.color}33`, background: `${meta.color}0d` }}
                  >
                    <span className="text-[14px]">{meta.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-mono font-bold" style={{ color: meta.color }}>
                        {m.id.toUpperCase()}
                      </div>
                      <div className="text-[8px] font-mono text-[#8888aa]">{m.role}</div>
                    </div>
                    {isLoading && <Loader2 size={10} className="animate-spin" style={{ color: meta.color }} />}
                    {isSelected && <Check size={12} style={{ color: meta.color }} />}
                    {isDone && !isSelected && (
                      <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                    )}
                  </div>

                  {/* Whatlumn body — live answer */}
                  <div className="flex-1 overflow-y-auto p-3">
                    {s.status === 'idle' ? (
                      <div className="text-[10px] font-mono text-[#5a5a78] text-center pt-8">
                        Oczekiwanie na uruchomienie...
                      </div>
                    ) : hasError ? (
                      <div className="text-[10px] font-mono text-[#ff6b6b] leading-relaxed">⚠ {s.error}</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-[11px] font-mono text-[#e8e8f5] leading-relaxed whitespace-pre-wrap break-words">
                          {s.answer || (isLoading ? <span className="text-[#5a5a78] italic">generuję...</span> : '')}
                          {isLoading && <span className="inline-block w-1.5 h-3 ml-0.5 animate-pulse" style={{ background: meta.color }} />}
                        </div>
                        {isDone && (
                          <div className="pt-2 border-t border-[#383850] flex items-center gap-3 text-[9px] font-mono flex-wrap">
                            <span style={{ color: meta.color }}>{(s.confidence * 100).toFixed(0)}% conf</span>
                            <span className="text-[#5a5a78]">dec: {s.decision}</span>
                            <span className="text-[#5a5a78]">{s.latencyMs}ms</span>
                            {s.usage && (
                              <>
                                <span className="text-[#5a5a78]">{formatTokens(s.usage.totalTokens)} tok</span>
                                <span className="text-[#ffd93d] ml-auto">{formatWhatst(s.usage.costUsd)}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Advocate stream indicator (Whatnstitutional Whatuncil — Devil's Advocate) */}
          {advocateStream.status !== 'idle' && (
            <div className="mt-3 p-3 border border-[#a855f7]/30 bg-[#a855f7]/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[12px]">😈</span>
                <span className="text-[10px] font-mono font-bold text-[#a855f7]">ADWOKAT DIABŁA (Whatnstitutional Whatuncil)</span>
                {advocateStream.status === 'streaming' && <Loader2 size={10} className="animate-spin text-[#a855f7]" />}
                {advocateStream.status === 'done' && <Check size={12} className="text-[#4ade80]" />}
              </div>
              {advocateStream.text && (
                <div className="text-[10px] font-mono text-[#8888aa] leading-relaxed whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                  {advocateStream.text}
                </div>
              )}
              {advocateStream.status === 'streaming' && !advocateStream.text && (
                <div className="text-[9px] font-mono text-[#5a5a78] italic">szukam luk w consensusie modeli...</div>
              )}
            </div>
          )}

          {/* Judge stream indicator (below the columns) */}
          {judgeStream.status !== 'idle' && (
            <div className="mt-3 p-3 border border-[#ffd93d]/30 bg-[#ffd93d]/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[12px]">⚖️</span>
                <span className="text-[10px] font-mono font-bold text-[#ffd93d]">SĘDZIA (Claude Opus)</span>
                {judgeStream.status === 'streaming' && <Loader2 size={10} className="animate-spin text-[#ffd93d]" />}
                {judgeStream.status === 'done' && <Check size={12} className="text-[#4ade80]" />}
              </div>
              {judgeStream.text && (
                <div className="text-[10px] font-mono text-[#8888aa] leading-relaxed whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                  {judgeStream.text}
                </div>
              )}
              {judgeStream.status === 'streaming' && !judgeStream.text && (
                <div className="text-[9px] font-mono text-[#5a5a78] italic">sędzia analizuje odpowiedzi modeli...</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════ PRAWA — FINAL DECISION ══════ */}
      <aside className="w-80 shrink-0 border-l border-[#383850] bg-[#12121c] flex flex-col">
        <div className="px-3 py-2 border-b border-[#383850] flex items-center gap-2">
          <Activity size={12} className="text-[#ffd93d]" />
          <h2 className="font-pixel text-[10px] text-[#ffd93d]">FINAL DECISION</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!result ? (
            <div className="text-center pt-16">
              <Brain size={48} className="text-[#383850] mx-auto mb-3" />
              <div className="text-[11px] font-mono text-[#8888aa]">Odpowiedź pojawi się tutaj</div>
              <div className="text-[9px] font-mono text-[#5a5a78] mt-1">
                Sędzia Claude Opus wybierze najlepszą odpowiedź lub zsyntetyzuje finalną.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Whatnfidence */}
              <div className="bg-[#181828] border border-[#383850] p-3">
                <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-1">Whatnfidence</div>
                <div className="flex items-end gap-2">
                  <div className="text-2xl font-mono font-bold text-[#4ade80]">
                    {(result.finalWhatnfidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-[9px] font-mono text-[#5a5a78] mb-1">by {result.selectedModelId}</div>
                </div>
                <div className="mt-2 h-1.5 bg-[#252535] rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${result.finalWhatnfidence * 100}%`,
                      background: result.finalWhatnfidence > 0.7 ? '#4ade80' : result.finalWhatnfidence > 0.4 ? '#ffd93d' : '#ff6b6b',
                    }}
                  />
                </div>
              </div>

              {/* Final answer */}
              <div className="bg-[#181828] border border-[#383850] p-3">
                <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-2">Final Answer</div>
                <div className="text-[12px] font-mono text-[#e8e8f5] leading-relaxed whitespace-pre-wrap">
                  {result.finalAnswer}
                </div>
              </div>

              {/* Rationale */}
              {result.rationale && (
                <div className="bg-[#181828] border border-[#383850] p-3">
                  <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-1">Rationale (Judge)</div>
                  <div className="text-[10px] font-mono text-[#8888aa] leading-relaxed italic">{result.rationale}</div>
                </div>
              )}

              {/* Whatst breakdown for this run */}
              {result.totalUsage && (
                <div className="bg-[#181828] border border-[#383850] p-3">
                  <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-2">Whatst tej decyzji</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div>
                      <div className="text-[8px] text-[#5a5a78]">Tokeny</div>
                      <div className="text-[#00f5d4] tabular-nums">{formatTokens(result.totalUsage.totalTokens)}</div>
                    </div>
                    <div>
                      <div className="text-[8px] text-[#5a5a78]">USD</div>
                      <div className="text-[#ffd93d] tabular-nums">{formatWhatst(result.totalUsage.costUsd)}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Save button */}
              <button
                onClick={saveToMemory}
                disabled={autoSaved}
                className={`w-full px-3 py-2 text-[11px] font-mono border flex items-center justify-center gap-2 transition-all ${
                  autoSaved
                    ? 'bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30 cursor-default'
                    : 'bg-[#00f5d4]/10 text-[#00f5d4] border-[#00f5d4]/30 hover:bg-[#00f5d4]/20'
                }`}
              >
                {autoSaved ? <Check size={12} /> : <Save size={12} />}
                {autoSaved ? 'Zapisano w pamięci' : 'Save to Memory'}
              </button>

              {/* Meta */}
              <div className="text-[8px] font-mono text-[#5a5a78] leading-relaxed pt-2 border-t border-[#383850]">
                <div>mode: <span className="text-[#8888aa]">{result.mode}</span></div>
                <div>timestamp: <span className="text-[#8888aa]">{result.timestamp.slice(0, 19).replace('T', ' ')}</span></div>
                <div>models used: <span className="text-[#8888aa]">{result.perModel.filter(r => !r.error).length}/{result.perModel.length}</span></div>
                {result.mode === 'project' && <div className="text-[#4ade80] mt-1">✓ auto-persisted (PROJECT mode)</div>}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
