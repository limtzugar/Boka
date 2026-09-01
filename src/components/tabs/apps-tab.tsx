'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  FolderOpen, Play, Square, Download, Code, FileCode, Loader2, Check,
  AlertTriangle, RefreshCw, Cpu, HardDrive, ChevronDown, Terminal,
  Eye, Sparkles, Zap, Activity, Server, Home as HomeIcon,
  Wrench, Plus, Globe, Beaker, X, Brain, Trash2, ChevronRight,
  CheckCircle, XCircle, Network, Settings as SettingsIcon, MessageSquare,
  Star, ArrowLeft, CircleDot, Search, Key,
} from 'lucide-react';

// ── Types (BokaApp was inline in page.tsx) ──
interface BokaApp {
  id: string;
  name: string;
  description?: string;
  language: string;
  filePath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  commands?: string[];
  tags?: string[];
  author?: string;
  version?: string;
  isDir: boolean;
  files?: string[];
  isRunning?: boolean;
}

// MarkdownRenderer is in page.tsx — inline simplified version for now
function MarkdownRenderer({ content }: { content: string }) {
  return <div className="text-xs text-[#e8e8f5] whitespace-pre-wrap font-mono">{content}</div>;
}

// describeAgentAction — helper for DesktopAgentView (moved from page.tsx)
function describeAgentAction(action: { type: string; x?: number; y?: number; button?: string; text?: string; combo?: string; deltaY?: number; reasoning?: string; summary?: string; error?: string }): string {
  switch (action.type) {
    case 'click': return `Klik ${action.button || 'left'} @ (${action.x}, ${action.y})`;
    case 'double_click': return `Dwuklik @ (${action.x}, ${action.y})`;
    case 'type': return `Wpisz: "${(action.text || '').slice(0, 60)}${(action.text || '').length > 60 ? '...' : ''}"`;
    case 'key': return `Klawisz: ${action.combo}`;
    case 'scroll': return `Scroll ${action.deltaY && action.deltaY > 0 ? '↓' : '↑'}`;
    case 'wait': return `Czekaj`;
    case 'done': return `ZROBIONE: ${action.summary || ''}`;
    case 'failed': return `BŁĄD: ${action.error || ''}`;
    default: return action.type;
  }
}

// ═══════════════════════════════════════════════════════════
// APPS TAB + sub-panels — extracted from page.tsx (P0.2)
// AppsTab, ModelTestLab, MarketplaceSection, DesktopAgentView
// ═══════════════════════════════════════════════════════════

export function AppsTab() {
  const [apps, setApps] = useState<BokaApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'code' | 'analyze' | 'create' | 'marketplace' | 'agent' | 'lab'>('list');
  const [code, setCode] = useState<string>('');
  const [analysis, setAnalysis] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [appsDir, setAppsDir] = useState<string>('');

  // Create form
  const [newName, setNewName] = useState('');
  const [newLang, setNewLang] = useState<'go' | 'python' | 'html' | 'css' | 'javascript' | 'typescript' | 'bash'>('python');
  const [newDesc, setNewDesc] = useState('');

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/apps');
      const data = await res.json();
      setApps(data.apps || []);
      setAppsDir(data.appsDir || '');
    } catch (e) {
      setMessage({ ok: false, text: `Błąd ładowania: ${e instanceof Error ? e.message : 'unknown'}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);

  const selectedApp = apps.find(a => a.id === selectedId);

  const handleRun = async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/apps/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      setMessage({ ok: data.ok, text: data.message });
      if (data.ok) {
        // Odśwież po 1s żeby pokazać że działa
        setTimeout(loadApps, 1000);
      }
    } catch (e) {
      setMessage({ ok: false, text: `Błąd: ${e instanceof Error ? e.message : 'unknown'}` });
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/apps/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      setMessage({ ok: data.ok, text: data.message });
      loadApps();
    } finally {
      setBusy(false);
    }
  };

  const handleViewCode = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/apps/code?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.ok) {
        setCode(data.code || '');
        setSelectedId(id);
        setView('code');
      } else {
        setMessage({ ok: false, text: data.error || 'Błąd czytania kodu' });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyze = async (id: string) => {
    setBusy(true);
    setView('analyze');
    setSelectedId(id);
    setAnalysis('');
    setMessage(null);
    try {
      const res = await fetch('/api/apps/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, focus: 'ogólna analiza jakości, bezpieczeństwa i wydajności' }),
      });
      const data = await res.json();
      if (data.ok) {
        setAnalysis(data.analysis || '(brak analizy)');
      } else {
        setAnalysis(`Błąd: ${data.error}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAutoFix = async (id: string, mode: 'suggest' | 'apply') => {
    if (mode === 'apply' && !confirm('Na pewno zapisać AI-poprawiony kod? Oryginał zostanie zbackupowany.')) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/apps/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          instructions: 'Napraw bugi, popraw bezpieczeństwo i wydajność, zachowaj funkcjonalność i metadata BOKA-APP',
          mode,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (mode === 'apply') {
          setMessage({ ok: true, text: `Zastosowano poprawki. Backup: ${data.backupPath || '(brak)'}` });
          loadApps();
          if (view === 'code' && selectedId === id) {
            handleViewCode(id);
          }
        } else {
          setCode(data.fixedCode || '');
          setView('code');
          setMessage({ ok: true, text: 'AI zaproponował poprawki — przejrzyj kod poniżej' });
        }
      } else {
        setMessage({ ok: false, text: data.error || 'Błąd AI fix' });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) { setMessage({ ok: false, text: 'Podaj nazwę' }); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/apps/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), language: newLang, description: newDesc.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ ok: true, text: `Utworzono: ${data.filePath}` });
        setNewName(''); setNewDesc('');
        setView('list');
        loadApps();
      } else {
        setMessage({ ok: false, text: data.error || 'Błąd tworzenia' });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Na pewno usunąć apkę ${id}?`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/apps/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ ok: true, text: `Usunięto ${id}` });
        if (selectedId === id) { setSelectedId(null); setView('list'); }
        loadApps();
      } else {
        setMessage({ ok: false, text: data.error || 'Błąd usuwania' });
      }
    } finally {
      setBusy(false);
    }
  };

  const languageColor: Record<string, string> = {
    go: '#00add8', python: '#3776ab', html: '#e34c26', css: '#563d7c',
    javascript: '#f7df1e', typescript: '#3178c6', bash: '#4eaa25', unknown: '#6b6b8d',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#e8e8f5] flex items-center gap-0">
            <Wrench size={24} className="text-[#00f5d4]" />
            Moje Apki
          </h1>
          <p className="text-xs text-[#8888aa] mt-1 font-mono">{appsDir || '(ładowanie...)'}</p>
        </div>
        <div className="flex gap-0">
          <button
            onClick={() => setView('create')}
            className="px-3 py-2 bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4]  text-sm hover:bg-[#00f5d4]/20 flex items-center gap-1"
          >
            <Plus size={14} /> Nowa apka
          </button>
          <button
            onClick={() => setView('marketplace')}
            className="px-3 py-2 bg-[#fbbf24]/10 border border-[#fbbf24]/30 text-[#ffd93d]  text-sm hover:bg-[#fbbf24]/20 flex items-center gap-1"
          >
            <Globe size={14} /> Marketplace
          </button>
          <button
            onClick={() => setView('lab')}
            className="px-3 py-2 bg-[#a855f7]/10 border border-[#a855f7]/30 text-[#a855f7]  text-sm hover:bg-[#a855f7]/20 flex items-center gap-1"
          >
            <Beaker size={14} /> Test Lab
          </button>
          <button
            onClick={loadApps}
            disabled={loading}
            className="px-3 py-2 bg-[#252535] border border-[#383850] text-[#e8e8f5]  text-sm hover:bg-[#2a2a3a] flex items-center gap-1 disabled:opacity-50"
          >
            <Loader2 size={14} className={loading ? 'animate-spin' : 'hidden'} /> Odśwież
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-2 p-2  text-sm border ${message.ok ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]' : 'bg-[#ff6b6b]/10 border-[#ff6b6b]/30 text-[#ff6b6b]'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="float-right"><X size={14} /></button>
        </div>
      )}

      {/* LIST VIEW */}
      {view === 'list' && (
        <div>
          {loading ? (
            <div className="text-center py-12 text-[#8888aa]">
              <Loader2 className="animate-spin mx-auto mb-2" size={24} />
              Ładowanie apek...
            </div>
          ) : apps.length === 0 ? (
            <div className="text-center py-16 text-[#8888aa]">
              <FolderOpen size={48} className="mx-auto mb-2 opacity-40" />
              <p className="text-lg mb-2">Brak apek w folderze</p>
              <p className="text-sm mb-2">Wrzuć pliki .go, .py, .html, .css, .js do folderu:</p>
              <code className="text-xs bg-[#252535] px-2 py-1  text-[#ffd93d]">{appsDir}</code>
              <p className="text-xs mt-4 text-[#8888aa]">lub utwórz nową apkę z szablonu ↑</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              {apps.map(app => (
                <div key={app.id} className="bg-[#252535] border border-[#383850]  p-4 hover:border-[#00f5d4]/30 transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-0">
                      <span
                        className="px-2 py-0.5  text-[10px] font-bold uppercase"
                        style={{ backgroundColor: `${languageColor[app.language] || '#6b6b8d'}20`, color: languageColor[app.language] || '#6b6b8d' }}
                      >
                        {app.language}
                      </span>
                      <h3 className="text-[#e8e8f5] font-semibold">{app.name}</h3>
                      {app.isRunning && (
                        <span className="flex items-center gap-1 text-[10px] text-[#4ade80]">
                          <span className="w-2 h-2 bg-[#4ade80] rounded-full animate-pulse" /> DZIAŁA
                        </span>
                      )}
                    </div>
                    {app.version && <span className="text-[10px] text-[#8888aa]">v{app.version}</span>}
                  </div>

                  {app.description && <p className="text-sm text-[#8888aa] mb-2">{app.description}</p>}

                  <div className="flex flex-wrap gap-1 mb-2">
                    {app.commands?.map(cmd => (
                      <span key={cmd} className="text-[10px] bg-[#181828] px-1.5 py-0.5  font-mono text-[#ffd93d]">/{cmd}</span>
                    ))}
                    {app.tags?.map(tag => (
                      <span key={tag} className="text-[10px] bg-[#181828] px-1.5 py-0.5  text-[#8888aa]">#{tag}</span>
                    ))}
                  </div>

                  <div className="text-[10px] text-[#8888aa] font-mono mb-2">
 {app.fileName} ({(app.sizeBytes / 1024).toFixed(1)} KB){app.isDir && ` · ${app.files?.length || 0} plików`}
 {app.author && ` · ${app.author}`}
                  </div>

                  <div className="flex gap-1 flex-wrap">
                    {app.isRunning ? (
                      <button onClick={() => handleStop(app.id)} disabled={busy}
                        className="px-2 py-1 bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[#ff6b6b]  text-xs hover:bg-[#ff6b6b]/20 flex items-center gap-1 disabled:opacity-50">
                        <Square size={12} /> Stop
                      </button>
                    ) : (
                      <button onClick={() => handleRun(app.id)} disabled={busy}
                        className="px-2 py-1 bg-[#4ade80]/10 border border-[#4ade80]/30 text-[#4ade80]  text-xs hover:bg-[#4ade80]/20 flex items-center gap-1 disabled:opacity-50">
                        <Play size={12} /> Uruchom
                      </button>
                    )}
                    <button onClick={() => handleViewCode(app.id)} disabled={busy}
                      className="px-2 py-1 bg-[#252535] border border-[#383850] text-[#8888aa]  text-xs hover:bg-[#2a2a3a] flex items-center gap-1">
                      <Eye size={12} /> Kod
                    </button>
                    <button onClick={() => handleAnalyze(app.id)} disabled={busy}
                      className="px-2 py-1 bg-[#a855f7]/10 border border-[#a855f7]/30 text-[#a855f7]  text-xs hover:bg-[#a855f7]/20 flex items-center gap-1">
                      <Brain size={12} /> Analizuj
                    </button>
                    <button onClick={() => handleAutoFix(app.id, 'suggest')} disabled={busy}
                      className="px-2 py-1 bg-[#fbbf24]/10 border border-[#fbbf24]/30 text-[#ffd93d]  text-xs hover:bg-[#fbbf24]/20 flex items-center gap-1">
                      <Zap size={12} /> AI Fix
                    </button>
                    <button onClick={() => { setSelectedId(app.id); setView('agent'); }}
                      className="px-2 py-1 bg-[#a855f7]/10 border border-[#a855f7]/30 text-[#a855f7]  text-xs hover:bg-[#a855f7]/20 flex items-center gap-1">
                      <Eye size={12} /> BOKA steruje
                    </button>
                    <button onClick={() => handleDelete(app.id)} disabled={busy}
                      className="px-2 py-1 bg-[#252535] border border-[#383850] text-[#8888aa]  text-xs hover:bg-[#ff6b6b]/10 hover:text-[#ff6b6b]">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info box dla usera */}
          <div className="mt-6 bg-[#252535] border border-[#383850]  p-4 text-xs text-[#8888aa]">
            <div className="text-[#e8e8f5] font-semibold mb-2 flex items-center gap-1"><Sparkles size={14} /> Jak dodawać apki</div>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Wrzuć pliki <code className="text-[#ffd93d]">.go, .py, .html, .css, .js, .ts, .sh</code> do folderu <code className="text-[#ffd93d]">{appsDir}</code></li>
              <li>Możesz też tworzyć foldery (np. <code className="text-[#ffd93d]">moja-appka/main.py</code>) — BOKA wykryje plik główny</li>
              <li>Dodaj metadata w komentarzach na początku pliku:</li>
            </ol>
            <pre className="mt-2 bg-[#181828] p-2  font-mono text-[10px] text-[#8888aa] overflow-x-auto">{`# BOKA-APP: name=Moja Apka
# BOKA-APP: description=Co ta apka robi
# BOKA-APP: commands=uruchom, start
# BOKA-APP: tags=tools, demo
# BOKA-APP: author=Michał
# BOKA-APP: version=1.0`}</pre>
            <p className="mt-2">Format komentarzy: <code className="text-[#ffd93d]">#</code> dla Python/Bash, <code className="text-[#ffd93d]">//</code> dla Go/JS/TS, <code className="text-[#ffd93d]">&lt;!-- --&gt;</code> dla HTML, <code className="text-[#ffd93d]">/* */</code> dla CSS.</p>
          </div>
        </div>
      )}

      {/* CODE VIEW */}
      {view === 'code' && selectedApp && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-0">
              <button onClick={() => setView('list')} className="text-[#8888aa] hover:text-[#e8e8f5]">
                <ChevronRight size={16} className="rotate-180" />
              </button>
              <h2 className="text-lg font-semibold text-[#e8e8f5]">{selectedApp.name} — kod</h2>
              {selectedApp.isDir && <span className="text-xs text-[#8888aa]">({selectedApp.files?.length || 0} plików)</span>}
            </div>
            <div className="flex gap-0">
              <button onClick={() => handleAutoFix(selectedApp.id, 'suggest')} disabled={busy}
                className="px-2 py-1 bg-[#fbbf24]/10 border border-[#fbbf24]/30 text-[#ffd93d]  text-xs hover:bg-[#fbbf24]/20 flex items-center gap-1">
                <Zap size={12} /> AI Popraw
              </button>
              <button onClick={() => handleAutoFix(selectedApp.id, 'apply')} disabled={busy}
                className="px-2 py-1 bg-[#4ade80]/10 border border-[#4ade80]/30 text-[#4ade80]  text-xs hover:bg-[#4ade80]/20 flex items-center gap-1">
                <CheckCircle size={12} /> Zastosuj AI Fix
              </button>
            </div>
          </div>
          <pre className="bg-[#181828] border border-[#383850]  p-4 text-xs font-mono text-[#8888aa] overflow-x-auto max-h-[60vh] overflow-y-auto">{code || '(pusty)'}</pre>
        </div>
      )}

      {/* ANALYZE VIEW */}
      {view === 'analyze' && selectedApp && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-0">
              <button onClick={() => setView('list')} className="text-[#8888aa] hover:text-[#e8e8f5]">
                <ChevronRight size={16} className="rotate-180" />
              </button>
              <h2 className="text-lg font-semibold text-[#e8e8f5]">{selectedApp.name} — analiza AI</h2>
            </div>
            <button onClick={() => handleAnalyze(selectedApp.id)} disabled={busy}
              className="px-2 py-1 bg-[#a855f7]/10 border border-[#a855f7]/30 text-[#a855f7]  text-xs hover:bg-[#a855f7]/20 flex items-center gap-1">
              <Loader2 size={12} className={busy ? 'animate-spin' : 'hidden'} /> Ponów
            </button>
          </div>
          {busy && !analysis ? (
            <div className="text-center py-12 text-[#8888aa]">
              <Loader2 className="animate-spin mx-auto mb-2" size={24} />
              AI analizuje kod...
            </div>
          ) : (
            <div className="bg-[#181828] border border-[#383850]  p-4 text-sm text-[#8888aa] prose prose-invert max-w-none">
              <MarkdownRenderer content={analysis} />
            </div>
          )}
        </div>
      )}

      {/* CREATE VIEW */}
      {view === 'create' && (
        <div className="max-w-md">
          <div className="flex items-center gap-0 mb-2">
            <button onClick={() => setView('list')} className="text-[#8888aa] hover:text-[#e8e8f5]">
              <ChevronRight size={16} className="rotate-180" />
            </button>
            <h2 className="text-lg font-semibold text-[#e8e8f5]">Nowa apka z szablonu</h2>
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-[#8888aa] mb-1">Nazwa apki</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="np. weather-check"
                className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] focus:border-[#00f5d4]/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-[#8888aa] mb-1">Język</label>
              <select value={newLang} onChange={e => setNewLang(e.target.value as typeof newLang)}
                className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] focus:border-[#00f5d4]/50 focus:outline-none">
                <option value="python">Python (.py)</option>
                <option value="go">Go (.go)</option>
                <option value="javascript">JavaScript (.js)</option>
                <option value="typescript">TypeScript (.ts)</option>
                <option value="html">HTML (.html)</option>
                <option value="css">CSS (.css)</option>
                <option value="bash">Bash (.sh)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8888aa] mb-1">Opis (opcjonalny)</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Krótki opis"
                className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] focus:border-[#00f5d4]/50 focus:outline-none" />
            </div>
            <button onClick={handleCreate} disabled={busy}
              className="w-full py-2 bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4]  text-sm hover:bg-[#00f5d4]/20 flex items-center justify-center gap-0 disabled:opacity-50">
              {busy && <Loader2 size={14} className="animate-spin" />} Utwórz apkę
            </button>
            <p className="text-[10px] text-[#8888aa]">Szablon automatycznie doda metadata BOKA-APP. Folder: <code className="text-[#ffd93d]">{appsDir}</code></p>
          </div>
        </div>
      )}

      {/* AGENT VIEW — BOKA steruje ekranem */}
      {view === 'agent' && selectedApp && (
        <DesktopAgentView app={selectedApp} onBack={() => setView('list')} />
      )}

      {/* MARKETPLACE VIEW */}
      {view === 'marketplace' && <MarketplaceSection onPickModel={async (modelId) => {
        if (!modelId) return;
        // Zapisz wybrany model do ustawień — przełącz provider na openrouter
        try {
          const settingsRes = await fetch('/api/settings');
          const settingsData = await settingsRes.json();
          const current = settingsData.settings || {};
          const merged = {
            ...current,
            // Masked klucz zostanie zachowany przez backend (POST /api/settings)
            provider: 'openrouter',
            openrouterModel: modelId,
          };
          const saveRes = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: merged }),
          });
          const saveData = await saveRes.json();
          if (saveData.ok) {
            setMessage({
              ok: true,
 text: ` Ustawiono model: ${modelId} — provider: OpenRouter. Kliknij"Testuj połączenie" w Ustawieniach.`,
            });
          } else {
            setMessage({ ok: false, text: `Błąd zapisu ustawień: ${saveData.error || 'unknown'}` });
          }
        } catch (e) {
          setMessage({ ok: false, text: `Błąd: ${e instanceof Error ? e.message : 'unknown'}` });
        }
        setView('list');
      }} />}
      {view === 'lab' && <ModelTestLab onBack={() => setView('list')} onPickModel={(modelId) => {
        setView('marketplace');
      }} />}
    </div>
  );
}

// ═══════════════════════════════════════════
// MODEL TEST LAB — test konkretnego modelu w różnych kategoriach
// ═══════════════════════════════════════════

interface TestResult {
  ok: boolean;
  modality?: string;
  category?: string;
  model?: string;
  response?: string;
  imageUrl?: string;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  score?: {
    score: number;
    matchedKeywords: string[];
    length: number;
    notes: string[];
  };
  promptUsed?: string;
  error?: string;
}

function ModelTestLab({ onBack, onPickModel }: { onBack: () => void; onPickModel?: (modelId: string) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [modality, setModality] = useState<'text' | 'image' | 'audio' | 'file' | 'video' | 'multi'>('text');
  const [category, setCategory] = useState<'coding' | 'finance' | 'technology' | 'science' | 'humanity' | 'general' | 'creative'>('coding');
  const [customPrompt, setCustomPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [history, setHistory] = useState<Array<TestResult & { timestamp: string }>>([]);

  // Auto-load saved OpenRouter key from settings
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data.settings?.openrouterKey && !data.settings.openrouterKey.includes('...')) {
          setApiKey(data.settings.openrouterKey);
        }
        if (data.settings?.openrouterModel) {
          setModel(data.settings.openrouterModel);
        }
      })
      .catch(() => {});
  }, []);

  const categories = [
 { id:'coding' as const, label:'Programowanie', icon:'', desc:'Quicksort w Pythonie' },
 { id:'finance' as const, label:'Finanse', icon:'', desc:'Procent składany' },
 { id:'technology' as const, label:'Technologia', icon:'️', desc:'Architektura transformer' },
 { id:'science' as const, label:'Nauka', icon:'', desc:'II zasada dynamiki' },
 { id:'humanity' as const, label:'Humanistyka', icon:'', desc:'Etyka Arystotelesa' },
 { id:'creative' as const, label:'Kreatywne', icon:'', desc:'Wiersz o świcie' },
 { id:'general' as const, label:'Ogólne', icon:'', desc:'Podsumowanie dnia' },
  ];

  const modalities = [
    { id: 'text' as const, label: 'Tekst', color: '#00f5d4', desc: 'chat/completions' },
    { id: 'image' as const, label: 'Obraz', color: '#a855f7', desc: 'images/generations' },
    { id: 'audio' as const, label: 'Audio (TTS)', color: '#ffd93d', desc: 'audio/speech' },
    { id: 'multi' as const, label: 'Multi-modal', color: '#6ec6e7', desc: 'vision + text' },
    { id: 'file' as const, label: 'Plik', color: '#4ade80', desc: 'file processing (custom)' },
    { id: 'video' as const, label: 'Video', color: '#ff6b6b', desc: 'video generation (custom)' },
  ];

  const runTest = async () => {
    if (!apiKey || !model) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/model-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey, model, baseUrl, modality, category,
          customPrompt: customPrompt || undefined,
        }),
      });
      const data: TestResult = await res.json();
      setResult(data);
      setHistory(prev => [{ ...data, timestamp: new Date().toISOString() }, ...prev].slice(0, 10));
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'unknown' });
    } finally {
      setRunning(false);
    }
  };

  const runAllCategories = async () => {
    if (!apiKey || !model) return;
    setRunning(true);
    for (const cat of categories) {
      setCategory(cat.id);
      try {
        const res = await fetch('/api/model-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, model, baseUrl, modality, category: cat.id }),
        });
        const data: TestResult = await res.json();
        setResult(data);
        setHistory(prev => [{ ...data, timestamp: new Date().toISOString(), category: cat.id }, ...prev].slice(0, 30));
      } catch (e) {
        setHistory(prev => [{ ok: false, error: e instanceof Error ? e.message : 'unknown', timestamp: new Date().toISOString(), category: cat.id }, ...prev].slice(0, 30));
      }
    }
    setRunning(false);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-0 mb-2">
        <button onClick={onBack} className="text-[#8888aa] hover:text-[#e8e8f5]">
          <ChevronRight size={16} className="rotate-180" />
        </button>
        <Beaker size={20} className="text-[#a855f7]" />
        <h2 className="text-lg font-semibold text-[#e8e8f5]">Model Test Lab</h2>
        <span className="text-xs text-[#8888aa]">— przetestuj model zanim go użyjesz</span>
      </div>

      {/* Config */}
      <div className="bg-[#252535] border border-[#383850]  p-4 mb-2">
        <div className="grid gap-0 md:grid-cols-2 mb-2">
          <div>
            <label className="text-xs text-[#8888aa] font-mono mb-1 block">API Key (Bearer)</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm font-mono text-[#e8e8f5]" />
          </div>
          <div>
            <label className="text-xs text-[#8888aa] font-mono mb-1 block">Model ID</label>
            <input type="text" value={model} onChange={e => setModel(e.target.value)}
              placeholder="np. openai/gpt-oss-120b:free"
              className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm font-mono text-[#e8e8f5]" />
          </div>
        </div>
        <div className="mb-2">
          <label className="text-xs text-[#8888aa] font-mono mb-1 block">Base URL (OpenAI-compat)</label>
          <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
            className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm font-mono text-[#e8e8f5]" />
          <div className="text-[10px] text-[#8888aa] mt-1">
            Domyślnie OpenRouter. Inne: <code className="text-[#ffd93d]">https://api.openai.com/v1</code>, <code className="text-[#ffd93d]">https://api.deepseek.com/v1</code>, <code className="text-[#ffd93d]">https://api.together.xyz/v1</code>
          </div>
        </div>

        {/* Modality picker */}
        <div className="mb-2">
          <label className="text-xs text-[#8888aa] font-mono mb-1 block">Modalność</label>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-0">
            {modalities.map(m => (
              <button key={m.id} onClick={() => setModality(m.id)}
                className={`px-2 py-2  border text-xs transition-all ${
                  modality === m.id
                    ? 'border-2 bg-[#252535]'
                    : 'border opacity-60 hover:opacity-100 bg-[#181828]'
                }`}
                style={{ borderColor: m.color, color: m.color }}>
                <div className="font-bold">{m.label}</div>
                <div className="text-[9px] opacity-70 font-mono">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Category picker — only for text/multi */}
        {(modality === 'text' || modality === 'multi') && (
          <div className="mb-2">
            <label className="text-xs text-[#8888aa] font-mono mb-1 block">Kategoria testu</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
              {categories.map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  className={`px-2 py-2  border text-xs text-left transition-all ${
                    category === c.id
                      ? 'bg-[#a855f7]/15 border-[#a855f7]/50 text-[#a855f7]'
                      : 'bg-[#181828] border-[#383850] text-[#8888aa] hover:border-[#a855f7]/30'
                  }`}>
                  <div className="font-bold flex items-center gap-1">{c.icon} {c.label}</div>
                  <div className="text-[9px] opacity-70">{c.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom prompt override */}
        <div className="mb-2">
          <label className="text-xs text-[#8888aa] font-mono mb-1 block">
            Custom prompt (opcjonalnie — puste = domyślny dla kategorii)
          </label>
          <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
            rows={2}
            placeholder="Zostaw puste aby użyć domyślnego promptu dla tej kategorii"
            className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] font-mono" />
        </div>

        {/* Actions */}
        <div className="flex gap-0">
          <button onClick={runTest} disabled={running || !apiKey || !model}
            className="px-4 py-2 bg-[#a855f7]/15 border border-[#a855f7]/50 text-[#a855f7]  text-sm hover:bg-[#a855f7]/25 disabled:opacity-50 flex items-center gap-1">
            {running ? <Loader2 size={14} className="animate-spin" /> : <Beaker size={14} />}
            {running ? 'Testuję...' : 'Uruchom test'}
          </button>
          <button onClick={runAllCategories} disabled={running || !apiKey || !model || modality !== 'text'}
            className="px-4 py-2 bg-[#fbbf24]/10 border border-[#fbbf24]/30 text-[#ffd93d]  text-sm hover:bg-[#fbbf24]/20 disabled:opacity-50 flex items-center gap-1"
            title="Uruchom test dla wszystkich kategorii (tylko text)">
            <Zap size={14} /> Testuj wszystkie kategorie
          </button>
          {onPickModel && model && (
            <button onClick={() => onPickModel(model)}
              className="px-4 py-2 bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4]  text-sm hover:bg-[#00f5d4]/20 flex items-center gap-1 ml-auto">
              <CheckCircle size={14} /> Użyj tego modelu
            </button>
          )}
        </div>
      </div>

      {/* Current result */}
      {result && (
        <div className={`mb-2  border p-4 ${result.ok ? 'bg-[#252535] border-[#4ade80]/30' : 'bg-[#252535] border-[#ff6b6b]/30'}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-[#e8e8f5] flex items-center gap-0">
              {result.ok ? <CheckCircle size={14} className="text-[#4ade80]" /> : <XCircle size={14} className="text-[#ff6b6b]" />}
              {result.ok ? 'Test zakończony' : 'Test nieudany'}
              {result.category && (
                <span className="px-1.5 py-0.5  text-[10px] font-mono bg-[#a855f7]/15 text-[#a855f7]">
                  {result.category}
                </span>
              )}
              {result.modality && (
                <span className="px-1.5 py-0.5  text-[10px] font-mono bg-[#00f5d4]/15 text-[#00f5d4]">
                  {result.modality}
                </span>
              )}
            </h3>
            {result.latencyMs !== undefined && (
              <span className="text-xs text-[#8888aa] font-mono">
                ⏱ {result.latencyMs < 1000 ? `${result.latencyMs}ms` : `${(result.latencyMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>

          {/* Stats row */}
          {result.ok && (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-0 mb-2 text-xs">
              {result.tokensIn !== undefined && (
                <div className="bg-[#181828] p-2 rounded">
                  <div className="text-[#8888aa] text-[10px]">Tokens IN</div>
                  <div className="text-[#4ade80] font-mono font-bold">{result.tokensIn}</div>
                </div>
              )}
              {result.tokensOut !== undefined && (
                <div className="bg-[#181828] p-2 rounded">
                  <div className="text-[#8888aa] text-[10px]">Tokens OUT</div>
                  <div className="text-[#ffd93d] font-mono font-bold">{result.tokensOut}</div>
                </div>
              )}
              {result.score && (
                <div className="bg-[#181828] p-2 rounded">
                  <div className="text-[#8888aa] text-[10px]">Score</div>
                  <div className={`font-mono font-bold ${result.score.score >= 70 ? 'text-[#4ade80]' : result.score.score >= 40 ? 'text-[#ffd93d]' : 'text-[#ff6b6b]'}`}>
                    {result.score.score}/100
                  </div>
                </div>
              )}
              {result.response && (
                <div className="bg-[#181828] p-2 rounded">
                  <div className="text-[#8888aa] text-[10px]">Długość</div>
                  <div className="text-[#8888aa] font-mono">{result.response.length} znaków</div>
                </div>
              )}
            </div>
          )}

          {/* Score notes */}
          {result.score && result.score.notes.length > 0 && (
            <div className="mb-2 p-2 bg-[#181828]  text-xs">
              <div className="text-[#8888aa] mb-1">Notatki oceny:</div>
              <ul className="space-y-0.5">
                {result.score.notes.map((n, i) => (
                  <li key={i} className="text-[#8888aa]">• {n}</li>
                ))}
                {result.score.matchedKeywords.length > 0 && (
                  <li className="text-[#4ade80]">• Słowa kluczowe: {result.score.matchedKeywords.join(', ')}</li>
                )}
              </ul>
            </div>
          )}

          {/* Image preview */}
          {result.imageUrl && typeof result.imageUrl === 'string' && result.imageUrl.startsWith('http') && (
            <div className="mb-2">
              <img src={result.imageUrl} alt="Wygenerowany obraz" className="max-w-md  border border-[#383850]" />
            </div>
          )}

          {/* Response text */}
          {result.response && (
            <div>
              <div className="text-[10px] text-[#8888aa] font-mono mb-1">ODPOWIEDŹ:</div>
              <pre className="bg-[#181828] border border-[#383850]  p-2 text-xs text-[#8888aa] font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">{result.response}</pre>
            </div>
          )}

          {/* Error */}
          {result.error && (
            <div className="p-2 bg-[#ff6b6b]/5 border border-[#ff6b6b]/20  text-xs text-[#ff6b6b] font-mono">
              {result.error}
            </div>
          )}

          {/* Prompt used */}
          {result.promptUsed && (
            <details className="mt-3">
              <summary className="text-[10px] text-[#8888aa] font-mono cursor-pointer">Pokaż prompt</summary>
              <pre className="mt-1 p-2 bg-[#181828]  text-[10px] text-[#8888aa] font-mono whitespace-pre-wrap">{result.promptUsed}</pre>
            </details>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-[#252535] border border-[#383850]  p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-[#e8e8f5]">Historia testów ({history.length})</h3>
            <button onClick={() => setHistory([])} className="text-[10px] text-[#8888aa] hover:text-[#ff6b6b]">
              Wyczyść
            </button>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-0 text-xs p-2 bg-[#181828] rounded">
                <span className={`w-2 h-2 rounded-full ${h.ok ? 'bg-[#4ade80]' : 'bg-[#ff6b6b]'}`} />
                <span className="text-[#8888aa]">{h.category || '?'}</span>
                <span className="text-[#8888aa] font-mono">·</span>
                <span className="text-[#8888aa]">{h.modality || '?'}</span>
                {h.latencyMs !== undefined && (
                  <>
                    <span className="text-[#8888aa] font-mono">·</span>
                    <span className="text-[#ffd93d] font-mono">{h.latencyMs}ms</span>
                  </>
                )}
                {h.score && (
                  <>
                    <span className="text-[#8888aa] font-mono">·</span>
                    <span className={`font-mono ${h.score.score >= 70 ? 'text-[#4ade80]' : h.score.score >= 40 ? 'text-[#ffd93d]' : 'text-[#ff6b6b]'}`}>{h.score.score}/100</span>
                  </>
                )}
                {!h.ok && h.error && (
                  <span className="text-[#ff6b6b] truncate flex-1" title={h.error}>— {h.error.slice(0, 80)}</span>
                )}
                <span className="text-[#8888aa] text-[10px] ml-auto">
                  {new Date(h.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="mt-4 p-2 bg-[#252535] border border-[#383850]  text-xs text-[#8888aa]">
 <div className="text-[#e8e8f5] font-semibold mb-1"> Jak działa Test Lab?</div>
        <p>• Wpisz klucz API + ID modelu (lub użyj zapisanych z Ustawień)</p>
        <p>• Wybierz <b className="text-[#00f5d4]">modalność</b>: tekst, obraz, audio, file, video, multi-modal</p>
        <p>• Wybierz <b className="text-[#a855f7]">kategorię</b>: kod, finanse, technologia, nauka, humanistyka, kreatywne, ogólne</p>
        <p>• BOKA wyśle standardowy testowy prompt i oceni odpowiedź (słowa kluczowe, długość, czas)</p>
        <p>• „Testuj wszystkie" przebiega przez 7 kategorii — porównaj jak model radzi sobie w różnych dziedzinach</p>
        <p>• Każdy test trafia do historii — możesz porównać wyniki różnych modeli obok siebie</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MARKETPLACE SECTION — porównywarka tanich modeli
// ═══════════════════════════════════════════
interface MarketplaceModel {
  source: string;
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  maxOutput?: number;
  priceInputPerM: number;
  priceOutputPerM: number;
  currency: string;
  modalities?: string[];
  releasedAt?: string;
  popularity?: number;
  family?: string;
  homepage?: string;
  estimateCostPer1000Calls?: number;
  isFree?: boolean;
}

function MarketplaceSection({ onPickModel }: { onPickModel?: (modelId: string) => void }) {
  const [models, setModels] = useState<MarketplaceModel[]>([]);
  const [catalogs, setCatalogs] = useState<Array<{
    source: string; name: string; homepage: string; pricingPage: string;
    apiKeyUrl: string; notes: string; popularCheapModels: Array<{ id: string; name: string; priceInputPerM: number; priceOutputPerM: number; contextWindow: number; notes: string }>;
  }>>([]);
  const [stats, setStats] = useState<{ totalModels: number; freeCount?: number; sources: Record<string, number>; errors: string[]; cheapestInput: MarketplaceModel | null; cheapestOutput: MarketplaceModel | null; largestContext: MarketplaceModel | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'cheapest-total' | 'cheapest-input' | 'cheapest-output' | 'largest-context' | 'newest' | 'popular'>('cheapest-total');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [freeOnly, setFreeOnly] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('sort', sort);
      if (search) params.set('search', search);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (maxPrice) {
        params.set('maxInputPrice', maxPrice);
        params.set('maxOutputPrice', maxPrice);
      }
      if (freeOnly) params.set('freeOnly', '1');
      params.set('limit', '200');

      const res = await fetch(`/api/model-marketplace?${params}`);
      const data = await res.json();
      if (data.error && !data.models?.length) {
        setError(data.error);
      }
      setModels(data.models || []);
      setStats(data.stats || null);
      setCatalogs(data.catalogs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }, [sort, search, sourceFilter, maxPrice, freeOnly]);

  useEffect(() => { load(); }, [load]);

  const fmtPrice = (p: number) => p === 0 ? 'FREE' : `$${p.toFixed(4)}`;
  const fmtContext = (c?: number) => c ? `${(c / 1000).toFixed(0)}K` : '?';

  const sourceColor: Record<string, string> = {
    openrouter: '#fbbf24', muapi: '#a855f7', deepseek: '#4ade80', together: '#60a5fa', fireworks: '#ff6b6b',
  };

  return (
    <div>
      <div className="flex items-center gap-0 mb-2">
        <button onClick={() => onPickModel ? onPickModel('') : null} className="text-[#8888aa] hover:text-[#e8e8f5]">
          <ChevronRight size={16} className="rotate-180" />
        </button>
        <h2 className="text-lg font-semibold text-[#e8e8f5]">Marketplace modeli AI</h2>
        <span className="text-xs text-[#8888aa]">— porównaj ceny i wybierz tanio</span>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 mb-2">
          <div className="bg-[#252535] border border-[#383850]  p-2">
            <div className="text-[10px] text-[#8888aa]">Wszystkich modeli</div>
            <div className="text-lg font-bold text-[#00f5d4]">{stats.totalModels}</div>
          </div>
          {stats.cheapestInput && (
            <div className="bg-[#252535] border border-[#383850]  p-2">
              <div className="text-[10px] text-[#8888aa]">Najtańszy input</div>
              <div className="text-sm font-bold text-[#4ade80]">{fmtPrice(stats.cheapestInput.priceInputPerM)}/M</div>
              <div className="text-[10px] text-[#8888aa] truncate">{stats.cheapestInput.name}</div>
            </div>
          )}
          {stats.cheapestOutput && (
            <div className="bg-[#252535] border border-[#383850]  p-2">
              <div className="text-[10px] text-[#8888aa]">Najtańszy output</div>
              <div className="text-sm font-bold text-[#4ade80]">{fmtPrice(stats.cheapestOutput.priceOutputPerM)}/M</div>
              <div className="text-[10px] text-[#8888aa] truncate">{stats.cheapestOutput.name}</div>
            </div>
          )}
          {stats.largestContext && (
            <div className="bg-[#252535] border border-[#383850]  p-2">
              <div className="text-[10px] text-[#8888aa]">Największy kontekst</div>
              <div className="text-sm font-bold text-[#a855f7]">{fmtContext(stats.largestContext.contextWindow)}</div>
              <div className="text-[10px] text-[#8888aa] truncate">{stats.largestContext.name}</div>
            </div>
          )}
        </div>
      )}

      {/* Free-mode explainer banner */}
      {freeOnly && (
        <div className="mb-2 p-2 bg-[#4ade80]/8 border border-[#4ade80]/30  text-xs text-[#8888aa]">
          <div className="text-[#4ade80] font-semibold mb-1 flex items-center gap-1">
            <Sparkles size={12} /> Tryb darmowych modeli
          </div>
          <p>
            Pokazuję tylko modele z ceną <b className="text-[#4ade80]">$0 input</b> i <b className="text-[#4ade80]">$0 output</b>.
            Te warianty (często z sufiksem <code className="text-[#ffd93d]">:free</code> w OpenRouter)
            nie zużywają Twoich kredytów — mają limity rate-limit, ale żadnych opłat.
            Idealne gdy konto OpenRouter mało zasobne, albo robot ma działać non-stop.
          </p>
          <p className="mt-1 text-[#8888aa]">
            Wskazówka: darmowe modele mają mniejszy rate-limit (np. 20 req/min) — dla intensywnego użytkowania przełącz na płatny.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-[#252535] border border-[#383850]  p-2 mb-2 flex flex-wrap gap-0 items-center">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
 placeholder=" szukaj modelu (llama, gpt, claude, qwen...)"
          className="flex-1 min-w-[200px] bg-[#181828] border border-[#383850]  px-3 py-1.5 text-sm text-[#e8e8f5] focus:border-[#00f5d4]/50 focus:outline-none"
        />
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="bg-[#181828] border border-[#383850]  px-2 py-1.5 text-sm text-[#e8e8f5]">
          <option value="all">Wszystkie źródła</option>
          <option value="openrouter">OpenRouter</option>
          <option value="muapi">MUAPI</option>
          <option value="catalogs">Katalogi (DeepSeek/Together/Fireworks)</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}
          className="bg-[#181828] border border-[#383850]  px-2 py-1.5 text-sm text-[#e8e8f5]">
          <option value="cheapest-total">Najtańsze łącznie</option>
          <option value="cheapest-input">Najtańszy input</option>
          <option value="cheapest-output">Najtańszy output</option>
          <option value="largest-context">Największy kontekst</option>
          <option value="newest">Najnowsze</option>
          <option value="popular">Najpopularniejsze</option>
        </select>
        <input
          type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)}
          placeholder="max $/M"
          step="0.1" min="0"
          className="w-24 bg-[#181828] border border-[#383850]  px-2 py-1.5 text-sm text-[#e8e8f5]"
        />
        <label
          className={`flex items-center gap-1.5 px-2.5 py-1.5  border cursor-pointer text-sm transition-colors ${
            freeOnly
              ? 'bg-[#4ade80]/15 border-[#4ade80]/40 text-[#4ade80]'
              : 'bg-[#181828] border-[#383850] text-[#8888aa] hover:border-[#4ade80]/30'
          }`}
          title="Pokaż tylko modele z ceną $0 input i $0 output (np. warianty OpenRouter :free)"
        >
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={e => setFreeOnly(e.target.checked)}
            className="sr-only"
          />
          {freeOnly ? <Check size={14} /> : <Sparkles size={14} />}
          Tylko darmowe
          {stats?.freeCount ? (
            <span className="ml-1 text-[10px] opacity-70">({stats.freeCount})</span>
          ) : null}
        </label>
        <button onClick={load} disabled={loading}
          className="px-3 py-1.5 bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4]  text-sm hover:bg-[#00f5d4]/20 flex items-center gap-1 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Szukaj
        </button>
      </div>

      {error && (
        <div className="mb-2 p-2 bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[#ff6b6b]  text-sm">
 {error}
          {stats?.errors?.length ? (
            <ul className="mt-1 text-xs">{stats.errors.map((e, i) => <li key={i}>• {e}</li>)}</ul>
          ) : null}
        </div>
      )}

      {/* Models table */}
      {loading ? (
        <div className="text-center py-12 text-[#8888aa]">
          <Loader2 className="animate-spin mx-auto mb-2" size={24} />
          Pobieranie modeli z marketplace...
        </div>
      ) : models.length === 0 ? (
        <div className="text-center py-12 text-[#8888aa]">
          Brak modeli pasujących do filtrów
        </div>
      ) : (
        <div className="overflow-x-auto bg-[#252535] border border-[#383850] rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-[#181828] text-[#8888aa] text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">Model</th>
                <th className="text-left px-3 py-2">Źródło</th>
                <th className="text-right px-3 py-2">Input $/M</th>
                <th className="text-right px-3 py-2">Output $/M</th>
                <th className="text-right px-3 py-2">~1000 zapytań</th>
                <th className="text-right px-3 py-2">Kontekst</th>
                <th className="text-left px-3 py-2">Modalności</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {models.slice(0, 100).map((m, i) => (
                <tr key={`${m.source}-${m.id}-${i}`} className="border-t border-[#383850] hover:bg-[#2a2a3a]/30">
                  <td className="px-3 py-2">
                    <div className="font-medium text-[#e8e8f5] flex items-center gap-1.5">
                      {m.name}
                      {m.isFree && (
                        <span
                          className="px-1.5 py-0.5  text-[9px] font-bold uppercase bg-[#4ade80]/15 border border-[#4ade80]/40 text-[#4ade80]"
                          title="Cena $0 za input i output — ten model nie zużywa kredytów"
                        >
                          FREE
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#8888aa] font-mono">{m.id}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5  text-[10px] font-bold uppercase"
                      style={{ backgroundColor: `${sourceColor[m.source] || '#6b6b8d'}20`, color: sourceColor[m.source] || '#6b6b8d' }}>
                      {m.source}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[#4ade80]">{fmtPrice(m.priceInputPerM)}</td>
                  <td className="px-3 py-2 text-right font-mono text-[#ffd93d]">{fmtPrice(m.priceOutputPerM)}</td>
                  <td className="px-3 py-2 text-right font-mono text-[#8888aa] text-xs">
                    {m.isFree ? <span className="text-[#4ade80]">$0.00</span> : `$${m.estimateCostPer1000Calls?.toFixed(4) || '?'}`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[#a855f7]">{fmtContext(m.contextWindow)}</td>
                  <td className="px-3 py-2 text-[10px] text-[#8888aa]">
                    {m.modalities?.slice(0, 3).join(', ') || 'text'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {onPickModel && (
                      <button onClick={() => onPickModel(m.id)}
                        className={`px-2 py-1  text-[10px] ${
                          m.isFree
                            ? 'bg-[#4ade80]/15 border border-[#4ade80]/40 text-[#4ade80] hover:bg-[#4ade80]/25'
                            : 'bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4] hover:bg-[#00f5d4]/20'
                        }`}>
                        Wybierz
                      </button>
                    )}
                    {m.homepage && (
                      <a href={m.homepage} target="_blank" rel="noopener" className="ml-1 text-[#8888aa] hover:text-[#00f5d4]">
                        <Globe size={12} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {models.length > 100 && (
            <div className="p-2 text-center text-xs text-[#8888aa]">
              Wyświetlono 100 z {models.length} modeli. Użyj filtrów, aby zawęzić.
            </div>
          )}
        </div>
      )}

      {/* Provider catalogs */}
      {catalogs.length > 0 && (
        <div className="mt-6">
 <h3 className="text-sm font-semibold text-[#e8e8f5] mb-2"> Katalogi providerów (rejestracja API keys)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {catalogs.map(cat => (
              <div key={cat.source} className="bg-[#252535] border border-[#383850]  p-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-[#e8e8f5]" style={{ color: sourceColor[cat.source] || '#e0e0f0' }}>{cat.name}</h4>
                  <span className="text-[10px] uppercase text-[#8888aa]">{cat.source}</span>
                </div>
                <p className="text-xs text-[#8888aa] mb-2">{cat.notes}</p>
                <div className="text-[10px] space-y-1 mb-2">
                  {cat.popularCheapModels.map(m => (
                    <div key={m.id} className="font-mono">
                      <span className="text-[#ffd93d]">{m.id}</span>
                      <span className="text-[#4ade80]"> ${m.priceInputPerM}/${m.priceOutputPerM}/M</span>
                      <span className="text-[#8888aa]"> · {m.notes}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-0 text-[10px]">
                  <a href={cat.apiKeyUrl} target="_blank" rel="noopener" className="text-[#00f5d4] hover:underline flex items-center gap-1">
                    <Key size={10} /> API Keys
                  </a>
                  <a href={cat.pricingPage} target="_blank" rel="noopener" className="text-[#ffd93d] hover:underline flex items-center gap-1">
                    <Globe size={10} /> Cennik
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 bg-[#252535] border border-[#383850]  p-2 text-xs text-[#8888aa]">
 <div className="text-[#e8e8f5] font-semibold mb-1"> Jak to działa?</div>
        <p>• <b className="text-[#ffd93d]">OpenRouter</b> — agregator 300+ modeli. Wpisz klucz w Ustawieniach, wybierz model, gotowe.</p>
        <p>• <b className="text-[#a855f7]">MUAPI</b> — polski agregator. Endpoint OpenAI-compat: <code className="text-[#ffd93d]">https://muapi.net/api/v1</code></p>
        <p>• <b className="text-[#4ade80]">DeepSeek/Together/Fireworks</b> — bezpośrednie API. Skonfiguruj w Ustawieniach jako „Własny API" z URL: <code className="text-[#ffd93d]">https://api.deepseek.com/v1</code> (lub podobnym).</p>
        <p>• Kiedy robot będzie połączony na stałe z siecią, automatycznie odświeży listę modeli.</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// DESKTOP AGENT VIEW — BOKA steruje ekranem
// ═══════════════════════════════════════════
interface AgentStep {
  step: number;
  actionType: string;
  description: string;
  reasoning: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
  executed: boolean;
  error?: string;
  timestamp: string;
}

function DesktopAgentView({ app, onBack }: { app: BokaApp; onBack: () => void }) {
  const [status, setStatus] = useState<{
    capabilities?: { screenshot: { available: boolean; tool?: string; note?: string }; input: { available: boolean; tool?: string; note?: string }; platform: string };
    vision?: { supported: boolean; note: string; provider: string; model: string };
  } | null>(null);
  const [liveScreenshot, setLiveScreenshot] = useState<string>('');
  const [instruction, setInstruction] = useState(`Otwórz apkę "${app.name}" i użyj jej`);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [running, setRunning] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [previewWindow, setPreviewWindow] = useState<Window | null>(null);

  // Załaduj status capabilities
  useEffect(() => {
    fetch('/api/desktop/status')
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(e => console.error(e));
  }, []);

  // Auto-refresh screenshot co 3s gdy nie uruchomiony agent
  useEffect(() => {
    if (!autoRefresh || running) return;
    const refresh = () => {
      fetch('/api/desktop/screenshot')
        .then(r => r.json())
        .then(d => { if (d.ok && d.base64) setLiveScreenshot(d.base64); })
        .catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [autoRefresh, running]);

  const openAppInWindow = () => {
    if (app.language === 'html') {
      // Otwórz preview w osobnym oknie
      const w = window.open(`/api/apps/preview?id=${encodeURIComponent(app.id)}`, `boka-app-${app.id}`, 'width=800,height=600,resizable=yes,scrollbars=yes');
      setPreviewWindow(w);
      setMessage?.({ ok: true, text: `Otwarto ${app.name} w osobnym oknie` });
    } else {
      // Uruchom przez API (Python, Go, JS)
      fetch('/api/apps/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: app.id }),
      }).then(r => r.json()).then(d => {
        setMessage?.({ ok: d.ok, text: d.message });
      });
    }
  };

  // Pomocnicza funkcja setMessage — przekazana przez props by uniknąć TS błędu
  function setMessage(msg: { ok: boolean; text: string }) {
    // Użyj custom event żeby komunikować z AppsTab
    window.dispatchEvent(new CustomEvent('boka-message', { detail: msg }));
  }

  const runAgentLoop = async () => {
    if (!instruction.trim()) return;
    setRunning(true);
    setStopRequested(false);
    setSteps([]);
    setCurrentStep(0);

    const maxSteps = 15;
    const localSteps: AgentStep[] = [];

    for (let i = 1; i <= maxSteps; i++) {
      if (stopRequested) break;
      setCurrentStep(i);

      try {
        const res = await fetch('/api/desktop/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instruction,
            step: i,
            appId: app.id,
            maxSteps,
            previousActions: localSteps.slice(-5).map(s => ({
              step: s.step,
              action: { type: s.actionType, reasoning: s.reasoning },
              screenshotBefore: s.screenshotBefore,
              screenshotAfter: s.screenshotAfter,
              executed: s.executed,
              timestamp: s.timestamp,
            })),
          }),
        });
        const data = await res.json();

        if (!data.ok) {
          localSteps.push({
            step: i,
            actionType: 'failed',
            description: 'Błąd API',
            reasoning: data.error || 'unknown',
            executed: false,
            error: data.error,
            timestamp: new Date().toISOString(),
          });
          setSteps([...localSteps]);
          break;
        }

        const step = data.step;
        const action = step.action;
        const description = describeAgentAction(action);

        const localStep: AgentStep = {
          step: i,
          actionType: action.type,
          description,
          reasoning: action.reasoning || '',
          screenshotBefore: step.screenshotBefore,
          screenshotAfter: step.screenshotAfter,
          executed: step.executed,
          error: step.error,
          timestamp: step.timestamp,
        };
        localSteps.push(localStep);
        setSteps([...localSteps]);

        // Zaktualizuj live screenshot
        if (step.screenshotAfter) setLiveScreenshot(step.screenshotAfter);
        else if (step.screenshotBefore) setLiveScreenshot(step.screenshotBefore);

        // Koniec pętli?
        if (action.type === 'done' || action.type === 'failed') break;
      } catch (e) {
        localSteps.push({
          step: i,
          actionType: 'failed',
          description: 'Network error',
          reasoning: e instanceof Error ? e.message : 'unknown',
          executed: false,
          error: e instanceof Error ? e.message : 'unknown',
          timestamp: new Date().toISOString(),
        });
        setSteps([...localSteps]);
        break;
      }
    }

    setRunning(false);
    setCurrentStep(0);
  };

  const stop = () => setStopRequested(true);

  const manualClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    // Klik w screenshot — wyślij akcję klik w tych współrzędnych
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const scaleX = (img.naturalWidth || rect.width) / rect.width;
    const scaleY = (img.naturalHeight || rect.height) / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    fetch('/api/desktop/act', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'click', x, y, button: 'left' }),
    }).then(() => {
      // Odśwież screenshot po 500ms
      setTimeout(() => {
        fetch('/api/desktop/screenshot')
          .then(r => r.json())
          .then(d => { if (d.ok && d.base64) setLiveScreenshot(d.base64); });
      }, 500);
    });
  };

  return (
    <div>
      <div className="flex items-center gap-0 mb-2">
        <button onClick={onBack} className="text-[#8888aa] hover:text-[#e8e8f5]">
          <ChevronRight size={16} className="rotate-180" />
        </button>
        <h2 className="text-lg font-semibold text-[#e8e8f5]">BOKA steruje: {app.name}</h2>
        <span className="text-xs text-[#8888aa]">— AI widzi ekran i klika</span>
      </div>

      {/* Status capabilities */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-0 mb-2">
          <div className={`bg-[#252535] border  p-2 ${status.capabilities?.screenshot.available ? 'border-[#4ade80]/30' : 'border-[#ff6b6b]/30'}`}>
            <div className="text-[10px] text-[#8888aa]">Screenshot</div>
            <div className={`text-sm font-bold ${status.capabilities?.screenshot.available ? 'text-[#4ade80]' : 'text-[#ff6b6b]'}`}>
 {status.capabilities?.screenshot.available ?' Działa' :' Niedostępny'}
            </div>
            <div className="text-[10px] text-[#8888aa]">{status.capabilities?.screenshot.tool || status.capabilities?.screenshot.note}</div>
          </div>
          <div className={`bg-[#252535] border  p-2 ${status.capabilities?.input.available ? 'border-[#4ade80]/30' : 'border-[#ff6b6b]/30'}`}>
            <div className="text-[10px] text-[#8888aa]">Input (mysz/klawa)</div>
            <div className={`text-sm font-bold ${status.capabilities?.input.available ? 'text-[#4ade80]' : 'text-[#ff6b6b]'}`}>
 {status.capabilities?.input.available ?' Działa' :' Niedostępny'}
            </div>
            <div className="text-[10px] text-[#8888aa]">{status.capabilities?.input.tool || status.capabilities?.input.note}</div>
          </div>
          <div className={`bg-[#252535] border  p-2 ${status.vision?.supported ? 'border-[#4ade80]/30' : 'border-[#fbbf24]/30'}`}>
            <div className="text-[10px] text-[#8888aa]">Vision model</div>
            <div className={`text-sm font-bold ${status.vision?.supported ? 'text-[#4ade80]' : 'text-[#ffd93d]'}`}>
 {status.vision?.supported ?' Wspierany' :' Wymagany'}
            </div>
            <div className="text-[10px] text-[#8888aa]">{status.vision?.note}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Lewa kolumna: screenshot + controls */}
        <div>
          <div className="bg-[#252535] border border-[#383850]  p-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[#e8e8f5]">Podgląd ekranu</h3>
              <div className="flex items-center gap-0">
                <label className="text-[10px] text-[#8888aa] flex items-center gap-1">
                  <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="w-3 h-3" />
                  Auto-refresh
                </label>
                <button
                  onClick={() => fetch('/api/desktop/screenshot').then(r => r.json()).then(d => { if (d.ok && d.base64) setLiveScreenshot(d.base64); })}
                  className="text-[10px] px-2 py-0.5 bg-[#181828] border border-[#383850]  text-[#8888aa] hover:bg-[#2a2a3a]"
                >
 Odśwież
                </button>
              </div>
            </div>
            {liveScreenshot ? (
              <img
                src={`data:image/png;base64,${liveScreenshot}`}
                alt="Ekran"
                onClick={manualClick}
                className="w-full  border border-[#383850] cursor-crosshair"
                style={{ imageRendering: 'auto' }}
              />
            ) : (
              <div className="aspect-video bg-[#181828]  flex items-center justify-center text-[#8888aa] text-sm">
                {status?.capabilities?.screenshot.available ? 'Ładowanie screenshota...' : 'Screenshot niedostępny'}
              </div>
            )}
 <p className="text-[10px] text-[#8888aa] mt-1"> Kliknij w screenshot aby ręcznie wykonać klik w tej pozycji</p>
          </div>

          {/* Controls */}
          <div className="bg-[#252535] border border-[#383850]  p-2 mt-3">
            <h3 className="text-sm font-semibold text-[#e8e8f5] mb-2">Sterowanie</h3>
            <div className="flex flex-wrap gap-1 mb-2">
              <button onClick={openAppInWindow}
                className="px-3 py-1.5 bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4]  text-xs hover:bg-[#00f5d4]/20 flex items-center gap-1">
                <Play size={12} /> Otwórz apkę
              </button>
              {previewWindow && (
                <button onClick={() => { previewWindow.close(); setPreviewWindow(null); }}
                  className="px-3 py-1.5 bg-[#252535] border border-[#383850] text-[#8888aa]  text-xs hover:bg-[#2a2a3a]">
                  Zamknij okienko
                </button>
              )}
            </div>

            <label className="block text-xs text-[#8888aa] mb-1">Instrukcja dla BOKA:</label>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="np. 'Kliknij przycisk Submit, wpisz w pole hello world, wyślij formularz'"
              rows={3}
              className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] focus:border-[#00f5d4]/50 focus:outline-none mb-2"
              disabled={running}
            />
            <div className="flex gap-0">
              {!running ? (
                <button onClick={runAgentLoop} disabled={!instruction.trim()}
                  className="flex-1 py-2 bg-[#a855f7]/10 border border-[#a855f7]/30 text-[#a855f7]  text-sm hover:bg-[#a855f7]/20 flex items-center justify-center gap-0 disabled:opacity-50">
                  <Sparkles size={14} /> Uruchom agenta (max 15 kroków)
                </button>
              ) : (
                <button onClick={stop}
                  className="flex-1 py-2 bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[#ff6b6b]  text-sm hover:bg-[#ff6b6b]/20 flex items-center justify-center gap-0">
                  <Square size={14} /> Zatrzymaj (krok {currentStep})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Prawa kolumna: historia kroków */}
        <div>
          <div className="bg-[#252535] border border-[#383850]  p-2">
            <h3 className="text-sm font-semibold text-[#e8e8f5] mb-2">
              Historia kroków {running && <span className="text-[#a855f7] text-xs animate-pulse">• krok {currentStep}...</span>}
            </h3>
            {steps.length === 0 ? (
              <div className="text-center py-8 text-[#8888aa] text-sm">
                {running ? 'Agent pracuje...' : 'Brak kroków. Wpisz instrukcję i kliknij Uruchom.'}
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {steps.map((s, i) => (
                  <div key={i} className={`bg-[#181828] border  p-2 text-xs ${
                    s.actionType === 'done' ? 'border-[#4ade80]/40' :
                    s.actionType === 'failed' ? 'border-[#ff6b6b]/40' :
                    s.executed ? 'border-[#383850]' : 'border-[#fbbf24]/40'
                  }`}>
                    <div className="flex items-center gap-0 mb-1">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        s.actionType === 'done' ? 'bg-[#4ade80]/20 text-[#4ade80]' :
                        s.actionType === 'failed' ? 'bg-[#ff6b6b]/20 text-[#ff6b6b]' :
                        'bg-[#00f5d4]/20 text-[#00f5d4]'
                      }`}>{s.step}</span>
                      <span className="font-mono text-[10px] uppercase text-[#8888aa]">{s.actionType}</span>
                      {s.executed ? <CheckCircle size={12} className="text-[#4ade80]" /> : <XCircle size={12} className="text-[#ffd93d]" />}
                    </div>
                    <div className="text-[#e8e8f5] mb-1">{s.description}</div>
                    {s.reasoning && <div className="text-[10px] text-[#8888aa] italic">→ {s.reasoning}</div>}
 {s.error && <div className="text-[10px] text-[#ff6b6b] mt-1"> {s.error}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual action buttons */}
          <div className="bg-[#252535] border border-[#383850]  p-2 mt-3">
            <h3 className="text-sm font-semibold text-[#e8e8f5] mb-2">Ręczne akcje</h3>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <button onClick={() => fetch('/api/desktop/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'key', combo: 'Return' }) }).then(() => setTimeout(() => location.reload(), 500))}
                className="px-2 py-1 bg-[#181828] border border-[#383850]  hover:bg-[#2a2a3a] text-[#8888aa]">Enter</button>
              <button onClick={() => fetch('/api/desktop/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'key', combo: 'Escape' }) }).then(() => setTimeout(() => location.reload(), 500))}
                className="px-2 py-1 bg-[#181828] border border-[#383850]  hover:bg-[#2a2a3a] text-[#8888aa]">Esc</button>
              <button onClick={() => fetch('/api/desktop/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'key', combo: 'Control+c' }) })}
                className="px-2 py-1 bg-[#181828] border border-[#383850]  hover:bg-[#2a2a3a] text-[#8888aa]">Ctrl+C</button>
              <button onClick={() => fetch('/api/desktop/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'key', combo: 'Control+v' }) })}
                className="px-2 py-1 bg-[#181828] border border-[#383850]  hover:bg-[#2a2a3a] text-[#8888aa]">Ctrl+V</button>
              <button onClick={() => fetch('/api/desktop/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scroll', deltaY: 3 }) }).then(() => setTimeout(() => location.reload(), 500))}
                className="px-2 py-1 bg-[#181828] border border-[#383850]  hover:bg-[#2a2a3a] text-[#8888aa]">Scroll ↓</button>
              <button onClick={() => fetch('/api/desktop/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scroll', deltaY: -3 }) }).then(() => setTimeout(() => location.reload(), 500))}
                className="px-2 py-1 bg-[#181828] border border-[#383850]  hover:bg-[#2a2a3a] text-[#8888aa]">Scroll ↑</button>
            </div>
            <input
              type="text"
              placeholder="Wpisz tekst i Enter → wpisz na ekranie"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const text = (e.target as HTMLInputElement).value;
                  if (text) {
                    fetch('/api/desktop/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'type', text }) });
                    (e.target as HTMLInputElement).value = '';
                  }
                }
              }}
              className="w-full mt-2 bg-[#181828] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] focus:border-[#00f5d4]/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="mt-4 bg-[#252535] border border-[#383850]  p-2 text-xs text-[#8888aa]">
 <div className="text-[#e8e8f5] font-semibold mb-1"> Jak działa BOKA Agent?</div>
        <p>1. BOKA robi screenshot ekranu</p>
        <p>2. Wysyła go do modelu AI z capability <b className="text-[#ffd93d]">vision</b> (Claude 3.5, GPT-4V, Qwen-VL, Llava...)</p>
        <p>3. AI analizuje obraz i decyduje co kliknąć / wpisać / wciśnąć</p>
        <p>4. BOKA wykonuje akcję (mysz/klawiatura przez PowerShell/xdotool)</p>
        <p>5. Robi nowy screenshot — i tak w kółko aż skończy</p>
 <p className="mt-2"> <b className="text-[#ffd93d]">Uwaga:</b> daj BOCIE wyraźną instrukcję. Agent ma max 15 kroków na zadanie. Współrzędne kliknięć są w pikselach ekranu — działa na całym pulpicie, nie tylko na apce.</p>
 <p className="mt-1"> Jeśli model nie wspiera vision, przełącz w Ustawieniach na model z vision capability (sprawdź Marketplace → filtr modalities=vision).</p>
      </div>
    </div>
  );
}

