'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Search, Plus, Trash2, RefreshCw, Loader2,
  Database, Zap, Clock, Activity, Sparkles, ChevronDown, ChevronRight,
  Check, AlertTriangle, Filter, Tag,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// BOKA — Agent Memory Tab
// UI w stylu dark-cyber BOKA. 3 sekcje:
//   1. Stats (góra)
//   2. Smart Search (środek)
//   3. Memories list + Remember form + Auto-forget (dół)
// ═══════════════════════════════════════════════════════════

interface Memory {
  id: string;
  type: string;
  title: string;
  content: string;
  concepts: string[];
  tags: string[];
  strength: number;
  version: number;
  isLatest: boolean;
  project?: string;
  forgetAfter?: string;
  lastAccessedAt?: string;
  accessCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface SearchResult {
  observation: {
    id: string;
    type: string;
    title: string;
    narrative: string;
    concepts: string[];
    timestamp: string;
  };
  combinedScore: number;
  bm25Score: number;
}

interface Stats {
  sessions: number;
  observations: number;
  memories: number;
  latestMemories: number;
  auditEntries: number;
  indexSize: number;
}

interface AutoForgetResult {
  ttlExpired: string[];
  contradictions: Array<{ memoryA: string; memoryB: string; similarity: number }>;
  lowValueObs: string[];
  dryRun: boolean;
}

const TYPE_META: Record<string, { color: string; emoji: string; label: string }> = {
  pattern:      { color: '#6ec6e7', emoji: '🔁', label: 'Pattern' },
  preference:   { color: '#a855f7', emoji: '💜', label: 'Preference' },
  architecture: { color: '#00f5d4', emoji: '🏛️', label: 'Architecture' },
  bug:          { color: '#ff6b6b', emoji: '🐛', label: 'Bug' },
  workflow:     { color: '#4ade80', emoji: '⚙️', label: 'Workflow' },
  fact:         { color: '#ffd93d', emoji: '📌', label: 'Fact' },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function strengthColor(s: number): string {
  if (s > 7) return '#4ade80';
  if (s > 4) return '#ffd93d';
  if (s > 1) return '#ff6b6b';
  return '#5a5a78';
}

export function AgentMemoryTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchMeta, setSearchMeta] = useState<{ latencyMs: number; totalFound: number; expansion?: { reformulations: string[]; entities: string[] } } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Remember form
  const [newMemory, setNewMemory] = useState({
    content: '',
    type: 'fact' as string,
    concepts: '',
    tags: '',
    project: 'boka',
    ttlDays: '',
    visibility: 'family' as string,
  });

  // ── Load data ──
  const loadAll = useCallback(async () => {
    setBusy('load');
    setError(null);
    try {
      const [statsRes, memRes] = await Promise.all([
        fetch('/api/agent-memory/stats').then(r => r.json()),
        fetch('/api/agent-memory?limit=50').then(r => r.json()),
      ]);
      if (statsRes && !statsRes.error) setStats(statsRes);
      if (memRes && !memRes.error) setMemories(memRes.memories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Search ──
  const runSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setBusy('search');
    setError(null);
    try {
      const res = await fetch('/api/agent-memory/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          limit: 20,
          includeLessons: true,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSearchResults(data.results ?? []);
      setSearchMeta({
        latencyMs: data.latencyMs,
        totalFound: data.totalFound,
        expansion: data.expansion,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'search failed');
      setSearchResults([]);
    } finally {
      setBusy(null);
    }
  }, [searchQuery]);

  // ── Remember ──
  const submitMemory = useCallback(async () => {
    if (!newMemory.content.trim()) return;
    setBusy('remember');
    setError(null);
    try {
      const res = await fetch('/api/agent-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newMemory.content,
          type: newMemory.type,
          concepts: newMemory.concepts.split(',').map(s => s.trim()).filter(Boolean),
          tags: newMemory.tags.split(',').map(s => s.trim()).filter(Boolean),
          project: newMemory.project || undefined,
          ttlDays: newMemory.ttlDays ? parseInt(newMemory.ttlDays, 10) : undefined,
          visibility: newMemory.visibility,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNewMemory({ content: '', type: 'fact', concepts: '', tags: '', project: 'boka', ttlDays: '', visibility: 'family' });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'remember failed');
    } finally {
      setBusy(null);
    }
  }, [newMemory, loadAll]);

  // ── Delete memory ──
  const deleteMemory = useCallback(async (id: string) => {
    if (!confirm('Na pewno usunąć to memory?')) return;
    setBusy(`del-${id}`);
    try {
      await fetch(`/api/agent-memory?id=${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setBusy(null);
    }
  }, [loadAll]);

  // ── Auto-forget ──
  const runAutoForget = useCallback(async (dryRun: boolean) => {
    setBusy(dryRun ? 'forget-dry' : 'forget');
    setError(null);
    try {
      const res = await fetch('/api/agent-memory/forget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const forgetResult: AutoForgetResult = data;
      alert(
        `Auto-forget ${forgetResult.dryRun ? '(DRY RUN)' : '(EXECUTED)'}:\n` +
        `• TTL expired: ${forgetResult.ttlExpired.length}\n` +
        `• Contradictions (Jaccard > 0.9): ${forgetResult.contradictions.length}\n` +
        `• Low-value obs (importance < 0.2, > 7d): ${forgetResult.lowValueObs.length}`,
      );
      if (!dryRun) await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'forget failed');
    } finally {
      setBusy(null);
    }
  }, [loadAll]);

  // ── Consolidate (decay + optional LLM extraction) ──
  const runConsolidate = useCallback(async (withLLM: boolean) => {
    setBusy(withLLM ? 'consolidate-llm' : 'consolidate');
    setError(null);
    try {
      const res = await fetch('/api/agent-memory/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decayDays: 30, withLLM, batchSize: 10 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      alert(
        `Consolidation ${withLLM ? '(with LLM extraction)' : '(decay only)'}:\n` +
        `• Decay applied to: ${data.decayedMemories} memories\n` +
        `• Memories created: ${data.memoriesCreated}\n` +
        `• Memories superseded: ${data.memoriesSuperseded}\n` +
        `• Observations consumed: ${data.observationsConsumed}`,
      );
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'consolidate failed');
    } finally {
      setBusy(null);
    }
  }, [loadAll]);

  // ── v4: Predictive Pre-computation ──
  const runPrecompute = useCallback(async () => {
    setBusy('precompute');
    setError(null);
    try {
      const res = await fetch('/api/predictive/precompute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topK: 3 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const predictions = data.predictions ?? [];
      const precomputed = data.precomputed ?? 0;
      alert(
        `🔮 Predictive Pre-computation:\n` +
        `• Predictions: ${predictions.length}\n` +
        `• Pre-computed answers: ${precomputed}\n\n` +
        predictions.map((p: any, i: number) =>
          `[${i + 1}] (${(p.confidence * 100).toFixed(0)}%) ${p.question}`,
        ).join('\n'),
      );
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'precompute failed');
    } finally {
      setBusy(null);
    }
  }, [loadAll]);

  // ── v5: Cognitive Reflection Loop ──
  const runReflection = useCallback(async () => {
    setBusy('reflect');
    setError(null);
    try {
      const res = await fetch('/api/agent-memory/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 10 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      alert(
        `🧠 Cognitive Reflection:\n` +
        `• Low-confidence decisions analyzed: ${data.lowConfidenceCount}\n` +
        `• Lessons extracted: ${data.lessonsExtracted}\n\n` +
        (data.lessons ?? []).map((l: any, i: number) =>
          `[${i + 1}] (${l.type}) ${l.title}`,
        ).join('\n'),
      );
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reflection failed');
    } finally {
      setBusy(null);
    }
  }, [loadAll]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#0e0e18]">
      {/* ══════ LEWA — Stats + Actions ══════ */}
      <aside className="w-72 shrink-0 border-r border-[#383850] bg-[#12121c] flex flex-col">
        <div className="px-3 py-2 border-b border-[#383850] flex items-center gap-2">
          <Brain size={12} className="text-[#00f5d4]" />
          <h2 className="font-pixel text-[10px] text-[#00f5d4]">AGENT MEMORY</h2>
          <span className="ml-auto text-[9px] font-mono text-[#5a5a78]">v1.0</span>
        </div>

        {/* Stats */}
        <div className="p-3 border-b border-[#383850] bg-[#0e0e18]">
          <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1.5">
            <Activity size={10} /> Stats
          </div>
          {stats ? (
            <div className="grid grid-cols-2 gap-1.5">
              <StatCard label="Sesje" value={stats.sessions} color="#6ec6e7" />
              <StatCard label="Obserwacje" value={stats.observations} color="#a855f7" />
              <StatCard label="Memories" value={stats.memories} color="#00f5d4" />
              <StatCard label="Latest" value={stats.latestMemories} color="#4ade80" />
              <StatCard label="Audit" value={stats.auditEntries} color="#ffd93d" />
              <StatCard label="Index" value={stats.indexSize} color="#ff6b6b" />
            </div>
          ) : (
            <div className="text-[10px] font-mono text-[#5a5a78] text-center py-4">
              <Loader2 size={12} className="animate-spin inline mr-1" />
              Ładowanie...
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-3 border-b border-[#383850]">
          <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1.5">
            <Zap size={10} /> Akcje
          </div>
          <div className="space-y-1">
            <button
              onClick={() => runAutoForget(true)}
              disabled={!!busy}
              className="w-full px-2 py-1.5 text-[10px] font-mono bg-[#ffd93d]/10 text-[#ffd93d] border border-[#ffd93d]/30 hover:bg-[#ffd93d]/20 disabled:opacity-30 flex items-center gap-2"
            >
              {busy === 'forget-dry' ? <Loader2 size={11} className="animate-spin" /> : <Filter size={11} />}
              Auto-forget (DRY RUN)
            </button>
            <button
              onClick={() => runAutoForget(false)}
              disabled={!!busy}
              className="w-full px-2 py-1.5 text-[10px] font-mono bg-[#ff6b6b]/10 text-[#ff6b6b] border border-[#ff6b6b]/30 hover:bg-[#ff6b6b]/20 disabled:opacity-30 flex items-center gap-2"
            >
              {busy === 'forget' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              Auto-forget (EXECUTE)
            </button>
            <button
              onClick={() => runConsolidate(false)}
              disabled={!!busy}
              className="w-full px-2 py-1.5 text-[10px] font-mono bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/30 hover:bg-[#4ade80]/20 disabled:opacity-30 flex items-center gap-2"
            >
              {busy === 'consolidate' ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Consolidate (decay only)
            </button>
            <button
              onClick={() => runConsolidate(true)}
              disabled={!!busy}
              className="w-full px-2 py-1.5 text-[10px] font-mono bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/30 hover:bg-[#a855f7]/20 disabled:opacity-30 flex items-center gap-2"
            >
              {busy === 'consolidate-llm' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              Consolidate + LLM extract
            </button>
            <button
              onClick={runPrecompute}
              disabled={!!busy}
              className="w-full px-2 py-1.5 text-[10px] font-mono bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/30 hover:bg-[#00f5d4]/20 disabled:opacity-30 flex items-center gap-2"
            >
              {busy === 'precompute' ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
              🔮 Predictive Pre-compute
            </button>
            <button
              onClick={runReflection}
              disabled={!!busy}
              className="w-full px-2 py-1.5 text-[10px] font-mono bg-[#ff6b6b]/10 text-[#ff6b6b] border border-[#ff6b6b]/30 hover:bg-[#ff6b6b]/20 disabled:opacity-30 flex items-center gap-2"
            >
              {busy === 'reflect' ? <Loader2 size={11} className="animate-spin" /> : <Brain size={11} />}
              🧠 Reflect on Mistakes
            </button>
            <button
              onClick={loadAll}
              disabled={!!busy}
              className="w-full px-2 py-1.5 text-[10px] font-mono bg-[#252535] text-[#8888aa] border border-[#383850] hover:text-[#e8e8f5] disabled:opacity-30 flex items-center gap-2"
            >
              <RefreshCw size={11} /> Odśwież
            </button>
          </div>
        </div>

        {/* Architecture diagram link */}
        <div className="p-3 border-b border-[#383850]">
          <div className="text-[9px] font-mono text-[#5a5a78] leading-relaxed">
            <div className="text-[#8888aa] font-bold mb-1">Architektura</div>
            <div>• BM25 (Porter stemmer PL+EN)</div>
            <div>• Synonyms (40+ grup)</div>
            <div>• RRF fusion</div>
            <div>• Jaccard dedup &gt; 0.7</div>
            <div>• TTL auto-forget</div>
            <div>• Decay 0.9^(d/30)</div>
          </div>
        </div>

        {/* Remember form */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1.5">
            <Plus size={10} /> Nowe memory
          </div>
          <div className="space-y-1.5">
            <textarea
              value={newMemory.content}
              onChange={e => setNewMemory(p => ({ ...p, content: e.target.value }))}
              placeholder="Treść lekcji..."
              rows={3}
              className="w-full bg-[#181828] border border-[#383850] px-2 py-1 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#00f5d4]/50 font-mono resize-none"
            />
            <select
              value={newMemory.type}
              onChange={e => setNewMemory(p => ({ ...p, type: e.target.value }))}
              className="w-full bg-[#181828] border border-[#383850] px-2 py-1 text-[11px] text-[#e8e8f5] font-mono"
            >
              {Object.entries(TYPE_META).map(([k, v]) => (
                <option key={k} value={k}>{v.emoji} {v.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={newMemory.concepts}
              onChange={e => setNewMemory(p => ({ ...p, concepts: e.target.value }))}
              placeholder="Concepts (comma-sep)"
              className="w-full bg-[#181828] border border-[#383850] px-2 py-1 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#00f5d4]/50 font-mono"
            />
            <input
              type="text"
              value={newMemory.tags}
              onChange={e => setNewMemory(p => ({ ...p, tags: e.target.value }))}
              placeholder="Tags (comma-sep)"
              className="w-full bg-[#181828] border border-[#383850] px-2 py-1 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#00f5d4]/50 font-mono"
            />
            <div className="flex gap-1">
              <input
                type="text"
                value={newMemory.project}
                onChange={e => setNewMemory(p => ({ ...p, project: e.target.value }))}
                placeholder="project"
                className="flex-1 bg-[#181828] border border-[#383850] px-2 py-1 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#00f5d4]/50 font-mono"
              />
              <input
                type="text"
                value={newMemory.ttlDays}
                onChange={e => setNewMemory(p => ({ ...p, ttlDays: e.target.value }))}
                placeholder="TTL d"
                className="w-16 bg-[#181828] border border-[#383850] px-2 py-1 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#00f5d4]/50 font-mono"
              />
            </div>
            <select
              value={newMemory.visibility}
              onChange={e => setNewMemory(p => ({ ...p, visibility: e.target.value }))}
              className="w-full bg-[#181828] border border-[#383850] px-2 py-1 text-[11px] text-[#e8e8f5] font-mono"
              title="Persona Memory Forks — kto widzi to memory"
            >
              <option value="family">👁️ family — wszyscy</option>
              <option value="child-safe">🧒 child-safe — bezpieczne dla dzieci</option>
              <option value="adult-only">🔞 adult-only — tylko dorośli</option>
              <option value="private">🔒 private — tylko twórca</option>
            </select>
            <button
              onClick={submitMemory}
              disabled={!newMemory.content.trim() || !!busy}
              className="w-full px-2 py-1.5 text-[10px] font-mono bg-[#00f5d4]/20 text-[#00f5d4] border border-[#00f5d4]/40 hover:bg-[#00f5d4]/30 disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {busy === 'remember' ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Remember
            </button>
          </div>
        </div>
      </aside>

      {/* ══════ ŚRODEK — Search + Results ══════ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search bar */}
        <div className="p-3 border-b border-[#383850] bg-[#12121c]">
          <div className="flex items-center gap-2 mb-2">
            <Search size={11} className="text-[#00f5d4]" />
            <span className="text-[10px] font-mono uppercase text-[#8888aa]">Smart Search</span>
            <span className="ml-auto text-[8px] font-mono text-[#5a5a78]">
              BM25 + synonyms + RRF fusion
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
              placeholder="Szukaj w obserwacjach i memories... (np. autoryzacja JWT, optymalizacja bazy)"
              className="flex-1 bg-[#181828] border border-[#383850] px-3 py-2 text-[12px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#00f5d4]/50 font-mono"
            />
            <button
              onClick={runSearch}
              disabled={!searchQuery.trim() || !!busy}
              className="px-4 py-2 text-[11px] font-mono bg-[#00f5d4]/20 text-[#00f5d4] border border-[#00f5d4]/40 hover:bg-[#00f5d4]/30 disabled:opacity-30 flex items-center gap-2"
            >
              {busy === 'search' ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              Szukaj
            </button>
          </div>
          {searchMeta && (
            <div className="mt-2 flex items-center gap-3 text-[9px] font-mono text-[#5a5a78]">
              <span>{searchMeta.totalFound} wyników</span>
              <span>{searchMeta.latencyMs}ms</span>
              {(searchMeta.expansion?.entities?.length ?? 0) > 0 && (
                <span className="text-[#8888aa]">
                  expansion: {searchMeta.expansion!.entities.slice(0, 5).join(', ')}
                  {searchMeta.expansion!.entities.length > 5 && ` +${searchMeta.expansion!.entities.length - 5}`}
                </span>
              )}
            </div>
          )}
          {error && (
            <div className="mt-2 px-2 py-1 text-[10px] font-mono bg-[#ff6b6b]/10 text-[#ff6b6b] border border-[#ff6b6b]/30 flex items-center gap-2">
              <AlertTriangle size={11} /> {error}
            </div>
          )}
        </div>

        {/* Results / Memories list */}
        <div className="flex-1 overflow-y-auto p-3">
          {searchResults ? (
            <div>
              <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1.5">
                <Sparkles size={10} /> Search Results ({searchResults.length})
              </div>
              {searchResults.length === 0 ? (
                <div className="text-center py-12">
                  <Search size={36} className="text-[#383850] mx-auto mb-2" />
                  <div className="text-[11px] font-mono text-[#8888aa]">Brak wyników</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((r, i) => (
                    <div key={r.observation.id} className="bg-[#181828] border border-[#383850] p-3 hover:border-[#00f5d4]/30 transition-all">
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-mono text-[#5a5a78] mt-1 tabular-nums">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-mono font-bold text-[#e8e8f5]">{r.observation.title}</div>
                          <div className="text-[10px] font-mono text-[#8888aa] mt-1 leading-relaxed line-clamp-3">
                            {r.observation.narrative}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-[9px] font-mono text-[#5a5a78]">
                            <span className="text-[#00f5d4]">score: {r.combinedScore.toFixed(4)}</span>
                            <span>bm25: {r.bm25Score.toFixed(2)}</span>
                            <span>{formatDate(r.observation.timestamp)}</span>
                            {r.observation.concepts.length > 0 && (
                              <span className="text-[#a855f7]">{r.observation.concepts.slice(0, 3).join(', ')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="text-[9px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1.5">
                <Database size={10} /> Memories ({memories.length})
              </div>
              {memories.length === 0 ? (
                <div className="text-center py-12">
                  <Brain size={36} className="text-[#383850] mx-auto mb-2" />
                  <div className="text-[11px] font-mono text-[#8888aa]">Brak memories</div>
                  <div className="text-[9px] font-mono text-[#5a5a78] mt-1">
                    Dodaj pierwszą lekcję przez formularz po lewej.
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {memories.map(m => {
                    const meta = TYPE_META[m.type] ?? TYPE_META.fact;
                    const expanded = expandedIds.has(m.id);
                    return (
                      <div key={m.id} className="bg-[#181828] border border-[#383850] hover:border-[#383850] transition-all">
                        <div
                          className="flex items-start gap-2 p-3 cursor-pointer"
                          onClick={() => toggleExpand(m.id)}
                        >
                          {expanded ? <ChevronDown size={12} className="text-[#5a5a78] mt-1" /> : <ChevronRight size={12} className="text-[#5a5a78] mt-1" />}
                          <span className="text-[14px]">{meta.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-mono font-bold text-[#e8e8f5]">{m.title}</div>
                            <div className="flex items-center gap-2 mt-0.5 text-[9px] font-mono">
                              <span style={{ color: meta.color }}>{meta.label}</span>
                              <span className="text-[#5a5a78]">v{m.version}</span>
                              <span className="text-[#5a5a78]">{formatDate(m.updatedAt)}</span>
                              {m.project && <span className="text-[#a855f7]">@{m.project}</span>}
                            </div>
                          </div>
                          {/* Strength bar */}
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <div className="text-[9px] font-mono tabular-nums" style={{ color: strengthColor(m.strength) }}>
                              {m.strength.toFixed(1)}
                            </div>
                            <div className="w-12 h-1 bg-[#252535] rounded-full overflow-hidden">
                              <div
                                className="h-full"
                                style={{
                                  width: `${(m.strength / 10) * 100}%`,
                                  background: strengthColor(m.strength),
                                }}
                              />
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteMemory(m.id); }}
                            disabled={busy === `del-${m.id}`}
                            className="p-1 text-[#5a5a78] hover:text-[#ff6b6b] transition-colors"
                            title="Usuń"
                          >
                            {busy === `del-${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                          </button>
                        </div>
                        {expanded && (
                          <div className="px-3 pb-3 pt-0 ml-7">
                            <div className="text-[10px] font-mono text-[#8888aa] leading-relaxed whitespace-pre-wrap">
                              {m.content}
                            </div>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {m.concepts.map((c, i) => (
                                <span key={i} className="text-[8px] font-mono px-1.5 py-0.5 bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/30">
                                  {c}
                                </span>
                              ))}
                              {m.tags?.map((t, i) => (
                                <span key={i} className="text-[8px] font-mono px-1.5 py-0.5 bg-[#252535] text-[#8888aa] border border-[#383850]">
                                  #{t}
                                </span>
                              ))}
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-[8px] font-mono text-[#5a5a78]">
                              <span>created: {formatDate(m.createdAt)}</span>
                              {m.lastAccessedAt && <span>last access: {formatDate(m.lastAccessedAt)}</span>}
                              {m.accessCount !== undefined && <span>accessed ×{m.accessCount}</span>}
                              {m.forgetAfter && (
                                <span className="text-[#ff6b6b]">forgets: {formatDate(m.forgetAfter)}</span>
                              )}
                              {!m.isLatest && <span className="text-[#ff6b6b]">SUPERSEDED</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stat card ──
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-[#181828] border border-[#383850] px-2 py-1.5">
      <div className="text-[8px] font-mono text-[#5a5a78]">{label}</div>
      <div className="text-[14px] font-mono font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
