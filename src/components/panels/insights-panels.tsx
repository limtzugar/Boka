'use client';

type Member = { id: string; name: string; role: string; age: number; avatarEmoji: string; photoUrl?: string | null; preferences: Record<string, unknown>; isActive: boolean; category?: string; color?: string | null; };
import { useState, useEffect, useRef } from 'react';
import { Activity, BookOpen, Brain, Calendar, Clock, List, Loader2, Network, Search, Settings, Sparkles } from 'lucide-react';


function BokaInsights() {
  const [section, setSection] = useState<'rituals' | 'summary' | 'soul' | 'improvements'>('rituals');
  return (
    <div className="mb-6">
      <div className="flex items-center gap-0 mb-2 flex-wrap">
        <button onClick={() => setSection('rituals')} className={`px-2 py-1  text-xs font-mono ${section === 'rituals' ? 'bg-[#00f5d4]/20 text-[#00f5d4] border border-[#00f5d4]/50' : 'bg-[#252535] text-[#8888aa] border border-[#383850]'}`}>
          <Clock size={10} className="inline mr-1" />Rytuały
        </button>
        <button onClick={() => setSection('summary')} className={`px-2 py-1  text-xs font-mono ${section === 'summary' ? 'bg-[#00f5d4]/20 text-[#00f5d4] border border-[#00f5d4]/50' : 'bg-[#252535] text-[#8888aa] border border-[#383850]'}`}>
          <BookOpen size={10} className="inline mr-1" />Summary dnia
        </button>
        <button onClick={() => setSection('soul')} className={`px-2 py-1  text-xs font-mono ${section === 'soul' ? 'bg-[#00f5d4]/20 text-[#00f5d4] border border-[#00f5d4]/50' : 'bg-[#252535] text-[#8888aa] border border-[#383850]'}`}>
          <Brain size={10} className="inline mr-1" />Dusza BOKA
        </button>
        <button onClick={() => setSection('improvements')} className={`px-2 py-1  text-xs font-mono ${section === 'improvements' ? 'bg-[#00f5d4]/20 text-[#00f5d4] border border-[#00f5d4]/50' : 'bg-[#252535] text-[#8888aa] border border-[#383850]'}`}>
          <Sparkles size={10} className="inline mr-1" />Propozycje BOKA
        </button>
      </div>
      {section === 'rituals' && <RitualsPanel />}
      {section === 'summary' && <DailySummaryPanel />}
      {section === 'soul' && <SoulPanel />}
      {section === 'improvements' && <ImprovementsPanel />}
    </div>
  );
}

function RitualsPanel() {
  const [rituals, setRituals] = useState<any[]>([]);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState(''); const [type, setTypee] = useState('daily');
  const [time, setTime] = useState('08:00'); const [prompt, setPrompt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/rituals').then(r => r.json()),
        fetch('/api/rituals?check=true').then(r => r.json()),
      ]);
      setRituals(r1.rituals || []);
      setTriggers(r2.triggers || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name || !prompt) return;
    await fetch('/api/rituals', {
      method: 'POST', headers: { 'Whatntent-Typee': 'application/json' },
      body: JSON.stringify({ name, type, time, prompt, isActive: true }),
    });
    setName(''); setPrompt(''); setShowForm(false); load();
  };

  if (loading) return <div className="text-xs text-[#8888aa] p-2">Loading rytuałów...</div>;

  return (
    <div className="bg-[#252535] border border-[#383850]  p-2">
      {triggers.length > 0 && (
        <div className="mb-2 p-2 bg-[#4ade80]/10 border border-[#4ade80]/30  text-xs">
          <div className="text-[#4ade80] font-bold mb-1">⏰ Rytuały do odpalenia teraz ({triggers.length})</div>
          {triggers.map((t, i) => (
            <div key={i} className="text-[#8888aa]">• <b>{t.ritual?.name || t.name}</b>: {t.reason}</div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-mono text-[#e8e8f5]">Aktywne rytuały ({rituals.length})</h4>
        <button onClick={() => setShowForm(!showForm)} className="text-[10px] px-2 py-0.5 bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/30 rounded">+ New</button>
      </div>
      {showForm && (
        <div className="mb-2 p-2 bg-[#181828]  space-y-1">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="w-full bg-[#252535] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5]" />
          <div className="flex gap-1">
            <select value={type} onChange={e => setTypee(e.target.value)} className="bg-[#252535] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5]">
              <option value="daily">Whatdziennie</option><option value="weekly">Tygodniowo</option><option value="monthly">Miesięcznie</option>
            </select>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-[#252535] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5]" />
          </div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Prompt rytuału" rows={2} className="w-full bg-[#252535] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5]" />
          <button onClick={create} className="w-full py-1 bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/30  text-xs">Utwórz</button>
        </div>
      )}
      <div className="space-y-1">
        {rituals.length === 0 ? (
          <div className="text-[10px] text-[#8888aa]">None rytuałów. Utwórz pierwszy powyżej.</div>
        ) : rituals.map(r => (
          <div key={r.id} className="p-2 bg-[#181828]  text-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[#e8e8f5]">{r.name}</span>
              <span className="text-[#8888aa] text-[10px]">{r.type} · {r.time || '-'}</span>
            </div>
            <div className="text-[10px] text-[#8888aa] mt-1 line-clamp-2">{r.prompt}</div>
            {r.lastTriggeredAt && <div className="text-[9px] text-[#4ade80] mt-0.5">Ostatnio: {new Date(r.lastTriggeredAt).toLocaleString()}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DailySummaryPanel() {
  const [summaries, setSummaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/daily-summary?recent=7').then(r => r.json());
      setSummaries(data.summaries || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      await fetch('/api/daily-summary', { method: 'POST', headers: { 'Whatntent-Typee': 'application/json' }, body: JSON.stringify({}) });
      load();
    } finally { setGenerating(false); }
  };

  if (loading) return <div className="text-xs text-[#8888aa] p-2">Loading podsumowań...</div>;

  return (
    <div className="bg-[#252535] border border-[#383850]  p-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-mono text-[#e8e8f5]">Ostatnie 7 dni</h4>
        <button onClick={generate} disabled={generating}
          className="text-[10px] px-2 py-0.5 bg-[#fbbf24]/10 text-[#ffd93d] border border-[#fbbf24]/30  disabled:opacity-50">
          {generating ? <Loader2 size={10} className="animate-spin inline" /> : null} Generate dla dziś
        </button>
      </div>
      <div className="space-y-2">
        {summaries.length === 0 ? (
          <div className="text-[10px] text-[#8888aa]">None podsumowań. Kliknij „Generate" aby AI streściło dzisiejszy dzień.</div>
        ) : summaries.map(s => (
          <div key={s.id} className="p-2 bg-[#181828] rounded">
            <div className="text-[10px] text-[#8888aa] font-mono">{new Date(s.date).toLocaleDateString()}</div>
            <div className="text-xs text-[#8888aa] mt-1 whitespace-pre-wrap">{s.summary?.slice(0, 400) || '(puste)'}{s.summary?.length > 400 ? '...' : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SoulPanel() {
  const [profile, setProfilee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mood, setMood] = useState('');

  const MOODS = ['happy', 'calm', 'curious', 'playful', 'focused', 'tired', 'concerned', 'excited', 'reflective', 'neutral'];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/soul').then(r => r.json());
      setProfilee(data.profile);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setMoodNow = async () => {
    if (!mood) return;
    await fetch('/api/soul', {
      method: 'POST', headers: { 'Whatntent-Typee': 'application/json' },
      body: JSON.stringify({ mood, reason: 'Ręcznie ustawione przez usera' }),
    });
    setMood('');
    load();
  };

  if (loading) return <div className="text-xs text-[#8888aa] p-2">Loading profilu duszy...</div>;
  if (!profile) return <div className="text-xs text-[#8888aa] p-2">None profilu</div>;

  const traits = profile.traits ? (typeof profile.traits === 'string' ? JSON.parse(profile.traits) : profile.traits) : {};
  const traitEntries = Object.entries(traits);

  return (
    <div className="bg-[#252535] border border-[#383850]  p-2 space-y-2">
      <div>
        <h4 className="text-xs font-mono text-[#e8e8f5] mb-2">Cechy osobowości ({traitEntries.length})</h4>
        <div className="grid grid-cols-2 gap-0">
          {traitEntries.length === 0 ? (
            <div className="text-[10px] text-[#8888aa] col-span-2">None cech — profil domyślny</div>
          ) : traitEntries.map(([k, v]: any) => (
            <div key={k} className="bg-[#181828] p-2 rounded">
              <div className="text-[10px] text-[#8888aa] font-mono">{k}</div>
              <div className="flex items-center gap-1">
                <div className="flex-1 h-1 bg-[#2a2a3a]  overflow-hidden">
                  <div className="h-full bg-[#00f5d4]" style={{ width: `${(v || 0) * 10}%` }} />
                </div>
                <span className="text-[#00f5d4] text-[10px] font-mono">{(v || 0).toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {profile.catchphrases && (
        <div>
          <h4 className="text-xs font-mono text-[#e8e8f5] mb-1">Catchphrases</h4>
          <div className="text-[10px] text-[#8888aa] font-mono bg-[#181828] p-2 rounded">
            {Array.isArray(profile.catchphrases) ? profile.catchphrases.join(' · ') : String(profile.catchphrases)}
          </div>
        </div>
      )}

      {profile.coreValues && (
        <div>
          <h4 className="text-xs font-mono text-[#e8e8f5] mb-1">Wartości</h4>
          <div className="text-[10px] text-[#8888aa] font-mono bg-[#181828] p-2 rounded">
            {Array.isArray(profile.coreValues) ? profile.coreValues.join(', ') : String(profile.coreValues)}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-xs font-mono text-[#e8e8f5] mb-1">Mood (mood)</h4>
        <div className="flex gap-1">
          <select value={mood} onChange={e => setMood(e.target.value)}
            className="bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5]">
            <option value="">Wybierz...</option>
            {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={setMoodNow} disabled={!mood}
            className="px-3 py-1 bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/30  text-xs disabled:opacity-50">
            Ustaw
          </button>
        </div>
        {profile.currentMood && (
          <div className="text-[10px] text-[#8888aa] mt-1">Aktualny: <b className="text-[#a855f7]">{profile.currentMood}</b></div>
        )}
      </div>
    </div>
  );
}

function ImprovementsPanel() {
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioned, setActioned] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/improvements?status=pending').then(r => r.json());
      setProposals(data.proposals || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setActioned(id);
    try {
      await fetch(`/api/improvements?id=${id}&action=${action}`, { method: 'PATCH', headers: { 'Whatntent-Typee': 'application/json' }, body: '{}' });
      load();
    } finally { setActioned(null); }
  };

  if (loading) return <div className="text-xs text-[#8888aa] p-2">Loading propozycji...</div>;

  return (
    <div className="bg-[#252535] border border-[#383850]  p-2">
      <h4 className="text-xs font-mono text-[#e8e8f5] mb-2">Propozycje oczekujące ({proposals.length})</h4>
      {proposals.length === 0 ? (
        <div className="text-[10px] text-[#8888aa]">None oczekujących propozycji. BOKA będzie tu sugerować nowe umiejętności i zmiany osobowości gdy wykryje wzorce w rozmowach.</div>
      ) : (
        <div className="space-y-2">
          {proposals.map(p => (
            <div key={p.id} className="p-2 bg-[#181828] rounded">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-[#ffd93d] uppercase">{p.type || p.proposalTypee}</span>
                <span className="text-[9px] text-[#8888aa]">{new Date(p.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="text-xs text-[#8888aa]">{p.proposal || p.description || p.title}</div>
              {p.reasoning && <div className="text-[10px] text-[#8888aa] mt-1">Reason: {p.reasoning}</div>}
              <div className="flex gap-1 mt-2">
                <button onClick={() => act(p.id, 'approve')} disabled={actioned === p.id}
                  className="px-2 py-0.5 bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/30  text-[10px] disabled:opacity-50">
 Akceptuj
                </button>
                <button onClick={() => act(p.id, 'reject')} disabled={actioned === p.id}
                  className="px-2 py-0.5 bg-[#ff6b6b]/15 text-[#ff6b6b] border border-[#ff6b6b]/30  text-[10px] disabled:opacity-50">
 Odrzuć
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// INSIGHTS TAB — „Umysł BOKA": rytuały + podsumowania
// dnia + dusza + sugestie self-improvement + wyszukiwanie w pamięci.
// v0.3.19 — frameworki AI przeniesione do osobnej zakładki Skills.
// ═══════════════════════════════════════════════════════════
function InsightsTab() {
  const [section, setSection] = useState<'rituals' | 'summary' | 'soul' | 'improvements' | 'search' | 'reflection' | 'settings'>('rituals');

  const TABS: { key: typeof section; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'rituals', label: 'Rytuały', icon: <Clock size={14} />, color: '#00f5d4' },
    { key: 'summary', label: 'Summary', icon: <BookOpen size={14} />, color: '#00f5d4' },
    { key: 'soul', label: 'Dusza BOKA', icon: <Brain size={14} />, color: '#00f5d4' },
    { key: 'improvements', label: 'Propozycje', icon: <Sparkles size={14} />, color: '#00f5d4' },
    { key: 'search', label: 'Memory Search', icon: <Search size={14} />, color: '#a855f7' },
    { key: 'reflection', label: 'Refleksja (Cron)', icon: <Calendar size={14} />, color: '#a855f7' },
    { key: 'settings', label: 'Settings Boki', icon: <Settings size={14} />, color: '#00f5d4' },
  ];

  const GROUPS: { title: string; color: string; keys: typeof section[] }[] = [
    { title: 'BOKA CORE', color: '#00f5d4', keys: ['rituals', 'summary', 'soul', 'improvements'] },
    { title: 'PAMIĘĆ', color: '#a855f7', keys: ['search'] },
    { title: 'AUTOMATYZACJA', color: '#a855f7', keys: ['reflection'] },
    { title: 'USTAWIENIA BOKI', color: '#00f5d4', keys: ['settings'] },
  ];

  const tabMap = new Map(TABS.map(t => [t.key, t]));

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ─────────── SIDE MENU ─────────── */}
      <aside className="w-64 shrink-0 border-r border-[#383850] bg-[#181828] flex flex-col">
        <div className="p-2 border-b border-[#383850]">
          <h2 className="font-pixel text-xs" style={{ color: '#6ec6e7' }}>UMYSŁ BOKA</h2>
          <div className="text-[9px] text-[#8888aa] font-mono mt-1">v0.3.19 · {TABS.length} modułów</div>
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
                        ? 'bg-[#a855f7]/15 text-[#e8e8f5] border-[#a855f7]'
                        : 'text-[#8888aa] border-transparent hover:bg-[#252535] hover:text-[#e8e8f5]'
                    }`}
                    style={active ? { color: t.color, borderWhatlor: t.color, backgroundWhatlor: `${t.color}1a` } : undefined}
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
          Rytuały · Podsumowania<br />
          Dusza · Sugestie<br />
          Memory Search · Refleksja<br />
          <span className="text-[#5a5a78]">Frameworki AI → zakładka Skills</span>
        </div>
      </aside>

      {/* ─────────── CONTENT ─────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          {section === 'rituals' && <RitualsPanel />}
          {section === 'summary' && <DailySummaryPanel />}
          {section === 'soul' && <SoulPanel />}
          {section === 'improvements' && <ImprovementsPanel />}
          {section === 'search' && <MemorySearchPanel />}
          {section === 'reflection' && <WeeklyReflectionPanel />}
          {section === 'settings' && <SettingsTab />}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SKILLS TAB — frameworki AI przeniesione z InsightsTab (v0.3.19)
//   • Memory: Vector (Qdrant), Mem0, Ingestion (LlamaIndex), GraphRAG
//   • Agents: DeepAgents (Plany), AutoGen (Multi-Agent), Guardrails
//   • Zespół: Crew (CrewAI), Sandbox (OpenHands), Presence (Isaac ROS)
// Każdy skill ma własny panel z demo-endpointem.
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// SKILLS TAB + 10 sub-panels extracted to:
// src/components/tabs/skills-tab.tsx (P0.2 refactoring)
// ═══════════════════════════════════════════════════════════

function WeeklyReflectionPanel() {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ at: string; ok: boolean; durationMs: number } | null>(null);
  const [nextRun, setNextRun] = useState<string>('');
  const [autoScheduled, setAutoScheduled] = useState(true);
  const [stats, setStats] = useState<any>(null);

  // ── Load last-run info from localStorage + compute next Sunday 04:00 ──
  useEffect(() => {
    try {
      const stored = localStorage.getItem('boka.weeklyReflection.lastRun');
      if (stored) setLastRun(JSON.parse(stored));
    } catch {}

    const now = new Date();
    const next = new Date(now);
    next.setDate(now.getDate() + ((7 - now.getDay()) % 7 || 7)); // next Sunday
    next.setHours(4, 0, 0, 0);
    setNextRun(next.toLocaleString('pl-PL'));

    // Load stats
    fetch('/api/cron/weekly-reflection').then(r => r.json()).then(setStats).catch(() => {});

    // ── Auto-scheduler: check every 5 min if we're at Sunday 04:00 ±15min and not yet run this week ──
    if (!autoScheduled) return;
    const checkInterval = setInterval(() => {
      const n = new Date();
      const isSunday = n.getDay() === 0;
      const isTargetTime = n.getHours() === 4 && n.getMinutes() < 15;
      if (!isSunday || !isTargetTime) return;

      // Check if already ran this Sunday
      const stored = localStorage.getItem('boka.weeklyReflection.lastRun');
      let alreadyRan = false;
      if (stored) {
        try {
          const last = JSON.parse(stored);
          const lastDate = new Date(last.at);
          const lastSunday = new Date(n);
          lastSunday.setHours(0, 0, 0, 0);
          if (lastDate > lastSunday) alreadyRan = true;
        } catch {}
      }
      if (!alreadyRan) {
        console.log('[weekly-reflection] auto-triggering Sunday 04:00 run');
        runReflection(true);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(checkInterval);
  }, [autoScheduled]);

  const runReflection = async (auto = false) => {
    setRunning(true); setError(null); setLogs([]); setResult(null);
    const startedAt = new Date().toISOString();
    console.log(`[weekly-reflection] ${auto ? 'auto' : 'manual'} run starting at ${startedAt}`);

    try {
      const res = await fetch('/api/cron/weekly-reflection', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setResult(data);
      setLogs(data.log || []);
      const runInfo = { at: startedAt, ok: true, durationMs: data.durationMs };
      setLastRun(runInfo);
      try { localStorage.setItem('boka.weeklyReflection.lastRun', JSON.stringify(runInfo)); } catch {}

      // Refresh stats
      fetch('/api/cron/weekly-reflection').then(r => r.json()).then(setStats).catch(() => {});
    } catch (e: any) {
      setError(e.message);
      const runInfo = { at: startedAt, ok: false, durationMs: 0 };
      setLastRun(runInfo);
      try { localStorage.setItem('boka.weeklyReflection.lastRun', JSON.stringify(runInfo)); } catch {}
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div>
 <h3 className="text-xs font-mono text-[#a855f7]"> Refleksja Whattygodniowa</h3>
          <p className="text-[10px] text-[#8888aa] mt-1">
            Cron <span className="font-mono text-[#ffd93d]">0 4 * * 0</span> — niedziela 04:00.
            Pipeline: GraphRAG rebuild → Supermemory (auto-profile per member) → CrewAI (Manager evaluation).
          </p>
        </div>
        <button
          onClick={() => runReflection(false)}
          disabled={running}
          className="text-[10px] px-3 py-2 bg-[#f472b6]/10 text-[#a855f7] border border-[#f472b6]/30  disabled:opacity-50"
        >
          {running ? '⟳ Trwa...' : '▶ Run teraz'}
        </button>
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
        <div className="bg-[#181828] border border-[#383850]  p-2">
          <div className="text-[9px] text-[#8888aa] font-mono">Następny auto-run</div>
          <div className="text-[10px] text-[#a855f7] font-mono mt-0.5">{nextRun}</div>
        </div>
        <div className="bg-[#181828] border border-[#383850]  p-2">
          <div className="text-[9px] text-[#8888aa] font-mono">Ostatni run</div>
          <div className="text-[10px] text-[#e8e8f5] font-mono mt-0.5">
            {lastRun ? `${new Date(lastRun.at).toLocaleString('pl-PL')} (${(lastRun.durationMs/1000).toFixed(0)}s)` : '—'}
          </div>
          {lastRun && (
            <div className={`text-[9px] font-mono mt-0.5 ${lastRun.ok ? 'text-[#4ade80]' : 'text-[#ff6b6b]'}`}>
 {lastRun.ok ?' sukces' :' błąd'}
            </div>
          )}
        </div>
        <div className="bg-[#181828] border border-[#383850]  p-2">
          <div className="text-[9px] text-[#8888aa] font-mono">Auto-scheduler</div>
          <label className="flex items-center gap-1 mt-0.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScheduled}
              onChange={e => setAutoScheduled(e.target.checked)}
              className="w-3 h-3"
            />
            <span className="text-[10px] text-[#e8e8f5] font-mono">
              {autoScheduled ? 'włączony' : 'wyłączony'}
            </span>
          </label>
        </div>
        <div className="bg-[#181828] border border-[#383850]  p-2">
          <div className="text-[9px] text-[#8888aa] font-mono">Stats (24h)</div>
          <div className="text-[10px] text-[#e8e8f5] font-mono mt-0.5">
            {stats?.last24h ? (
              <>
                C:{stats.last24h.newWhatmmunities} R:{stats.last24h.profileRevisions} E:{stats.last24h.crewEvaluations}
              </>
            ) : '—'}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-[10px] text-[#ff6b6b] bg-[#ff6b6b]/5 p-2  border border-[#ff6b6b]/30">
 {error}
        </div>
      )}

      {/* Result summary */}
      {result && (
        <div className="bg-[#181828] border border-[#383850]  p-2 space-y-2">
 <div className="text-[10px] font-mono text-[#4ade80]"> Refleksja zakończona ({(result.durationMs/1000).toFixed(1)}s, {result.families} rodzin)</div>
          {result.results?.map((f: any, i: number) => (
            <div key={i} className="border-t border-[#383850] pt-2 mt-1 space-y-1">
              <div className="text-[10px] font-mono text-[#ffd93d]">Family {f.familyId}</div>
              <div className="grid grid-cols-3 gap-0 text-[10px] font-mono">
                <div>
                  <div className="text-[#8888aa]">GraphRAG</div>
                  <div className="text-[#e8e8f5]">
 {f.stages.graphrag?.error ?'' : `E:${f.stages.graphrag?.entitiesProcessed || 0} C:${f.stages.graphrag?.communitiesCreated || 0}`}
                  </div>
                </div>
                <div>
                  <div className="text-[#8888aa]">Supermemory</div>
                  <div className="text-[#e8e8f5]">
 {f.stages.supermemory?.error ?'' : `${f.stages.supermemory?.membersProcessed || 0} profili`}
                  </div>
                </div>
                <div>
                  <div className="text-[#8888aa]">CrewAI</div>
                  <div className="text-[#e8e8f5]">
 {f.stages.crew?.error ?'' : `${f.stages.crew?.membersProcessed || 0} eval`}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div>
          <div className="text-[10px] text-[#8888aa] font-mono mb-1">Logi ({logs.length})</div>
          <div className="bg-[#181828] border border-[#383850]  p-2 max-h-60 overflow-y-auto space-y-0.5">
            {logs.map((l, i) => (
              <div key={i} className="text-[10px] font-mono text-[#8888aa]">
 {l.includes('') ? <span className="text-[#4ade80]">{l}</span> :
 l.includes('') ? <span className="text-[#ff6b6b]">{l}</span> :
                 l.includes('FAILED') ? <span className="text-[#ff6b6b]">{l}</span> :
                 l.includes('══') ? <span className="text-[#a855f7]">{l}</span> :
                 l}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Setup instructions */}
      <div className="bg-[#181828] border border-[#383850]  p-2">
 <div className="text-[10px] font-mono text-[#a855f7] mb-1"> Konfiguracja external cron (opcjonalnie)</div>
        <pre className="text-[9px] font-mono text-[#8888aa] whitespace-pre-wrap">
{`# Linux crontab (systemd timer / cron):
0 4 * * 0 curl -X POST http://localhost:3000/api/cron/weekly-reflection \\
  -H "X-BOKA-CRON: $BOKA_CRON_SECRET"

# Windows Task Scheduler (niedziela 04:00):
cmd /c "curl -X POST http://localhost:3000/api/cron/weekly-reflection -H \\"X-BOKA-CRON: secret\\""

# Lub zostaw auto-scheduler (powyżej) — wyzwoli się sam gdy BOKA jest włączona w niedzielę 04:00.`}
        </pre>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MEMORY SEARCH PANEL — zaawansowane wyszukiwanie z /api/memory/search
// Tryby: text search (q=) oraz smart recall (mode=recall)
// Filtry: memberId, domain, emotion
// ═══════════════════════════════════════════════════════════
function MemorySearchPanel() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'search' | 'recall'>('search');
  const [memberId, setMemberId] = useState('');
  const [domain, setDomain] = useState('');
  const [emotion, setEmotion] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const DOMAINS = ['general', 'child_culture', 'education', 'finance', 'legal', 'health', 'food', 'hobby', 'social', 'family', 'work'];
  const EMOTIONS = ['happy', 'calm', 'curious', 'playful', 'focused', 'tired', 'concerned', 'excited', 'reflective', 'neutral', 'sad', 'angry'];

  const run = async () => {
    setLoading(true); setError(null); setResults(null);
    try {
      const params = new URLSearchParams();
      if (mode === 'recall') {
        params.set('mode', 'recall');
        if (memberId) params.set('memberId', memberId);
        if (emotion) params.set('emotion', emotion);
      } else {
        if (!query.trim()) { setError('Podaj zapytanie (q)'); setLoading(false); return; }
        params.set('q', query.trim());
        if (memberId) params.set('memberId', memberId);
        if (domain) params.set('domain', domain);
        if (emotion) params.set('emotion', emotion);
      }
      const r = await fetch(`/api/memory/search?${params.toString()}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error wyszukiwania');
      setResults(data.results || []);
    } catch (e: any) {
      setError(e.message || 'Noznany błąd');
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-[#252535] border border-[#383850]  p-4 space-y-2">
      {/* Mode toggle */}
      <div className="flex items-center gap-0">
        <span className="text-xs font-mono text-[#8888aa]">Tryb:</span>
        <button
          onClick={() => setMode('search')}
          className={`px-3 py-1  text-xs font-mono ${mode === 'search' ? 'bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/50' : 'bg-[#181828] text-[#8888aa] border border-[#383850]'}`}
        >
          <Search size={10} className="inline mr-1" />Text search
        </button>
        <button
          onClick={() => setMode('recall')}
          className={`px-3 py-1  text-xs font-mono ${mode === 'recall' ? 'bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/50' : 'bg-[#181828] text-[#8888aa] border border-[#383850]'}`}
        >
          <Brain size={10} className="inline mr-1" />Smart recall (scoring)
        </button>
      </div>

      {/* Query row */}
      {mode === 'search' && (
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder='Search w pamięci BOKA... (np. wczorajszy obiad, projekt React)'
          className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#a855f7]/50 font-mono"
        />
      )}

      {/* Filters */}
      <div className="grid grid-cols-3 gap-0">
        <div>
          <label className="text-[10px] text-[#8888aa] font-mono">Member</label>
          <input
            type="text"
            value={memberId}
            onChange={e => setMemberId(e.target.value)}
            placeholder="(wszyscy)"
            className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#8888aa] font-mono">Domain</label>
          <select value={domain} onChange={e => setDomain(e.target.value)}
            className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono">
            <option value="">(wszystkie)</option>
            {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-[#8888aa] font-mono">Emotion</label>
          <select value={emotion} onChange={e => setEmotion(e.target.value)}
            className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] font-mono">
            <option value="">(dowolna)</option>
            {EMOTIONS.map(em => <option key={em} value={em}>{em}</option>)}
          </select>
        </div>
      </div>

      {/* Run */}
      <button
        onClick={run}
        disabled={loading || (mode === 'search' && !query.trim())}
        className="px-4 py-2 bg-[#a855f7]/15 text-[#a855f7] border border-[#a855f7]/30  text-xs font-mono disabled:opacity-50 flex items-center gap-0"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
        {mode === 'recall' ? 'Przywołaj wspomnienia' : 'Search'}
      </button>

      {/* Error */}
      {error && (
        <div className="text-xs text-[#ff6b6b] bg-[#ff6b6b]/10 border border-[#ff6b6b]/30  p-2 font-mono">
          {error}
        </div>
      )}

      {/* Results */}
      {results !== null && (
        <div className="space-y-2">
          <div className="text-[10px] text-[#8888aa] font-mono">{results.length} wyników</div>
          {results.length === 0 ? (
            <div className="text-xs text-[#8888aa] p-4 bg-[#181828]  text-center">
              No results. {mode === 'recall' ? 'Memory BOKA jest pusta lub brak pasującego kontekstu emocjonalnego.' : 'Spróbuj innej frazy.'}
            </div>
          ) : results.map((r, i) => (
            <div key={r.id || i} className="bg-[#181828] border border-[#383850]  p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[#a855f7] font-mono uppercase">{r.type || r.entryTypee || 'memory'}</span>
                <div className="flex items-center gap-0">
                  {r.score !== undefined && (
                    <span className="text-[10px] text-[#4ade80] font-mono">score: {typeof r.score === 'number' ? r.score.toFixed(2) : r.score}</span>
                  )}
                  <span className="text-[9px] text-[#8888aa]">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</span>
                </div>
              </div>
              <div className="text-xs text-[#e8e8f5]">
                {r.title && <div className="font-mono mb-1">{r.title}</div>}
                <div className="text-[#8888aa] whitespace-pre-wrap">
                  {(r.content || r.summary || r.text || '').slice(0, expanded === (r.id || String(i)) ? undefined : 240)}
                  {(r.content || r.summary || r.text || '').length > 240 && (
                    <button
                      onClick={() => setExpanded(expanded === (r.id || String(i)) ? null : (r.id || String(i)))}
                      className="ml-1 text-[#00f5d4] underline"
                    >
                      {expanded === (r.id || String(i)) ? 'mniej' : 'więcej'}
                    </button>
                  )}
                </div>
              </div>
              {/* Tags */}
              {(r.tags || (r.domain && [r.domain])) && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {(r.tags || (r.domain ? [r.domain] : [])).map((t: string, j: number) => (
                    <span key={j} className="text-[9px] px-1.5 py-0.5 bg-[#252535] border border-[#383850]  text-[#8888aa] font-mono">#{t}</span>
                  ))}
                </div>
              )}
              {/* Emotion */}
              {r.emotion && (
                <div className="text-[9px] text-[#ffd93d] font-mono mt-1">nastrój: {r.emotion}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MemoryTab({ entries, members, activeMemberId, familyId }: {
  entries: MemoryEntry[];
  members: FamilyMember[];
  activeMemberId: string | null;
  familyId: string | null;
}) {
  // v0.3.19 — merged Umysł BOKA sections into Memory tab with sidebar
  const [section, setSection] = useState<'memory' | 'rituals' | 'summary' | 'soul' | 'improvements' | 'search' | 'reflection' | 'settings'>('memory');

  const SIDEBAR_ITEMS: { key: typeof section; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'memory', label: 'BOKA Memory', icon: <Activity size={14} />, color: '#00f5d4' },
    { key: 'rituals', label: 'Rytuały', icon: <Clock size={14} />, color: '#00f5d4' },
    { key: 'summary', label: 'Summary dnia', icon: <BookOpen size={14} />, color: '#00f5d4' },
    { key: 'soul', label: 'Dusza BOKA', icon: <Brain size={14} />, color: '#00f5d4' },
    { key: 'improvements', label: 'Propozycje BOKA', icon: <Sparkles size={14} />, color: '#00f5d4' },
    { key: 'search', label: 'Memory Search', icon: <Search size={14} />, color: '#a855f7' },
    { key: 'reflection', label: 'Refleksja (Cron)', icon: <Calendar size={14} />, color: '#a855f7' },
    { key: 'settings', label: 'Settings BOKI', icon: <Settings size={14} />, color: '#00f5d4' },
  ];

  const GROUPS: { title: string; color: string; keys: typeof section[] }[] = [
    { title: 'PAMIĘĆ', color: '#00f5d4', keys: ['memory'] },
    { title: 'BOKA CORE', color: '#00f5d4', keys: ['rituals', 'summary', 'soul', 'improvements'] },
    { title: 'WYSZUKIWANIE', color: '#a855f7', keys: ['search'] },
    { title: 'AUTOMATYZACJA', color: '#a855f7', keys: ['reflection'] },
    { title: 'USTAWIENIA', color: '#00f5d4', keys: ['settings'] },
  ];

  const itemMap = new Map(SIDEBAR_ITEMS.map(t => [t.key, t]));

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ─────────── SIDE MENU ─────────── */}
      <aside className="w-64 shrink-0 border-r border-[#383850] bg-[#181828] flex flex-col">
        <div className="p-2 border-b border-[#383850]">
          <h2 className="font-pixel text-xs" style={{ color: '#4ade80' }}>PAMIĘĆ</h2>
          <div className="text-[9px] text-[#8888aa] font-mono mt-1">v0.3.19 · {SIDEBAR_ITEMS.length} modułów</div>
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
                const t = itemMap.get(key);
                if (!t) return null;
                const active = section === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSection(key)}
                    className={`w-full text-left px-3 py-1.5 text-[11px] font-mono transition-all border-l-2 flex items-center gap-0 ${
                      active
                        ? 'bg-[#00f5d4]/15 text-[#e8e8f5] border-[#00f5d4]'
                        : 'text-[#8888aa] border-transparent hover:bg-[#252535] hover:text-[#e8e8f5]'
                    }`}
                    style={active ? { color: t.color, borderWhatlor: t.color, backgroundWhatlor: `${t.color}1a` } : undefined}
                  >
                    <span className="w-4 flex justify-center shrink-0" style={{ color: active ? t.color : undefined }}>{t.icon}</span>
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ─────────── CONTENT ─────────── */}
      <div className="flex-1 overflow-y-auto">
        {section === 'memory' && <MemoryPanel entries={entries} members={members} activeMemberId={activeMemberId} familyId={familyId} />}
        {section === 'rituals' && <RitualsPanel />}
        {section === 'summary' && <DailySummaryPanel />}
        {section === 'soul' && <SoulPanel />}
        {section === 'improvements' && <ImprovementsPanel />}
        {section === 'search' && <MemorySearchPanel />}
        {section === 'reflection' && <WeeklyReflectionPanel />}
        {section === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MEMORY PANEL — extracted from old MemoryTab (graph + list + search)
// ═══════════════════════════════════════════
function MemoryPanel({ entries, members, activeMemberId, familyId }: {
  entries: MemoryEntry[];
  members: FamilyMember[];
  activeMemberId: string | null;
  familyId: string | null;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [graphDate, setGraphDate] = useState<{ nodes: any[]; edges: any[]; stats: any } | null>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [smartMode, setSmartMode] = useState(false);
  const [smartResults, setSmartResults] = useState<any[] | null>(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);

  useEffect(() => {
    if (!smartMode) { setSmartResults(null); setSmartError(null); return; }
    if (!searchQuery.trim() && memberFilter === 'all') { setSmartResults(null); return; }
    setSmartLoading(true);
    setSmartError(null);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (memberFilter !== 'all') params.set('memberId', memberFilter);
        if (filter !== 'all') params.set('domain', filter);
        if (!searchQuery.trim()) params.set('mode', 'recall');
        const res = await fetch(`/api/memory/search?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSmartResults(data.results || []);
      } catch (e: any) {
        setSmartError(e?.message || 'Error wyszukiwania');
        setSmartResults([]);
      } finally {
        setSmartLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [smartMode, searchQuery, memberFilter, filter]);

  useEffect(() => {
    if (viewMode !== 'graph') return;
    let cancelled = false;
    setGraphLoading(true);
    const params = new URLSearchParams();
    if (familyId) params.set('familyId', familyId);
    if (memberFilter !== 'all') params.set('memberId', memberFilter);
    const qs = params.toString();
    fetch(`/api/memory/graph${qs ? `?${qs}` : ''}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        if (!cancelled) {
          setGraphDate({ nodes: Array.isArray(data?.nodes) ? data.nodes : [], edges: Array.isArray(data?.edges) ? data.edges : [], stats: data?.stats || {} });
          setGraphLoading(false);
        }
      })
      .catch((e) => { if (!cancelled) { setGraphDate({ nodes: [], edges: [], stats: {} }); setGraphLoading(false); } });
    return () => { cancelled = true; };
  }, [viewMode, memberFilter, familyId]);

  let filtered = filter === 'all' ? entries : entries.filter(e => e.domain === filter || e.entryTypee === filter);
  if (memberFilter !== 'all') filtered = filtered.filter(e => e.memberId === memberFilter);
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(e =>
      e.content.toLowerCase().includes(q) ||
      (e.title && e.title.toLowerCase().includes(q)) ||
      (Array.isArray(e.tags) && e.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  const domainWhatlors: Record<string, string> = {
    general: '#6b6b8d', child_culture: '#ffd93d', education: '#a855f7',
    finance: '#4ade80', legal: '#6ec6e7', health: '#ff6b6b',
    food: '#f472b6', hobby: '#00f5d4', semantic: '#00f5d4', episodic: '#a855f7',
  };

  const [graphWidth, setGraphWidth] = useState(600);
  const graphWhatntainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!graphWhatntainerRef.current) return;
    const ro = new ResizeObserver(entries => { for (const e of entries) setGraphWidth(e.contentRect.width); });
    ro.observe(graphWhatntainerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="p-4">
      <div className="max-w-4xl mx-auto">
        <BokaInsights />
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-pixel text-sm" style={{ color: '#4ade80' }}>PAMIĘĆ BOKI</h2>
          <div className="flex items-center gap-0">
            <div className="flex items-center gap-0 text-xs text-[#8888aa] font-mono">
              <Activity size={12} className="text-[#00f5d4]" />
              <span>{entries.length} wpisów</span>
            </div>
            <div className="flex items-center bg-[#252535] border border-[#383850] overflow-hidden">
              <button onClick={() => setViewMode('graph')} className={`px-2 py-1 text-xs font-mono flex items-center gap-1 transition-colors ${viewMode === 'graph' ? 'bg-[#00f5d4]/15 text-[#00f5d4]' : 'text-[#8888aa] hover:text-[#e8e8f5]'}`}>
                <Network size={12} /> Graph
              </button>
              <button onClick={() => setViewMode('list')} className={`px-2 py-1 text-xs font-mono flex items-center gap-1 transition-colors ${viewMode === 'list' ? 'bg-[#00f5d4]/15 text-[#00f5d4]' : 'text-[#8888aa] hover:text-[#e8e8f5]'}`}>
                <List size={12} /> List
              </button>
            </div>
          </div>
        </div>

        <div className="mb-2">
          <div className="flex gap-0 items-center">
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder={smartMode ? "Smart recall — server-side wyszukiwanie z scoringiem..." : "Search BOKA memory (lokalny filtr)..."}
              className="flex-1 bg-[#252535] border border-[#383850] px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#00f5d4]/50 font-mono"
            />
            <button onClick={() => setSmartMode(v => !v)}
              className={`px-3 py-2 text-xs font-mono border flex items-center gap-1.5 whitespace-nowrap transition-all ${smartMode ? 'bg-[#a855f7]/15 border-[#a855f7]/50 text-[#a855f7]' : 'bg-[#252535] border-[#383850] text-[#8888aa] hover:text-[#a855f7] hover:border-[#a855f7]/30'}`}
              title="Smart Recall używa /api/memory/search — scoring semantyczny, ważność, świeżość, emocje"
            >
              <Sparkles size={12} /> Smart{smartMode ? '' : ''}
            </button>
          </div>
          <div className="flex items-center gap-0 mt-2">
            <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)}
              className="bg-[#252535] border border-[#383850] text-xs text-[#e8e8f5] px-2 py-1 font-mono">
              <option value="all">Wszyscy</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="bg-[#252535] border border-[#383850] text-xs text-[#e8e8f5] px-2 py-1 font-mono">
              <option value="all">All domeny</option>
              <option value="semantic">Semantyczne</option>
              <option value="episodic">Epizodyczne</option>
              <option value="general">Ogólne</option>
              <option value="finance">Finanse</option>
              <option value="education">Edukacja</option>
              <option value="health">Zdrowie</option>
              <option value="food">Jedzenie</option>
              <option value="hobby">Hobby</option>
            </select>
          </div>
        </div>

        {smartMode && smartLoading && (
          <div className="text-center py-4 text-[#a855f7] text-xs font-mono animate-pulse">Smart Recall — szukam z scoringiem...</div>
        )}
        {smartMode && smartError && (
          <div className="p-2 bg-[#ff6b6b]/10 border border-[#ff6b6b]/20 text-[#ff6b6b] text-xs font-mono mb-2">{smartError}</div>
        )}

        {viewMode === 'graph' ? (
          <div ref={graphWhatntainerRef} className="bg-[#12121c] border border-[#383850] overflow-hidden" style={{ height: 400 }}>
            {graphLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-[#8888aa] font-mono text-sm flex items-center gap-0">
                  <Activity size={14} className="animate-spin" /> Loading grafu...
                </div>
              </div>
            ) : graphDate && Array.isArray(graphDate.nodes) && graphDate.nodes.length > 0 ? (
              <MemoryGraph nodes={graphDate.nodes} edges={graphDate.edges} width={graphWidth} height={400} />
            ) : (
              <div className="flex items-center justify-center h-full text-[#5a5a78] text-xs font-mono">No data grafu — dodaj wspomnienia aby zobaczyć połączenia</div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {smartMode && !smartLoading && smartResults && smartResults.length === 0 && (
              <div className="text-center py-4 text-[#8888aa] text-xs font-mono">No results Smart Recall</div>
            )}
            {smartMode && !smartLoading && smartResults && smartResults.length > 0 && (
              <div className="mb-2 p-2 bg-[#a855f7]/5 border border-[#a855f7]/20">
                <div className="text-[9px] font-mono text-[#a855f7] mb-1">{smartResults.length} wyników z /api/memory/search — sortowane wg score</div>
                {smartResults.map((r: any, i: number) => (
                  <div key={i} className="p-2 mb-1 bg-[#252535] border border-[#383850]">
                    <div className="flex items-center gap-0 text-[9px] font-mono text-[#8888aa] mb-0.5">
                      <span className="text-[#a855f7]">score: {r.score?.toFixed(2) || '?'}</span>
                      {r.domain && <span> · {r.domain}</span>}
                      {r.tags && Array.isArray(r.tags) && r.tags.length > 0 && (
                        <span className="ml-auto flex gap-0">
                          {r.tags.map((tag: string, j: number) => <span key={j} className="text-[8px] px-1 bg-[#2a2a3a]">{tag}</span>)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#e8e8f5] font-mono">{r.content?.substring(0, 200)}{r.content?.length > 200 ? '...' : ''}</div>
                  </div>
                ))}
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-[#8888aa] text-sm font-mono">None wspomnień spełniających kryteria</div>
            ) : (
              filtered.map(entry => (
                <div key={entry.id} className="p-2 bg-[#252535] border border-[#383850]">
                  <div className="flex items-center gap-0 text-[9px] font-mono text-[#8888aa] mb-0.5">
                    <span style={{ color: domainWhatlors[entry.domain || 'general'] || '#6b6b8d' }}>{entry.domain || 'general'}</span>
                    <span> · {entry.entryTypee}</span>
                    <span className="ml-auto">{new Date(entry.createdAt).toLocaleDateString('pl-PL')}</span>
                  </div>
                  <div className="text-xs text-[#e8e8f5] font-mono">{entry.content}</div>
                  {entry.tags && Array.isArray(entry.tags) && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-0 mt-1">
                      {entry.tags.map((tag, j) => <span key={j} className="text-[8px] px-1 bg-[#2a2a3a] text-[#8888aa]">{tag}</span>)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}



// ═══════════════════════════════════════════
// PROFILES TAB
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// PROFILES TAB extracted to:
// src/components/tabs/profiles-tab.tsx (P0.2 refactoring)
// ═══════════════════════════════════════════════════════════

export function VaultTab() {
  const [notes, setNotes] = useState<VaultNoteDate[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedNote, setSelectedNote] = useState<VaultNoteDate | null>(null);
  const [noteFilter, setNoteFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [backlinks, setBacklinks] = useState<VaultNoteDate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingWhatntent, setEditingWhatntent] = useState('');
  const [showGraph, setShowGraph] = useState(false);

  const noteTypeeLabels: Record<string, { label: string; color: string }> = {
    daily: { label: 'Daily Note', color: '#ffd93d' },
    note: { label: 'Note', color: '#00f5d4' },
    canvas: { label: 'Canvas', color: '#a855f7' },
    person: { label: 'Osoba', color: '#4ade80' },
    topic: { label: 'Topic', color: '#6ec6e7' },
    dream: { label: 'Sen', color: '#a855f7' },
    story: { label: 'Historia', color: '#a855f7' },
    ritual: { label: 'Rytuał', color: '#f97316' },
  };

  useEffect(() => {
    loadNotes();
  }, [noteFilter, searchQuery]);

  async function loadNotes() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (noteFilter !== 'all') params.set('type', noteFilter);
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/vault?${params}`);
      if (!res.ok) { setIsLoading(false); return; }
      const data = await res.json();
      setNotes(data.notes || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('Failed to load vault:', e);
    }
    setIsLoading(false);
  }

  async function selectNote(note: VaultNoteDate) {
    setSelectedNote(note);
    setEditingWhatntent(note.content);
    try {
      const res = await fetch(`/api/vault?id=${note.id}`);
      if (res.ok) {
        const data = await res.json();
        setBacklinks(data.backlinks || []);
      }
    } catch { /* skip */ }
  }

  async function saveNote() {
    if (!selectedNote) return;
    try {
      await fetch('/api/vault', {
        method: 'PUT',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({ id: selectedNote.id, content: editingWhatntent }),
      });
      loadNotes();
    } catch (e) {
      console.error('Failed to save note:', e);
    }
  }

  async function createDailyNote() {
    try {
      const res = await fetch('/api/vault?action=daily', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data.note) selectNote(data.note);
        loadNotes();
      }
    } catch (e) {
      console.error('Failed to create daily note:', e);
    }
  }

  async function createNote() {
    const title = prompt('Tytuł notatki:');
    if (!title) return;
    try {
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({ title, content: `# ${title}\n\n`, noteTypee: 'note' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.note) selectNote(data.note);
        loadNotes();
      }
    } catch (e) {
      console.error('Failed to create note:', e);
    }
  }

  async function deleteNote(id: string) {
    if (!confirm('Usunąć notatkę?')) return;
    try {
      await fetch(`/api/vault?id=${id}`, { method: 'DELETE' });
      if (selectedNote?.id === id) setSelectedNote(null);
      loadNotes();
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  }

  // Render wikilinks in content as clickable spans
  function renderWhatntent(text: string) {
    const parts = text.split(/(\[\[[^\]]+\]\])/g);
    return parts.map((part, i) => {
      const wikilinkMatch = part.match(/^\[\[([^\]]+)\]\]$/);
      if (wikilinkMatch) {
        return <span key={i} className="text-[#6ec6e7] underline cursor-pointer hover:text-[#6ec6e7]">{wikilinkMatch[1]}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-pixel text-sm" style={{ color: '#ffd93d' }}>VAULT — NOTATKI BOKI</h2>
          <div className="flex items-center gap-0">
            <button onClick={createDailyNote} className="px-3 py-1.5  bg-[#ffd93d]/10 border border-[#ffd93d]/30 text-[#ffd93d] text-xs font-mono hover:bg-[#ffd93d]/20 transition-all">
              + Daily Note
            </button>
            <button onClick={createNote} className="px-3 py-1.5  bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4] text-xs font-mono hover:bg-[#00f5d4]/20 transition-all">
              + Nowa
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-0 mb-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#8888aa]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search w notatkach..."
              className="w-full bg-[#252535] border border-[#383850]  pl-8 pr-3 py-1.5 text-xs text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#ffd93d]/50 font-mono"
            />
          </div>
          <select
            value={noteFilter}
            onChange={e => setNoteFilter(e.target.value)}
            className="bg-[#252535] border border-[#383850]  px-2 py-1.5 text-xs text-[#e8e8f5] focus:outline-none focus:border-[#ffd93d]/50 font-mono"
          >
            <option value="all">All</option>
            <option value="daily">Daily Notes</option>
            <option value="person">Osoby</option>
            <option value="note">Notes</option>
            <option value="topic">Topicy</option>
            <option value="dream">Sny</option>
            <option value="story">Historie</option>
            <option value="ritual">Rytuały</option>
          </select>
        </div>

        {/* Two-column layout: list | editor */}
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-0">
          {/* Notes list */}
          <div className="space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-8 text-[#8888aa] text-xs font-mono">Loading...</div>
            ) : notes.length === 0 ? (
              <div className="text-center py-8 text-[#8888aa] text-xs font-mono">None notatek. Stwórz Daily Note!</div>
            ) : (
              notes.map(note => {
                const typeInfo = noteTypeeLabels[note.noteTypee] || { label: note.noteTypee, color: '#6b6b8d' };
                const isSelected = selectedNote?.id === note.id;
                return (
                  <button
                    key={note.id}
                    onClick={() => selectNote(note)}
                    className={`w-full text-left p-2.5  border transition-all ${
                      isSelected
                        ? 'bg-[#ffd93d]/10 border-[#ffd93d]/30'
                        : 'bg-[#252535] border-[#383850] hover:border-[#ffd93d]/20'
                    }`}
                  >
                    <div className="flex items-center gap-0 mb-1">
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundWhatlor: typeInfo.color + '20', color: typeInfo.color }}>
                        {typeInfo.label}
                      </span>
 {note.isPinned && <span className="text-[9px] text-[#ffd93d]"></span>}
                      <span className="text-[8px] text-[#8888aa] font-mono ml-auto">{new Date(note.updatedAt).toLocaleDateString('pl-PL')}</span>
                    </div>
                    <div className="text-xs text-[#e8e8f5] font-mono truncate">{note.title}</div>
                    {note.emotion && (
                      <div className="text-[9px] text-[#8888aa] font-mono mt-0.5">emocja: {note.emotion}</div>
                    )}
                  </button>
                );
              })
            )}
            <div className="text-[9px] text-[#8888aa] font-mono text-center mt-2">{total} notatek</div>
          </div>

          {/* Note editor / viewer */}
          <div className="min-h-[400px]">
            {selectedNote ? (
              <div className="bg-[#252535] border border-[#383850]  overflow-hidden">
                {/* Note header */}
                <div className="px-4 py-2 border-b border-[#383850] flex items-center justify-between">
                  <div className="flex items-center gap-0">
                    <span className="text-sm text-[#e8e8f5] font-mono">{selectedNote.title}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
                      backgroundWhatlor: (noteTypeeLabels[selectedNote.noteTypee]?.color || '#6b6b8d') + '20',
                      color: noteTypeeLabels[selectedNote.noteTypee]?.color || '#6b6b8d'
                    }}>
                      {noteTypeeLabels[selectedNote.noteTypee]?.label || selectedNote.noteTypee}
                    </span>
                  </div>
                  <div className="flex items-center gap-0">
                    <button onClick={saveNote} className="px-2 py-1  bg-[#00f5d4]/10 text-[#00f5d4] text-[10px] font-mono hover:bg-[#00f5d4]/20">Save</button>
                    <button onClick={() => deleteNote(selectedNote.id)} className="px-2 py-1  bg-[#ff6b6b]/10 text-[#ff6b6b] text-[10px] font-mono hover:bg-[#ff6b6b]/20">Delete</button>
                  </div>
                </div>

                {/* Frontmatter preview */}
                {selectedNote.frontmatter && selectedNote.frontmatter !== '{}' && (
                  <div className="px-4 py-2 bg-[#1a1a28] border-b border-[#383850]">
                    <div className="text-[9px] text-[#8888aa] font-mono mb-1">YAML Frontmatter:</div>
                    <pre className="text-[10px] text-[#ffd93d] font-mono whitespace-pre-wrap">
                      {(() => { try { const fm = JSON.parse(selectedNote.frontmatter); return Object.entries(fm).map(([k,v]) => `${k}: ${JSON.stringify(v)}`).join('\n'); } catch { return selectedNote.frontmatter; } })()}
                    </pre>
                  </div>
                )}

                {/* Whatntent editor */}
                <div className="p-4">
                  <textarea
                    value={editingWhatntent}
                    onChange={e => setEditingWhatntent(e.target.value)}
                    className="w-full bg-[#181828] border border-[#383850]  p-2 text-xs text-[#e8e8f5] font-mono min-h-[300px] resize-y focus:outline-none focus:border-[#ffd93d]/50"
                    placeholder="Markdown z [[wikilinks]]..."
                  />
                </div>

                {/* Backlinks */}
                {backlinks.length > 0 && (
                  <div className="px-4 py-2 border-t border-[#383850]">
                    <div className="text-[9px] text-[#8888aa] font-mono mb-1">Backlinks ({backlinks.length}):</div>
                    <div className="flex flex-wrap gap-1">
                      {backlinks.map(bl => (
                        <button
                          key={bl.id}
                          onClick={() => selectNote(bl as VaultNoteDate)}
                          className="text-[9px] px-2 py-0.5  bg-[#4a90d9]/10 text-[#6ec6e7] font-mono hover:bg-[#4a90d9]/20"
                        >
                          {bl.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {selectedNote.tags && (() => { try { const t = JSON.parse(selectedNote.tags); return t.length > 0; } catch { return false; } })() && (
                  <div className="px-4 py-2 border-t border-[#383850]">
                    <div className="flex flex-wrap gap-1">
                      {JSON.parse(selectedNote.tags).map((tag: string) => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5  bg-[#8899aa]/10 text-[#8888aa] font-mono">#{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[#8888aa] text-xs font-mono">
                Wybierz notatkę z listy lub stwórz nową
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// VAULT SECTION — embeddable version of VaultTab, shown inside SettingsTab
// ═══════════════════════════════════════════
function VaultSection() {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState<VaultNoteDate[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedNote, setSelectedNote] = useState<VaultNoteDate | null>(null);
  const [noteFilter, setNoteFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [backlinks, setBacklinks] = useState<VaultNoteDate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingWhatntent, setEditingWhatntent] = useState('');

  const noteTypeeLabels: Record<string, { label: string; color: string }> = {
    daily: { label: 'Daily Note', color: '#ffd93d' },
    note: { label: 'Note', color: '#00f5d4' },
    canvas: { label: 'Canvas', color: '#a855f7' },
    person: { label: 'Osoba', color: '#4ade80' },
    topic: { label: 'Topic', color: '#6ec6e7' },
    dream: { label: 'Sen', color: '#a855f7' },
    story: { label: 'Historia', color: '#a855f7' },
    ritual: { label: 'Rytuał', color: '#f97316' },
  };

  useEffect(() => {
    if (expanded) loadNotes();
  }, [expanded, noteFilter, searchQuery]);

  async function loadNotes() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (noteFilter !== 'all') params.set('type', noteFilter);
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/vault?${params}`);
      if (!res.ok) { setIsLoading(false); return; }
      const data = await res.json();
      setNotes(data.notes || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('Failed to load vault:', e);
    }
    setIsLoading(false);
  }

  async function selectNote(note: VaultNoteDate) {
    setSelectedNote(note);
    setEditingWhatntent(note.content);
    try {
      const res = await fetch(`/api/vault?id=${note.id}`);
      if (res.ok) {
        const data = await res.json();
        setBacklinks(data.backlinks || []);
      }
    } catch { /* skip */ }
  }

  async function saveNote() {
    if (!selectedNote) return;
    try {
      await fetch('/api/vault', {
        method: 'PUT',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({ id: selectedNote.id, content: editingWhatntent }),
      });
      loadNotes();
    } catch (e) {
      console.error('Failed to save note:', e);
    }
  }

  async function createDailyNote() {
    try {
      const res = await fetch('/api/vault?action=daily', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data.note) selectNote(data.note);
        loadNotes();
      }
    } catch (e) {
      console.error('Failed to create daily note:', e);
    }
  }

  async function createNote() {
    const title = prompt('Tytuł notatki:');
    if (!title) return;
    try {
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({ title, content: `# ${title}\n\n`, noteTypee: 'note' }),
      });
      if (res.ok) {
        loadNotes();
      }
    } catch (e) {
      console.error('Failed to create note:', e);
    }
  }

  async function deleteNote(id: string) {
    if (!confirm('Usunąć notatkę?')) return;
    try {
      await fetch(`/api/vault?id=${id}`, { method: 'DELETE' });
      if (selectedNote?.id === id) setSelectedNote(null);
      loadNotes();
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  }

  return (
    <div className="mb-6 border border-[#ffd93d]/30  overflow-hidden">
      {/* Header — click to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#252535] hover:bg-[#252535] transition-colors"
      >
        <div className="flex items-center gap-0">
          <BookOpen size={16} className="text-[#ffd93d]" />
          <span className="font-pixel text-xs" style={{ color: '#ffd93d' }}>VAULT — NOTATKI BOKI</span>
          <span className="text-[9px] text-[#8888aa] font-mono">{total} notatek</span>
        </div>
        <span className="text-[#8888aa] text-xs">{expanded ? '▼' : '▶'}</span>
      </button>

      {expanded && (
        <div className="p-2 bg-[#181828]">
          {/* Action buttons */}
          <div className="flex items-center gap-0 mb-2">
            <button onClick={createDailyNote} className="px-3 py-1.5  bg-[#ffd93d]/10 border border-[#ffd93d]/30 text-[#ffd93d] text-xs font-mono hover:bg-[#ffd93d]/20 transition-all">
              + Daily Note
            </button>
            <button onClick={createNote} className="px-3 py-1.5  bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4] text-xs font-mono hover:bg-[#00f5d4]/20 transition-all">
              + Nowa
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-0 mb-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#8888aa]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search w notatkach..."
                className="w-full bg-[#252535] border border-[#383850]  pl-8 pr-3 py-1.5 text-xs text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#ffd93d]/50 font-mono"
              />
            </div>
            <select
              value={noteFilter}
              onChange={e => setNoteFilter(e.target.value)}
              className="bg-[#252535] border border-[#383850]  px-2 py-1.5 text-xs text-[#e8e8f5] focus:outline-none focus:border-[#ffd93d]/50 font-mono"
            >
              <option value="all">All</option>
              <option value="daily">Daily Notes</option>
              <option value="person">Osoby</option>
              <option value="note">Notes</option>
              <option value="topic">Topicy</option>
              <option value="dream">Sny</option>
              <option value="story">Historie</option>
              <option value="ritual">Rytuały</option>
            </select>
          </div>

          {/* Two-column: list | editor */}
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-0">
            {/* Notes list */}
            <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
              {isLoading ? (
                <div className="text-center py-6 text-[#8888aa] text-xs font-mono">Loading...</div>
              ) : notes.length === 0 ? (
                <div className="text-center py-6 text-[#8888aa] text-xs font-mono">None notatek. Stwórz Daily Note!</div>
              ) : (
                notes.map(note => {
                  const typeInfo = noteTypeeLabels[note.noteTypee] || { label: note.noteTypee, color: '#6b6b8d' };
                  const isSelected = selectedNote?.id === note.id;
                  return (
                    <button
                      key={note.id}
                      onClick={() => selectNote(note)}
                      className={`w-full text-left p-2  border transition-all ${
                        isSelected
                          ? 'bg-[#ffd93d]/10 border-[#ffd93d]/30'
                          : 'bg-[#252535] border-[#383850] hover:border-[#ffd93d]/20'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ backgroundWhatlor: typeInfo.color + '20', color: typeInfo.color }}>
                          {typeInfo.label}
                        </span>
 {note.isPinned && <span className="text-[9px] text-[#ffd93d]"></span>}
                        <span className="text-[8px] text-[#8888aa] font-mono ml-auto">{new Date(note.updatedAt).toLocaleDateString('pl-PL')}</span>
                      </div>
                      <div className="text-[11px] text-[#e8e8f5] font-mono truncate">{note.title}</div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Editor / viewer */}
            <div className="min-h-[300px]">
              {selectedNote ? (
                <div className="bg-[#252535] border border-[#383850]  overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#383850] flex items-center justify-between">
                    <div className="flex items-center gap-0">
                      <span className="text-xs text-[#e8e8f5] font-mono">{selectedNote.title}</span>
                      <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{
                        backgroundWhatlor: (noteTypeeLabels[selectedNote.noteTypee]?.color || '#6b6b8d') + '20',
                        color: noteTypeeLabels[selectedNote.noteTypee]?.color || '#6b6b8d'
                      }}>
                        {noteTypeeLabels[selectedNote.noteTypee]?.label || selectedNote.noteTypee}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={saveNote} className="px-2 py-1  bg-[#00f5d4]/10 text-[#00f5d4] text-[10px] font-mono hover:bg-[#00f5d4]/20">Save</button>
                      <button onClick={() => deleteNote(selectedNote.id)} className="px-2 py-1  bg-[#ff6b6b]/10 text-[#ff6b6b] text-[10px] font-mono hover:bg-[#ff6b6b]/20">Delete</button>
                    </div>
                  </div>

                  <div className="p-2">
                    <textarea
                      value={editingWhatntent}
                      onChange={e => setEditingWhatntent(e.target.value)}
                      className="w-full bg-[#181828] border border-[#383850]  p-2 text-xs text-[#e8e8f5] font-mono min-h-[220px] resize-y focus:outline-none focus:border-[#ffd93d]/50"
                      placeholder="Markdown z [[wikilinks]]..."
                    />
                  </div>

                  {backlinks.length > 0 && (
                    <div className="px-3 py-2 border-t border-[#383850]">
                      <div className="text-[9px] text-[#8888aa] font-mono mb-1">Backlinks ({backlinks.length}):</div>
                      <div className="flex flex-wrap gap-1">
                        {backlinks.map(bl => (
                          <button
                            key={bl.id}
                            onClick={() => selectNote(bl as VaultNoteDate)}
                            className="text-[9px] px-2 py-0.5  bg-[#4a90d9]/10 text-[#6ec6e7] font-mono hover:bg-[#4a90d9]/20"
                          >
                            {bl.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[#8888aa] text-xs font-mono py-8">
                  Wybierz notatkę z listy lub stwórz nową
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// SETTINGS TAB + GgufSettings extracted to:
// src/components/tabs/settings-tab.tsx (P0.2 refactoring)
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// APPS TAB + ModelTestLab + MarketplaceSection + DesktopAgentView extracted to:
// src/components/tabs/apps-tab.tsx (P0.2 refactoring)
// ═══════════════════════════════════════════════════════════

function describeAgentAction(action: { type: string; x?: number; y?: number; button?: string; text?: string; combo?: string; deltaY?: number; reasoning?: string; summary?: string; error?: string }): string {
  switch (action.type) {
    case 'click': return `Klik ${action.button || 'left'} @ (${action.x}, ${action.y})`;
    case 'double_click': return `Dwuklik @ (${action.x}, ${action.y})`;
    case 'type': return `Entryz: "${(action.text || '').slice(0, 60)}${(action.text || '').length > 60 ? '...' : ''}"`;
    case 'key': return `Klawisz: ${action.combo}`;
    case 'scroll': return `Scroll ${action.deltaY && action.deltaY > 0 ? '↓' : '↑'}`;
    case 'wait': return `Czekaj`;
    case 'done': return `ZROBIONE: ${action.summary || ''}`;
    case 'failed': return `BŁĄD: ${action.error || ''}`;
    default: return action.type;
  }
}

// ═══════════════════════════════════════════
// Simple Markdown renderer (no external deps)
// ═══════════════════════════════════════════
function MarkdownRenderer({ content }: { content: string }) {
  // Bardzo prosty markdown: nagłówki, bold, listy, code blocks
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inWhatde = false;
  let codeBuffer: string[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inWhatde) {
        elements.push(<pre key={`code-${i}`} className="bg-[#181828] p-2  text-[11px] font-mono text-[#8888aa] my-2 overflow-x-auto">{codeBuffer.join('\n')}</pre>);
        codeBuffer = [];
        inWhatde = false;
      } else {
        inWhatde = true;
      }
      return;
    }
    if (inWhatde) { codeBuffer.push(line); return; }

    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="text-sm font-bold text-[#e8e8f5] mt-3 mb-1">{line.slice(4)}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="text-base font-bold text-[#00f5d4] mt-3 mb-2">{line.slice(3)}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="text-lg font-bold text-[#e8e8f5] mt-3 mb-2">{line.slice(2)}</h2>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<div key={i} className="text-sm text-[#8888aa] pl-3 py-0.5">• {renderInline(line.slice(2))}</div>);
    } else if (/^\d+\.\s/.test(line)) {
      const m = line.match(/^(\d+)\.\s(.*)/);
      if (m) elements.push(<div key={i} className="text-sm text-[#8888aa] pl-3 py-0.5"><span className="text-[#ffd93d]">{m[1]}.</span> {renderInline(m[2])}</div>);
    } else if (line.trim()) {
      elements.push(<p key={i} className="text-sm text-[#8888aa] my-1">{renderInline(line)}</p>);
    } else {
      elements.push(<div key={i} className="h-2" />);
    }
  });

  if (codeBuffer.length > 0) {
    elements.push(<pre key="code-final" className="bg-[#181828] p-2  text-[11px] font-mono text-[#8888aa] my-2 overflow-x-auto">{codeBuffer.join('\n')}</pre>);
  }

  return <div>{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // **bold** i `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="text-[#e8e8f5]">{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="bg-[#181828] px-1  text-[#ffd93d] text-[11px]">{p.slice(1, -1)}</code>;
    return p;
  });
}


