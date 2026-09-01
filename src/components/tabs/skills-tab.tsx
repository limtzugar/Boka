'use client';

import { useState, useEffect } from 'react';
import {
  Network, Brain, Upload, List, MessageSquare, Shield, Users, Wrench, Eye,
  Loader2, Sparkles, Cpu, Zap, Activity, AlertTriangle, Check, X,
} from 'lucide-react';

// ── Types (FamilyMember was inline in page.tsx) ──
interface FamilyMember {
  id: string;
  name: string;
  role: string;
  age: number;
  avatarEmoji: string;
  preferences: Record<string, unknown>;
  isActive: boolean;
  category?: string;
  color?: string | null;
}

// ── usePresenceDetection is a hook in @/hooks — inline stub for skills-tab ──
// Returns the same shape as the real hook so PresencePanel compiles.
function usePresenceDetection(_config: any, _onEvent?: (e: any) => void) {
  return {
    active: false,
    starting: false,
    error: null as string | null,
    currentState: 'absent' as string,
    motionLevel: 0,
    lastEventAt: null as number | null,
    eventsFired: 0,
    cameraStream: null as MediaStream | null,
    videoRef: { current: null as HTMLVideoElement | null },
    canvasRef: { current: null as HTMLCanvasElement | null },
    start: () => {},
    stop: () => {},
  };
}

// ═══════════════════════════════════════════════════════════
// SKILLS TAB — extracted from page.tsx (P0.2 refactoring)
// 10 framework panels: Vector, Mem0, Ingestion, GraphRAG,
// DeepAgents, AutoGen, Guardrails, Crew, Sandbox, Presence
// ═══════════════════════════════════════════════════════════

export function SkillsTab() {
  const [section, setSection] = useState<'vector' | 'mem0' | 'ingestion' | 'graphrag' | 'deepagents' | 'autogen' | 'guardrails' | 'crew' | 'sandbox' | 'presence'>('vector');

  const TABS: { key: typeof section; label: string; icon: React.ReactNode; color: string; desc: string }[] = [
    { key: 'vector', label: 'Wektory (Qdrant)', icon: <Network size={14} />, color: '#ffd93d', desc: 'Semantic vector search' },
    { key: 'mem0', label: 'Mem0', icon: <Brain size={14} />, color: '#ffd93d', desc: 'ADD/UPDATE/DELETE/NOOP memory ops' },
    { key: 'ingestion', label: 'LlamaIndex', icon: <Upload size={14} />, color: '#ffd93d', desc: 'Pipeline ingestion' },
    { key: 'graphrag', label: 'GraphRAG', icon: <Network size={14} />, color: '#ffd93d', desc: 'Entities, Relations, Communities' },
    { key: 'deepagents', label: 'DeepAgents', icon: <List size={14} />, color: '#4ade80', desc: 'Todo-plans + Vestibule' },
    { key: 'autogen', label: 'AutoGen', icon: <MessageSquare size={14} />, color: '#4ade80', desc: 'SelectorGroupChat multi-agent' },
    { key: 'guardrails', label: 'Guardrails', icon: <Shield size={14} />, color: '#4ade80', desc: 'OpenAI Agents SDK safety' },
    { key: 'crew', label: 'CrewAI', icon: <Users size={14} />, color: '#6ec6e7', desc: 'Role + Backstory per Member' },
    { key: 'sandbox', label: 'OpenHands', icon: <Wrench size={14} />, color: '#6ec6e7', desc: 'Sandboxed code execution' },
    { key: 'presence', label: 'Isaac ROS', icon: <Eye size={14} />, color: '#6ec6e7', desc: 'Presence detection' },
  ];

  const GROUPS: { title: string; color: string; keys: typeof section[] }[] = [
    { title: 'PAMIĘĆ (Vector + Graph)', color: '#ffd93d', keys: ['vector', 'mem0', 'ingestion', 'graphrag'] },
    { title: 'AGENCI (Multi-Agent)', color: '#4ade80', keys: ['deepagents', 'autogen', 'guardrails'] },
    { title: 'ZESPÓŁ + SANDBOX', color: '#6ec6e7', keys: ['crew', 'sandbox', 'presence'] },
  ];

  const tabMap = new Map(TABS.map(t => [t.key, t]));
  const activeTab = tabMap.get(section);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ─────────── SIDE MENU ─────────── */}
      <aside className="w-64 shrink-0 border-r border-[#383850] bg-[#181828] flex flex-col">
        <div className="p-2 border-b border-[#383850]">
          <h2 className="font-pixel text-xs" style={{ color: '#4ade80' }}>SKILLS</h2>
          <div className="text-[9px] text-[#8888aa] font-mono mt-1">v0.3.19 · {TABS.length} frameworków AI</div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {GROUPS.map(group => (
            <div key={group.title} className="mb-2">
              <div
                className="px-3 py-1 text-[9px] font-mono uppercase tracking-wider"
                style={{ color: group.color }}
              >
                {group.title}
              </div>
              {group.keys.map(key => {
                const t = tabMap.get(key);
                if (!t) return null;
                const active = section === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSection(key)}
                    className={`w-full text-left px-3 py-1.5 text-[11px] font-mono transition-all border-l-2 flex items-center gap-0 ${
                      active
                        ? 'bg-[#4ade80]/15 text-[#e8e8f5] border-[#4ade80]'
                        : 'text-[#8888aa] border-transparent hover:bg-[#252535] hover:text-[#e8e8f5]'
                    }`}
                    style={active ? { color: t.color, borderColor: t.color, backgroundColor: `${t.color}1a` } : undefined}
                  >
                    <span className="w-4 flex justify-center shrink-0" style={{ color: active ? t.color : undefined }}>{t.icon}</span>
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-2 border-t border-[#383850] text-[9px] text-[#8888aa] font-mono leading-relaxed">
          Qdrant · Mem0 · LlamaIndex<br />
          GraphRAG · DeepAgents<br />
          AutoGen · Agents SDK<br />
          CrewAI · OpenHands · Isaac ROS
        </div>
      </aside>

      {/* ─────────── CONTENT ─────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          {/* Skill header */}
          {activeTab && (
            <div className="mb-4 pb-3 border-b border-[#383850]">
              <div className="flex items-center gap-2 mb-1">
                <span style={{ color: activeTab.color }}>{activeTab.icon}</span>
                <h2 className="text-lg font-bold text-[#e8e8f5]">{activeTab.label}</h2>
              </div>
              <div className="text-xs text-[#8888aa] font-mono">{activeTab.desc}</div>
            </div>
          )}

          {/* Treść */}
          {section === 'vector' && <VectorMemoryPanel />}
          {section === 'mem0' && <Mem0Panel />}
          {section === 'ingestion' && <IngestionPanel />}
          {section === 'graphrag' && <GraphRAGPanel />}
          {section === 'deepagents' && <DeepAgentsPanel />}
          {section === 'autogen' && <AutoGenPanel />}
          {section === 'guardrails' && <GuardrailsPanel />}
          {section === 'crew' && <CrewPanel />}
          {section === 'sandbox' && <SandboxPanel />}
          {section === 'presence' && <PresencePanel />}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// V0.3 — 10 new panels (one per framework)
// ═══════════════════════════════════════════════════════════

function VectorMemoryPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(null); setResults(null);
    try {
      const r = await fetch(`/api/vector-memory?q=${encodeURIComponent(query)}`).then(r => r.json());
      if (r.error) throw new Error(r.error);
      setResults(r.results || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const reindex = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/vector-memory?action=reindex', { method: 'POST' }).then(r => r.json());
      alert(`Zindeksowano: ${r.indexed || 0}, pominięto: ${r.skipped || 0}`);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
      <div className="flex items-center justify-between">
 <h3 className="text-xs font-mono text-[#ffd93d]"> Qdrant-style Vector Search</h3>
        <button onClick={reindex} disabled={loading}
          className="text-[10px] px-2 py-1 bg-[#fbbf24]/10 text-[#ffd93d] border border-[#fbbf24]/30 rounded">
          Reindex missing
        </button>
      </div>
      <p className="text-[10px] text-[#8888aa]">Wektorowe wyszukiwanie z filtrami (memberId/domain/emotion). Cosine similarity na embeddings.</p>
      <input
        type="text" value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && run()}
        placeholder="Wyszukaj wspomnienia po znaczeniu..."
        className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] font-mono"
      />
      <button onClick={run} disabled={loading || !query.trim()}
        className="px-4 py-2 bg-[#fbbf24]/15 text-[#ffd93d] border border-[#fbbf24]/30  text-xs font-mono disabled:opacity-50">
        {loading ? <Loader2 size={12} className="animate-spin inline" /> : null} Szukaj wektorowo
      </button>
      {error && <div className="text-xs text-[#ff6b6b] bg-[#ff6b6b]/10 border border-[#ff6b6b]/30  p-2 font-mono">{error}</div>}
      {results !== null && (
        <div className="space-y-2">
          <div className="text-[10px] text-[#8888aa] font-mono">{results.length} wyników</div>
          {results.map((r, i) => (
            <div key={i} className="bg-[#181828] border border-[#383850]  p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[#ffd93d] font-mono uppercase">{r.memory?.entryType}</span>
                <span className="text-[10px] text-[#4ade80] font-mono">score: {(r.score || 0).toFixed(3)}</span>
              </div>
              <div className="text-xs text-[#8888aa]">{r.memory?.content?.slice(0, 300)}{r.memory?.content?.length > 300 ? '...' : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Mem0Panel() {
  const [content, setContent] = useState('');
  const [memberId, setMemberId] = useState('');
  const [lastResult, setLastResult] = useState<any>(null);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const ingest = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const r = await fetch('/api/mem0', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, memberId: memberId || undefined, source: 'manual' }),
      }).then(r => r.json());
      setLastResult(r);
      setContent('');
      loadRevisions();
    } finally { setLoading(false); }
  };

  const loadRevisions = async () => {
    try {
      const r = await fetch('/api/mem0').then(r => r.json());
      setRevisions(r.revisions || []);
    } catch {}
  };

  useEffect(() => { loadRevisions(); }, []);

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
 <h3 className="text-xs font-mono text-[#ffd93d]"> Mem0 — ADD/UPDATE/DELETE/NOOP</h3>
      <p className="text-[10px] text-[#8888aa]">Algorytm LLM-judge decyduje czy dodać nową pamięć, zaktualizować istniejącą, czy zignorować jako duplikat.</p>
      <textarea value={content} onChange={e => setContent(e.target.value)}
        placeholder="Wpisz nowe wspomnienie do zainwestowania..."
        rows={3}
        className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] font-mono"
      />
      <input type="text" value={memberId} onChange={e => setMemberId(e.target.value)}
        placeholder="memberId (opcjonalne)"
        className="w-full bg-[#181828] border border-[#383850]  px-3 py-1 text-xs text-[#e8e8f5] font-mono"
      />
      <button onClick={ingest} disabled={loading || !content.trim()}
        className="px-4 py-2 bg-[#fbbf24]/15 text-[#ffd93d] border border-[#fbbf24]/30  text-xs font-mono disabled:opacity-50">
        {loading ? <Loader2 size={12} className="animate-spin inline" /> : null} Ingest (Mem0)
      </button>
      {lastResult && (
        <div className="bg-[#181828] border border-[#383850]  p-2 text-xs">
          <div className="font-mono text-[#ffd93d] mb-1">ACTION: {lastResult.action}</div>
          <div className="text-[#8888aa]">{lastResult.reason}</div>
          {lastResult.matchedMemoryId && <div className="text-[10px] text-[#8888aa] mt-1">matched: {lastResult.matchedMemoryId}</div>}
          {lastResult.similarity !== undefined && <div className="text-[10px] text-[#4ade80] mt-1">similarity: {lastResult.similarity.toFixed(3)}</div>}
        </div>
      )}
      <div>
        <div className="text-[10px] text-[#8888aa] font-mono mb-1">Ostatnie rewizje ({revisions.length})</div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {revisions.slice(0, 10).map((r, i) => (
            <div key={i} className="text-[10px] bg-[#181828]  p-1.5 border border-[#383850]">
              <span className={`font-mono ${r.action === 'ADD' ? 'text-[#4ade80]' : r.action === 'UPDATE' ? 'text-[#ffd93d]' : r.action === 'DELETE' ? 'text-[#ff6b6b]' : 'text-[#8888aa]'}`}>
                {r.action}
              </span>
              <span className="text-[#8888aa] ml-2">{new Date(r.createdAt).toLocaleString()}</span>
              <div className="text-[#8888aa] mt-0.5">{r.reason}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IngestionPanel() {
  const [sourceType, setSourceType] = useState<'text' | 'url'>('text');
  const [content, setContent] = useState('');
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const ingest = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const r = await fetch('/api/ingestion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType, sourceUri: content }),
      }).then(r => r.json());
      alert(`Status: ${r.status}\nMemories: ${r.memoriesCreated}\nEntities: ${r.entitiesCreated}`);
      loadJobs();
    } finally { setLoading(false); }
  };

  const loadJobs = async () => {
    try { setJobs((await fetch('/api/ingestion?list=true').then(r => r.json())).jobs || []); } catch {}
  };

  useEffect(() => { loadJobs(); }, []);

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
 <h3 className="text-xs font-mono text-[#ffd93d]"> LlamaIndex Ingestion Pipeline</h3>
      <p className="text-[10px] text-[#8888aa]">Pipeline: LOAD → PARSE → CHUNK → EXTRACT → EMBED → STORE. Auto-entity extraction + Mem0 ingest.</p>
      <select value={sourceType} onChange={e => setSourceType(e.target.value as any)}
        className="bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono">
        <option value="text">Text (raw)</option>
        <option value="url">URL (fetch + parse HTML)</option>
      </select>
      <textarea value={content} onChange={e => setContent(e.target.value)}
        placeholder={sourceType === 'text' ? 'Wklej tekst do ingestji...' : 'https://example.com/article'}
        rows={4}
        className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] font-mono"
      />
      <button onClick={ingest} disabled={loading || !content.trim()}
        className="px-4 py-2 bg-[#fbbf24]/15 text-[#ffd93d] border border-[#fbbf24]/30  text-xs font-mono disabled:opacity-50">
        {loading ? <Loader2 size={12} className="animate-spin inline" /> : null} Run pipeline
      </button>
      <div>
        <div className="text-[10px] text-[#8888aa] font-mono mb-1">Ostatnie joby ({jobs.length})</div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {jobs.slice(0, 10).map((j, i) => (
            <div key={i} className="text-[10px] bg-[#181828]  p-1.5 border border-[#383850]">
              <span className={`font-mono ${j.status === 'done' ? 'text-[#4ade80]' : j.status === 'error' ? 'text-[#ff6b6b]' : 'text-[#ffd93d]'}`}>
                {j.status}
              </span>
              <span className="text-[#8888aa] ml-2">{j.sourceType}</span>
              <span className="text-[#8888aa] ml-2">{new Date(j.createdAt).toLocaleString()}</span>
              {j.memoriesCreated > 0 && <span className="text-[#a855f7] ml-2">{j.memoriesCreated} mem</span>}
              {j.entitiesCreated > 0 && <span className="text-[#4ade80] ml-2">{j.entitiesCreated} ent</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GraphRAGPanel() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [entities, setEntities] = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const rebuild = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/graphrag?action=rebuild', { method: 'POST' }).then(r => r.json());
      alert(`Entities: ${r.entitiesProcessed}\nCommunities: ${r.communitiesCreated}\nSummarized: ${r.communitiesSummarized}`);
      loadData();
    } finally { setLoading(false); }
  };

  const globalSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/graphrag?action=global&q=${encodeURIComponent(query)}`).then(r => r.json());
      setAnswer(r.answer);
    } finally { setLoading(false); }
  };

  const loadData = async () => {
    try {
      const [e, c] = await Promise.all([
        fetch('/api/graphrag?action=entities').then(r => r.json()),
        fetch('/api/graphrag?action=communities').then(r => r.json()),
      ]);
      setEntities(e.entities || []);
      setCommunities(c.communities || []);
    } catch {}
  };

  useEffect(() => { loadData(); }, []);

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
      <div className="flex items-center justify-between">
 <h3 className="text-xs font-mono text-[#ffd93d]">️ GraphRAG — Entities, Relations, Communities</h3>
        <button onClick={rebuild} disabled={loading}
          className="text-[10px] px-2 py-1 bg-[#fbbf24]/10 text-[#ffd93d] border border-[#fbbf24]/30 rounded">
          Rebuild graph
        </button>
      </div>
      <p className="text-[10px] text-[#8888aa]">Cron nocny ekstrahuje encje (Person/Place/Activity) + relacje + wykrywa społeczności (clustering) + generuje podsumowania LLM.</p>
      <input type="text" value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && globalSearch()}
        placeholder="Global search: 'Co było ważne w tym tygodniu?'"
        className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] font-mono"
      />
      <button onClick={globalSearch} disabled={loading || !query.trim()}
        className="px-4 py-2 bg-[#fbbf24]/15 text-[#ffd93d] border border-[#fbbf24]/30  text-xs font-mono disabled:opacity-50">
        Global search
      </button>
      {answer && (
        <div className="bg-[#181828] border border-[#383850]  p-2 text-xs text-[#8888aa] whitespace-pre-wrap">
          {answer}
        </div>
      )}
      <div className="grid grid-cols-2 gap-0">
        <div>
          <div className="text-[10px] text-[#8888aa] font-mono mb-1">Encje ({entities.length})</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {entities.slice(0, 20).map((e, i) => (
              <div key={i} className="text-[10px] bg-[#181828]  p-1 border border-[#383850]">
                <span className="text-[#ffd93d] font-mono">{e.name}</span>
                <span className="text-[#8888aa] ml-1">({e.type})</span>
                <span className="text-[#4ade80] ml-1">×{e.mentionCount}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[#8888aa] font-mono mb-1">Społeczności ({communities.length})</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {communities.slice(0, 20).map((c, i) => (
              <div key={i} className="text-[10px] bg-[#181828]  p-1 border border-[#383850]">
                <span className="text-[#a855f7] font-mono">L{c.level}</span>
                {c.label && <span className="text-[#e8e8f5] ml-1">{c.label}</span>}
                <div className="text-[#8888aa]">{c.summary?.slice(0, 80) || '(brak podsumowania)'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeepAgentsPanel() {
  const [plans, setPlans] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [blobs, setBlobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const [p, b] = await Promise.all([
        fetch('/api/deepagents?action=plans').then(r => r.json()),
        fetch('/api/deepagents?action=blobs').then(r => r.json()),
      ]);
      setPlans(p.plans || []);
      setBlobs(b.blobs || []);
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const createPlan = async () => {
    if (!title || !stepsText) return;
    setLoading(true);
    try {
      const steps = stepsText.split('\n').filter(s => s.trim());
      await fetch('/api/deepagents?action=create_plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, steps, scope: 'daily' }),
      });
      setTitle(''); setStepsText('');
      load();
    } finally { setLoading(false); }
  };

  const toggleStep = async (planId: string, stepId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';
    await fetch(`/api/deepagents?action=update_step&planId=${planId}&stepId=${stepId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  };

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
 <h3 className="text-xs font-mono text-[#4ade80]"> DeepAgents — Todo-plans + Vestibule</h3>
      <p className="text-[10px] text-[#8888aa]">Widoczny plan dnia + vestibule filesystem (zrzucanie długich kontekstów). ReflectionSubagent czyta wykonane plany.</p>
      <input type="text" value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Tytuł planu (np. 'Plan dnia 2026-06-17')"
        className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono"
      />
      <textarea value={stepsText} onChange={e => setStepsText(e.target.value)}
        placeholder={"Jeden krok na linię:\nPrzypomnieć Tacie o zakupach\nPrzygotować quiz dla Zuzy\nPodsumować dzień o 20:00"}
        rows={4}
        className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono"
      />
      <button onClick={createPlan} disabled={loading || !title || !stepsText}
        className="px-4 py-2 bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/30  text-xs font-mono disabled:opacity-50">
        Utwórz plan
      </button>

      <div>
        <div className="text-[10px] text-[#8888aa] font-mono mb-1">Plany ({plans.length})</div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {plans.map(p => {
            const steps = typeof p.steps === 'string' ? JSON.parse(p.steps) : p.steps;
            return (
              <div key={p.id} className="bg-[#181828] border border-[#383850]  p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-[#e8e8f5]">{p.title}</span>
                  <span className={`text-[9px] ${p.status === 'completed' ? 'text-[#4ade80]' : 'text-[#ffd93d]'}`}>{p.status}</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {steps.map((s: any, i: number) => (
                    <button key={i} onClick={() => toggleStep(p.id, s.id, s.status)}
                      className="flex items-center gap-1 text-[10px] w-full text-left hover:bg-[#252535] px-1 py-0.5 rounded">
                      <span className={s.status === 'done' ? 'text-[#4ade80]' : 'text-[#8888aa]'}>
 {s.status ==='done' ?'' :'○'}
                      </span>
                      <span className={s.status === 'done' ? 'text-[#8888aa] line-through' : 'text-[#8888aa]'}>{s.text}</span>
                    </button>
                  ))}
                </div>
                {p.reflectionNotes && (
                  <div className="mt-1 text-[10px] text-[#a855f7] italic">{p.reflectionNotes}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-[#8888aa] font-mono mb-1">Vestibule blobs ({blobs.length})</div>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {blobs.slice(0, 10).map((b, i) => (
            <div key={i} className="text-[10px] bg-[#181828]  p-1 border border-[#383850]">
              <span className="text-[#4ade80] font-mono">{b.kind}</span>
              <span className="text-[#8888aa] ml-2">{b.tokenCount} tok</span>
              <span className="text-[#8888aa] ml-2">×{b.accessCount}</span>
              {b.title && <div className="text-[#8888aa]">{b.title}</div>}
              {b.summary && <div className="text-[#8888aa]">{b.summary.slice(0, 100)}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AutoGenPanel() {
  const [topic, setTopic] = useState('discussion');
  const [trigger, setTrigger] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const loadHistory = async () => {
    try { setHistory((await fetch(`/api/autogen?action=history&topic=${topic}`).then(r => r.json())).history || []); } catch {}
  };

  useEffect(() => { loadHistory(); }, [topic]);

  const runGroupChat = async () => {
    if (!trigger) return;
    setLoading(true); setResult(null);
    try {
      const r = await fetch('/api/autogen?action=group_chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic, trigger,
          availableAgents: ['orchestrator', 'child_agent', 'finance_agent', 'health_agent', 'education_agent'],
          maxRounds: 3,
        }),
      }).then(r => r.json());
      setResult(r);
      loadHistory();
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
 <h3 className="text-xs font-mono text-[#4ade80]"> AutoGen — SelectorGroupChat</h3>
      <p className="text-[10px] text-[#8888aa]">Multi-agent messaging: LLM wybiera kto z 6 agentów (orchestrator/child/finance/health/education/reflection) ma odpowiedzieć w każdej rundzie.</p>
      <select value={topic} onChange={e => setTopic(e.target.value)}
        className="bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono">
        <option value="discussion">discussion</option>
        <option value="reflection">reflection</option>
        <option value="research">research</option>
        <option value="ritual">ritual</option>
        <option value="alert">alert</option>
      </select>
      <textarea value={trigger} onChange={e => setTrigger(e.target.value)}
        placeholder="Wpisz trigger dla group chatu..."
        rows={2}
        className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono"
      />
      <button onClick={runGroupChat} disabled={loading || !trigger}
        className="px-4 py-2 bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/30  text-xs font-mono disabled:opacity-50">
        {loading ? <Loader2 size={12} className="animate-spin inline" /> : null} Run SelectorGroupChat
      </button>
      {result && (
        <div className="bg-[#181828] border border-[#383850]  p-2">
          <div className="text-[10px] text-[#4ade80] font-mono mb-1">Final agent: {result.selectedAgent}</div>
          <div className="text-xs text-[#8888aa]">{result.reply?.slice(0, 500)}</div>
          <div className="text-[10px] text-[#8888aa] mt-1">{result.messages?.length} wiadomości w wątku</div>
        </div>
      )}
      <div>
        <div className="text-[10px] text-[#8888aa] font-mono mb-1">Historia tematu '{topic}' ({history.length})</div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {history.slice(-15).map((m, i) => (
            <div key={i} className="text-[10px] bg-[#181828]  p-1.5 border border-[#383850]">
              <span className="text-[#4ade80] font-mono">{m.fromAgent}</span>
              <span className="text-[#8888aa]"> → {m.toAgent || '(broadcast)'}</span>
              <div className="text-[#8888aa] mt-0.5">{m.payload?.content?.slice(0, 200)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GuardrailsPanel() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [childNearby, setChildNearby] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/guardrails?action=check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, output, childNearby, memberAge: 18 }),
      }).then(r => r.json());
      setResult(r);
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
 <h3 className="text-xs font-mono text-[#4ade80]">️ OpenAI Agents SDK — Guardrails</h3>
      <p className="text-[10px] text-[#8888aa]">Input guardrails: child_safe, financial_risk, intent_classify. Output guardrails: personality_consistency, length_check.</p>
      <label className="flex items-center gap-0 text-xs text-[#8888aa]">
        <input type="checkbox" checked={childNearby} onChange={e => setChildNearby(e.target.checked)}
          className="accent-[#4ade80]" />
        Dziecko w pobliżu (włącza child_safe filter)
      </label>
      <textarea value={input} onChange={e => setInput(e.target.value)}
        placeholder="Input użytkownika..."
        rows={2}
        className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono"
      />
      <textarea value={output} onChange={e => setOutput(e.target.value)}
        placeholder="Output BOKA do sprawdzenia..."
        rows={2}
        className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono"
      />
      <button onClick={check} disabled={loading}
        className="px-4 py-2 bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/30  text-xs font-mono disabled:opacity-50">
        Run all guardrails
      </button>
      {result && (
        <div className="space-y-2">
          {result.blocked && (
            <div className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/30  p-2 text-xs text-[#ff6b6b] font-mono">
 ZABLOKOWANE: {result.blockReason}
            </div>
          )}
          {result.warnings.length > 0 && (
            <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/30  p-2 text-xs text-[#ffd93d] font-mono">
 ️ Ostrzeżenia: {result.warnings.join(';')}
            </div>
          )}
          <div className="grid grid-cols-2 gap-0">
            <div>
              <div className="text-[10px] text-[#8888aa] font-mono mb-1">Input guardrails</div>
              {result.input.map((r: any, i: number) => (
                <div key={i} className={`text-[10px] p-1  mb-1 ${r.passed ? 'text-[#4ade80]' : 'text-[#ff6b6b]'}`}>
 {r.passed ?'' :''} {r.reason}
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] text-[#8888aa] font-mono mb-1">Output guardrails</div>
              {result.output.map((r: any, i: number) => (
                <div key={i} className={`text-[10px] p-1  mb-1 ${r.passed ? 'text-[#4ade80]' : 'text-[#ff6b6b]'}`}>
 {r.passed ?'' :''} {r.reason}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CrewPanel() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try { setMembers((await fetch('/api/crew').then(r => r.json())).members || []); } catch {}
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
 <h3 className="text-xs font-mono text-[#6ec6e7]"> CrewAI — Role + Backstory per Member</h3>
      <p className="text-[10px] text-[#8888aa]">Każdy domownik ma crew profile (role, goal, backstory) generowane z MemberProfile. Manager Agent ewaluuje cotygodniowo.</p>
      <div className="space-y-2">
        {members.length === 0 ? (
          <div className="text-[10px] text-[#8888aa]">Brak crew profili. Generuj przez API: POST /api/crew?action=generate&memberId=...</div>
        ) : members.map(m => (
          <div key={m.memberId} className="bg-[#181828] border border-[#383850]  p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#6ec6e7]">{m.role}</span>
              {m.evaluationScore !== undefined && (
                <span className="text-[10px] text-[#4ade80] font-mono">score: {m.evaluationScore.toFixed(2)}</span>
              )}
            </div>
            <div className="text-[10px] text-[#8888aa] mt-1">Cel: {m.goal}</div>
            <div className="text-[10px] text-[#8888aa] mt-1 italic">{m.backstory}</div>
            {m.lastEvaluatedAt && (
              <div className="text-[9px] text-[#8888aa] mt-1">Ewaluacja: {new Date(m.lastEvaluatedAt).toLocaleDateString()}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SandboxPanel() {
  const [code, setCode] = useState(`// result = ... przypisz wynik\nconst result = input.a + input.b;\n`);
  const [inputPayload, setInputPayload] = useState('{"a": 5, "b": 7}');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    setLoading(true); setResult(null);
    try {
      const r = await fetch('/api/openhands?action=execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          inputPayload: JSON.parse(inputPayload),
          inputType: 'function_call',
          sandboxKind: 'vm',
          timeoutMs: 5000,
        }),
      }).then(r => r.json());
      setResult(r);
    } catch (e: any) {
      setResult({ status: 'error', errorMessage: e.message });
    } finally { setLoading(false); }
  };

  const analyze = async () => {
    const r = await fetch('/api/openhands?action=analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).then(r => r.json());
    alert(`Security flags: ${r.securityFlags.join(', ') || 'none'}\nBlocked: ${r.blocked}`);
  };

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
      <div className="flex items-center justify-between">
 <h3 className="text-xs font-mono text-[#6ec6e7]"> OpenHands Sandbox</h3>
        <button onClick={analyze} className="text-[10px] px-2 py-1 bg-[#60a5fa]/10 text-[#6ec6e7] border border-[#60a5fa]/30 rounded">
          Security analyze
        </button>
      </div>
      <p className="text-[10px] text-[#8888aa]">Izolowany runtime (vm / worker_threads) z timeout + security scanning (fs_access, child_process, eval = block).</p>
      <textarea value={code} onChange={e => setCode(e.target.value)}
        rows={6}
        className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono"
      />
      <input type="text" value={inputPayload} onChange={e => setInputPayload(e.target.value)}
        className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono"
      />
      <button onClick={execute} disabled={loading}
        className="px-4 py-2 bg-[#60a5fa]/15 text-[#6ec6e7] border border-[#60a5fa]/30  text-xs font-mono disabled:opacity-50">
        {loading ? <Loader2 size={12} className="animate-spin inline" /> : null} Execute in sandbox
      </button>
      {result && (
        <div className={`bg-[#181828] border  p-2 text-xs ${result.status === 'success' ? 'border-[#4ade80]/30' : 'border-[#ff6b6b]/30'}`}>
          <div className="font-mono text-[#6ec6e7] mb-1">Status: {result.status} ({result.durationMs}ms)</div>
          {result.errorMessage && <div className="text-[#ff6b6b]">{result.errorMessage}</div>}
          {result.output !== null && <pre className="text-[#8888aa] whitespace-pre-wrap">{JSON.stringify(result.output, null, 2)}</pre>}
          {result.securityFlags?.length > 0 && <div className="text-[#ffd93d] text-[10px] mt-1">Flags: {result.securityFlags.join(', ')}</div>}
        </div>
      )}
    </div>
  );
}

function PresencePanel() {
  const [history, setHistory] = useState<any[]>([]);
  const [present, setPresent] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState('salon');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);

  // Load members for memberId dropdown
  useEffect(() => {
    fetch('/api/family').then(r => r.json()).then(d => {
      setMembers(d.members || []);
    }).catch(() => {});
  }, []);

  const detection = usePresenceDetection(
    { mode: 'motion', location, memberId, fps: 5, cooldownMs: 60_000, absenceTimeoutMs: 30_000 },
    (e) => {
      // Refresh list when an event fires
      setTimeout(() => load(), 500);
    }
  );

  const load = async () => {
    setLoading(true);
    try {
      const [h, p] = await Promise.all([
        fetch('/api/presence?action=history').then(r => r.json()),
        fetch('/api/presence?action=present').then(r => r.json()),
      ]);
      setHistory(h.history || []);
      setPresent(p.present || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const simulateArrival = async () => {
    await fetch('/api/presence?action=event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventKind: 'arrived', location, confidence: 0.85, captureMethod: 'metadata_only' }),
    });
    load();
  };

  const stateColor = detection.currentState === 'arrived' || detection.currentState === 'present'
    ? '#4ade80'
    : detection.currentState === 'left' ? '#ff6b6b' : '#6b6b8d';

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
      <div className="flex items-center justify-between">
 <h3 className="text-xs font-mono text-[#6ec6e7]">️ Isaac ROS — Presence Detection</h3>
        <button onClick={simulateArrival}
          className="text-[10px] px-2 py-1 bg-[#60a5fa]/10 text-[#6ec6e7] border border-[#60a5fa]/30 rounded">
          Symuluj arrival
        </button>
      </div>
      <p className="text-[10px] text-[#8888aa]">
        Lokalna kamera + people detection (front-end, motion-based, zero deps). Tylko metadane (confidence, location, memberId)
        trafiają do API. Auto-triggery: <span className="text-[#a855f7]">after_school</span>, <span className="text-[#ffd93d]">morning_greeting</span>, <span className="text-[#4ade80]">evening_greeting</span>.
      </p>

      {/* ── Camera + Detection Controls ── */}
      <div className="bg-[#181828] border border-[#383850]  p-2 space-y-2">
        <div className="flex items-center gap-0 flex-wrap">
          <span className="text-[10px] text-[#8888aa] font-mono">Lokalizacja:</span>
          <select
            value={location}
            onChange={e => setLocation(e.target.value)}
            className="bg-[#252535] text-[#e8e8f5] text-[10px] font-mono px-2 py-1  border border-[#383850]"
          >
            <option value="salon">salon</option>
            <option value="kuchnia">kuchnia</option>
            <option value="biuro">biuro</option>
            <option value="pokoj_dziecko">pokój dziecka</option>
            <option value="sypialnia">sypialnia</option>
            <option value="przedpokoj">przedpokój</option>
          </select>

          <span className="text-[10px] text-[#8888aa] font-mono ml-2">ReID:</span>
          <select
            value={memberId || ''}
            onChange={e => setMemberId(e.target.value || null)}
            className="bg-[#252535] text-[#e8e8f5] text-[10px] font-mono px-2 py-1  border border-[#383850]"
          >
            <option value="">(osoba nieznana)</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
            ))}
          </select>

          {!detection.active ? (
            <button
              onClick={detection.start}
              disabled={detection.starting}
              className="text-[10px] px-3 py-1 bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/30  ml-auto disabled:opacity-50"
            >
              {detection.starting ? 'Uruchamianie...' : '▶ Start kamery'}
            </button>
          ) : (
            <button
              onClick={detection.stop}
              className="text-[10px] px-3 py-1 bg-[#ff6b6b]/10 text-[#ff6b6b] border border-[#ff6b6b]/30  ml-auto"
            >
              ■ Stop
            </button>
          )}
        </div>

        {detection.error && (
          <div className="text-[10px] text-[#ff6b6b] bg-[#ff6b6b]/5 p-2  border border-[#ff6b6b]/30">
 {detection.error}
          </div>
        )}

        <div className="flex items-center gap-0">
          {/* Hidden video + canvas (motion detection uses 64x48 canvas) */}
          <video
            ref={detection.videoRef}
            playsInline
            muted
            className="w-32 h-24 bg-black  border border-[#383850] object-cover"
            style={{ display: detection.active ? 'block' : 'none' }}
          />
          <canvas
            ref={detection.canvasRef}
            className="hidden"
          />

          {/* State indicator */}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-0">
              <span className="text-[10px] text-[#8888aa] font-mono">Stan:</span>
              <span className="text-[10px] font-mono" style={{ color: stateColor }}>
                ● {detection.currentState.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-0">
              <span className="text-[10px] text-[#8888aa] font-mono">Motion:</span>
              <div className="flex-1 h-2 bg-[#252535]  overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${detection.motionLevel}%`,
                    background: detection.motionLevel > 10 ? '#4ade80' : '#2a2a3a',
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-[#e8e8f5]">{detection.motionLevel}%</span>
            </div>
            <div className="flex items-center gap-0 text-[10px] text-[#8888aa] font-mono">
              <span>Events: {detection.eventsFired}</span>
              {detection.lastEventAt && (
                <span>Ostatni: {new Date(detection.lastEventAt).toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] text-[#4ade80] font-mono mb-1">Aktualnie obecni ({present.length})</div>
        <div className="space-y-1">
          {present.length === 0 ? (
            <div className="text-[10px] text-[#8888aa]">Nikogo nie wykryto</div>
          ) : present.map((p, i) => (
            <div key={i} className="text-[10px] bg-[#181828]  p-1.5 border border-[#383850]">
              <span className="text-[#6ec6e7] font-mono">{p.member?.name || 'Nieznany'}</span>
              <span className="text-[#8888aa] ml-2">{p.location || '—'}</span>
              <span className="text-[#8888aa] ml-2">{new Date(p.lastSeen).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-[#8888aa] font-mono mb-1">Historia zdarzeń ({history.length})</div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {history.slice(0, 20).map((e, i) => (
            <div key={i} className="text-[10px] bg-[#181828]  p-1.5 border border-[#383850]">
              <span className={`font-mono ${e.eventKind === 'arrived' ? 'text-[#4ade80]' : e.eventKind === 'left' ? 'text-[#ff6b6b]' : 'text-[#8888aa]'}`}>
                {e.eventKind}
              </span>
              <span className="text-[#8888aa] ml-2">{new Date(e.createdAt).toLocaleString()}</span>
              {e.location && <span className="text-[#8888aa] ml-2">{e.location}</span>}
              {e.confidence !== null && <span className="text-[#ffd93d] ml-2">conf: {(e.confidence || 0).toFixed(2)}</span>}
              {e.triggerFired && <span className="text-[#a855f7] ml-2">→ {e.triggerFired}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// WEEKLY REFLECTION PANEL — cron 0 4 * * 0
// GraphRAG rebuild + Supermemory refresh + CrewAI evaluation
// Manual trigger + client-side scheduler (auto-fires Sunday 04:00)
// ═══════════════════════════════════════════════════════════
