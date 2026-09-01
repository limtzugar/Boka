'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { loadSettings } from '@/lib/ai-providers';
import type { AISettings } from '@/lib/ai-providers';
import {
  Settings as SettingsIcon, Eye, EyeOff, Cpu, Server, Key, Globe, Mic, Volume2,
  Brain, Shield, Activity, Home as HomeIcon, Camera, Bell, Palette,
  Loader2, Check, X, AlertTriangle, Zap, HardDrive, Play, Square,
  FolderOpen, RefreshCw, ChevronDown, Sparkles, CircleDot, Network,
  Star, Baby, User, Users, Upload, Trash2, Calendar, Heart,
  Whatins, CheckCircle, XCircle, Wifi, Plus, Pencil, Bot,
} from 'lucide-react';
import { PixelAvatar, getCategoryLabel } from '@/components/pixel-avatar';
import { BokaFaceMini, type FaceStyle } from '@/components/boka-face';
import { FORMULA_TYPES, FORMULA_PALETTES } from '@/components/formula-renderer';

// ── Local type (SettingsState was inline in page.tsx) ──
type SettingsState = AISettings;

// VaultSection is defined in page.tsx — for now use inline placeholder
function VaultSection() {
  return <div className="text-[10px] text-[#5a5a78] font-mono p-2">Vault (see Vault tab)</div>;
}

// ═══════════════════════════════════════════════════════════
// SETTINGS TAB + GGUF SETTINGS — extracted from page.tsx (P0.2)
// Provider config, ASR/TTS, Vision, HA, GGUF server management
// ═══════════════════════════════════════════════════════════

export function SettingsTab() {
  const faceStyle = useAppStore(s => s.faceStyle);
  const setFaceStyle = useAppStore(s => s.setFaceStyle);
  const cameraStyle = useAppStore(s => s.cameraStyle);
  const setCameraStyle = useAppStore(s => s.setCameraStyle);
  const eyeSharpness = useAppStore(s => s.eyeSharpness);
  const setEyeSharpness = useAppStore(s => s.setEyeSharpness);
  const eyeBrightness = useAppStore(s => s.eyeBrightness);
  const setEyeBrightness = useAppStore(s => s.setEyeBrightness);
  const eyeSaturation = useAppStore(s => s.eyeSaturation);
  const setEyeSaturation = useAppStore(s => s.setEyeSaturation);
  const eyeBlur = useAppStore(s => s.eyeBlur);
  const setEyeBlur = useAppStore(s => s.setEyeBlur);
  const formulaSettings = useAppStore(s => s.formulaSettings);
  const setFormulaSettings = useAppStore(s => s.setFormulaSettings);
  const [settings, setSettings] = useState<SettingsState>({
    provider: 'openrouter',
    openrouterKey: '',
    openrouterModel: 'openai/gpt-oss-120b',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3',
    ggufFilePath: '',
    ggufServerPath: '',
    ggufPort: 8080,
    ggufWhatntextSize: 4096,
    ggufGpuLayers: -1,
    customUrl: '',
    customKey: '',
    customModel: '',
    temperature: 0.7,
    maxTokens: 1500,
    topP: 0.95,
    frequencyPenalty: 0,
    presencePenalty: 0,
    adaptiveMaxTokens: true,
    maxTokensShort: 256,
    maxTokensLong: 1500,
    shortPromptThreshold: 80,
    cacheSystemPrompt: true,
    stopSequences: [],
    asrEngine: 'auto',
    whisperUrl: 'http://127.0.0.1:5100',
    whisperModel: 'medium',
  });
  const [showKeys, setShowKeys] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<Array<{
    name: string;
    size: number;
    family?: string;
    parameterSize?: string;
    quantization?: string;
    modifiedAt?: string;
  }>>([]);
  const [ollamaRunning, setOllamaRunning] = useState<Array<{ name: string; sizeVRam: number }>>([]);
  const [ollamaStatus, setOllamaStatus] = useState<{ reachable: boolean; serverVersion?: string; error?: string } | null>(null);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaPullName, setOllamaPullName] = useState('');
  const [ollamaPulling, setOllamaPulling] = useState(false);
  const [ollamaPullResult, setOllamaPullResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) return;
        const data = await res.json();
        if (data.settings) {
          setSettings(prev => ({
            ...prev,
            ...data.settings,
            provider: data.settings.provider || 'openrouter',
            openrouterKey: data.settings.openrouterKey || '',
            openrouterModel: data.settings.openrouterModel || 'openai/gpt-oss-120b',
            ollamaUrl: data.settings.ollamaUrl || 'http://localhost:11434',
            ollamaModel: data.settings.ollamaModel || 'llama3',
            ggufFilePath: data.settings.ggufFilePath || '',
            ggufServerPath: data.settings.ggufServerPath || '',
            ggufPort: data.settings.ggufPort || 8080,
            ggufWhatntextSize: data.settings.ggufWhatntextSize || 4096,
            ggufGpuLayers: data.settings.ggufGpuLayers ?? -1,
            customUrl: data.settings.customUrl || '',
            customKey: data.settings.customKey || '',
            customModel: data.settings.customModel || '',
          }));
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
      setLoaded(true);
    }
    load();
  }, []);

  // Fetch Ollama models with full details + running + status
  const fetchOllamaModels = async (url?: string) => {
    setOllamaLoading(true);
    try {
      const targetUrl = url || settings.ollamaUrl || '';
      const res = await fetch(`/api/ollama-models?url=${encodeURIWhatmponent(targetUrl)}&detail=1`);
      if (!res.ok) {
        setOllamaModels([]);
        setOllamaRunning([]);
        setOllamaStatus({ reachable: false, error: `HTTP ${res.status}` });
        return;
      }
      const data = await res.json();
      setOllamaModels(data.models || []);
      setOllamaRunning(data.running || []);
      setOllamaStatus(data.status || null);
    } catch (e) {
      setOllamaModels([]);
      setOllamaRunning([]);
      setOllamaStatus({ reachable: false, error: e instanceof Error ? e.message : 'Error połączenia' });
    }
    setOllamaLoading(false);
  };

  const pullOllamaModel = async () => {
    if (!ollamaPullName.trim()) return;
    setOllamaPulling(true);
    setOllamaPullResult(null);
    try {
      const res = await fetch('/api/ollama-models', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({ url: settings.ollamaUrl, model: ollamaPullName.trim() }),
      });
      const data = await res.json();
      setOllamaPullResult(data);
      if (data.ok) {
        setOllamaPullName('');
        fetchOllamaModels();
      }
    } catch (e) {
      setOllamaPullResult({ ok: false, message: e instanceof Error ? e.message : 'Error pobierania' });
    }
    setOllamaPulling(false);
    setTimeout(() => setOllamaPullResult(null), 6000);
  };

  // Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '?';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  };

  useEffect(() => {
    if (settings.provider === 'ollama') {
      fetchOllamaModels();
    }
  }, [settings.provider, settings.ollamaUrl]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) {
        setTestResult({ ok: false, message: 'Error zapisu' });
        setSaving(false);
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, message: 'Settings zapisane!' });
      } else {
        setTestResult({ ok: false, message: data.error || 'Error zapisu' });
      }
    } catch {
      setTestResult({ ok: false, message: 'Error połączenia' });
    }
    setSaving(false);
    setTimeout(() => setTestResult(null), 3000);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const res = await fetch('/api/settings', { method: 'PUT' });
      if (!res.ok) {
        setTestResult({ ok: false, message: 'Error testu połączenia' });
        setTesting(false);
        return;
      }
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.message });
    } catch {
      setTestResult({ ok: false, message: 'Error testu połączenia' });
    }
    setTesting(false);
    setTimeout(() => setTestResult(null), 5000);
  };

  const update = (key: keyof SettingsState, value: string | number | boolean | string[]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const providers: { id: string; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: 'openrouter', label: 'OpenRouter', icon: <Globe size={16} />, desc: 'Dostęp do setek modeli: GPT, Claude, Llama, Mistral' },
    { id: 'ollama', label: 'Ollama (lokalny)', icon: <Cpu size={16} />, desc: 'Lokalne modele na Twoim komputerze. Darmowe, prywatne.' },
    { id: 'gguf', label: 'File GGUF (z dysku)', icon: <HardDrive size={16} />, desc: 'Wskaż dowolny plik .gguf — BOKA uruchomi go przez llama.cpp' },
        { id: 'custom', label: 'Własny API', icon: <Server size={16} />, desc: 'LM Studio, vLLM — dowolny serwer OpenAI-compat' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-pixel text-sm mb-2" style={{ color: '#ffd93d' }}>USTAWIENIA BOKI</h2>

        {/* ── VAULT — NOTATKI BOKI (przeniesione z osobnej zakładki) ── */}
        <VaultSection />

        {/* ── LIVE PREVIEW ORB — large, centered ── */}
        <div className="mb-4 p-4 bg-[#181828] border border-[#383850] flex flex-col items-center gap-3">
          <div className="w-48 h-48 shrink-0">
            <BokaFaceMini emotion="neutral" size={192} faceStyle={faceStyle} formulaSettings={formulaSettings} />
          </div>
          <div className="text-center">
            <div className="text-xs font-mono text-[#e8e8f5]">Preview na żywo</div>
            <div className="text-[10px] text-[#8888aa] font-mono mt-0.5">
              {faceStyle === 'plasma' ? 'Plazma' : faceStyle === 'water' ? 'Tafla wody' : faceStyle === 'obsidian' ? 'Obsidian' : 'Formuła'}
              {faceStyle === 'formula' && ` · ${formulaSettings.type} · ${FORMULA_PALETTES.find(p => p.id === formulaSettings.palette)?.label}`}
            </div>
          </div>
        </div>

        {/* ── VISUAL STYLE SELECTOR ── */}
        <div className="mb-6">
          <div className="flex items-center gap-0 mb-2">
            <Sparkles size={16} className="text-[#a855f7]" />
            <span className="text-sm font-mono text-[#e8e8f5]">Wygląd Boki</span>
          </div>
          <div className="grid gap-0 md:grid-cols-4">
            {([
              { id: 'plasma' as FaceStyle, label: 'Plazma', desc: 'Luminacyjna kula', icon: <Sparkles size={16} /> },
              { id: 'water' as FaceStyle, label: 'Tafla wody', desc: 'Kółka fal', icon: <Activity size={16} /> },
              { id: 'obsidian' as FaceStyle, label: 'Obsidian', desc: 'Graph wiedzy', icon: <CircleDot size={16} /> },
              { id: 'formula' as FaceStyle, label: 'Formuła', desc: 'Wzory matematyczne', icon: <Network size={16} /> },
            ]).map(s => (
              <button
                key={s.id}
                onClick={() => setFaceStyle(s.id)}
                className={`p-2  border text-left transition-all ${
                  faceStyle === s.id
                    ? 'bg-[#a855f7]/10 border-[#a855f7]/50 text-[#a855f7]'
                    : 'bg-[#252535] border-[#383850] text-[#8888aa] hover:border-[#a855f7]/30'
                }`}
              >
                <div className="flex items-center gap-0 mb-1">
                  {s.icon}
                  <span className="text-sm font-mono">{s.label}</span>
                </div>
                <div className="text-[10px] font-mono opacity-70">{s.desc}</div>
              </button>
            ))}
          </div>

          {/* ── FORMULA CONTROLS (v0.3.19 — visible only when Formula style selected) ── */}
          {faceStyle === 'formula' && (
            <div className="mt-3 p-3 bg-[#252535] border border-[#383850] space-y-3">
              {/* Formula type */}
              <div>
                <label className="text-xs font-mono text-[#8888aa] mb-1 block">Type wzoru</label>
                <div className="grid grid-cols-4 gap-0">
                  {FORMULA_TYPES.map(ft => (
                    <button key={ft.id} onClick={() => setFormulaSettings({ type: ft.id })}
                      className={`p-1.5 text-[9px] font-mono border transition-all ${formulaSettings.type === ft.id ? 'bg-[#00f5d4]/10 text-[#00f5d4] border-[#00f5d4]/50' : 'bg-[#181828] text-[#8888aa] border-[#383850] hover:text-[#e8e8f5]'}`}>
                      {ft.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Whatlor palette */}
              <div>
                <label className="text-xs font-mono text-[#8888aa] mb-1 block">Paleta kolorów</label>
                <div className="grid grid-cols-6 gap-0">
                  {FORMULA_PALETTES.map(p => (
                    <button key={p.id} onClick={() => setFormulaSettings({ palette: p.id })}
                      className={`h-6 border transition-all ${formulaSettings.palette === p.id ? 'border-[#00f5d4] border-2' : 'border-[#383850] hover:border-[#00f5d4]/50'}`}
                      style={{ background: `linear-gradient(90deg, ${p.colors.map(c => `rgb(${c[0]},${c[1]},${c[2]})`).join(', ')})` }}
                      title={p.label}
                    />
                  ))}
                </div>
                <div className="text-[9px] text-[#8888aa] font-mono mt-0.5">
                  {FORMULA_PALETTES.find(p => p.id === formulaSettings.palette)?.label}
                </div>
              </div>

              {/* Draw mode */}
              <div className="flex gap-0">
                <label className="text-xs font-mono text-[#8888aa] flex-1">Tryb rysowania</label>
                <div className="flex">
                  <button onClick={() => setFormulaSettings({ drawMode: 'line' })}
                    className={`px-2 py-0.5 text-[10px] font-mono border ${formulaSettings.drawMode === 'line' ? 'bg-[#00f5d4]/10 text-[#00f5d4] border-[#00f5d4]/50' : 'bg-[#181828] text-[#8888aa] border-[#383850]'}`}>Linie</button>
                  <button onClick={() => setFormulaSettings({ drawMode: 'dots' })}
                    className={`px-2 py-0.5 text-[10px] font-mono border ${formulaSettings.drawMode === 'dots' ? 'bg-[#00f5d4]/10 text-[#00f5d4] border-[#00f5d4]/50' : 'bg-[#181828] text-[#8888aa] border-[#383850]'}`}>Punkty</button>
                </div>
              </div>

              {/* Sliders */}
              <div>
                <label className="flex items-center justify-between text-xs font-mono text-[#8888aa] mb-0.5">
                  <span>Grubość linii</span><span className="text-[#00f5d4]">{formulaSettings.lineWidth.toFixed(1)}</span>
                </label>
                <input type="range" min={0.2} max={6} step={0.1} value={formulaSettings.lineWidth}
                  onChange={e => setFormulaSettings({ lineWidth: parseFloat(e.target.value) })} className="w-full" />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs font-mono text-[#8888aa] mb-0.5">
                  <span>Noprzezroczystość</span><span className="text-[#00f5d4]">{formulaSettings.opacity.toFixed(2)}</span>
                </label>
                <input type="range" min={0.02} max={1} step={0.01} value={formulaSettings.opacity}
                  onChange={e => setFormulaSettings({ opacity: parseFloat(e.target.value) })} className="w-full" />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs font-mono text-[#8888aa] mb-0.5">
                  <span>Gęstość (punktów)</span><span className="text-[#00f5d4]">{formulaSettings.density}</span>
                </label>
                <input type="range" min={200} max={20000} step={100} value={formulaSettings.density}
                  onChange={e => setFormulaSettings({ density: parseInt(e.target.value) })} className="w-full" />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs font-mono text-[#8888aa] mb-0.5">
                  <span>Skala</span><span className="text-[#00f5d4]">{formulaSettings.scale.toFixed(2)}</span>
                </label>
                <input type="range" min={0.2} max={1.6} step={0.01} value={formulaSettings.scale}
                  onChange={e => setFormulaSettings({ scale: parseFloat(e.target.value) })} className="w-full" />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs font-mono text-[#8888aa] mb-0.5">
                  <span>Rotacja (°)</span><span className="text-[#00f5d4]">{formulaSettings.rotation}</span>
                </label>
                <input type="range" min={0} max={360} step={1} value={formulaSettings.rotation}
                  onChange={e => setFormulaSettings({ rotation: parseInt(e.target.value) })} className="w-full" />
              </div>

              {/* Additive blending */}
              <label className="flex items-center gap-0 text-xs font-mono text-[#8888aa] cursor-pointer">
                <input type="checkbox" checked={formulaSettings.blend}
                  onChange={e => setFormulaSettings({ blend: e.target.checked })} className="mr-2" />
                Additive blending (neon)
              </label>
            </div>
          )}
        </div>

        {/* ── CAMERA STYLE + EYE SETTINGS (v0.3.19 — moved from chat panel) ── */}
        <div className="mb-6">
          <div className="flex items-center gap-0 mb-2">
            <Eye size={16} className="text-[#6ec6e7]" />
            <span className="text-sm font-mono text-[#e8e8f5]">Wygląd kamery</span>
          </div>
          <div className="grid gap-0 md:grid-cols-2">
            {([
              { id: 'rectangular' as const, label: 'Prostokąt', desc: 'Zwykła kamera 16:9', icon: <Camera size={16} /> },
              { id: 'spherical' as const, label: 'Sfera (oko)', desc: 'Rybie oko z vignette, czarno-białe', icon: <Eye size={16} /> },
            ]).map(s => (
              <button
                key={s.id}
                onClick={() => setCameraStyle(s.id)}
                className={`p-2 border text-left transition-all ${
                  cameraStyle === s.id
                    ? 'bg-[#6ec6e7]/10 border-[#6ec6e7]/50 text-[#6ec6e7]'
                    : 'bg-[#252535] border-[#383850] text-[#8888aa] hover:border-[#6ec6e7]/30'
                }`}
              >
                <div className="flex items-center gap-0 mb-1">
                  {s.icon}
                  <span className="text-sm font-mono">{s.label}</span>
                </div>
                <div className="text-[10px] font-mono opacity-70">{s.desc}</div>
              </button>
            ))}
          </div>
          {cameraStyle === 'spherical' && (
            <div className="mt-3 p-3 bg-[#252535] border border-[#383850] space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#6ec6e7]">Settings oka</div>
              <div>
                <label className="flex items-center justify-between text-xs font-mono text-[#8888aa] mb-1">
                  <span>Ostrość (contrast)</span>
                  <span className="text-[#6ec6e7]">{eyeSharpness.toFixed(1)}</span>
                </label>
                <input type="range" min={0.5} max={3} step={0.1} value={eyeSharpness}
                  onChange={e => setEyeSharpness(parseFloat(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs font-mono text-[#8888aa] mb-1">
                  <span>Jasność</span>
                  <span className="text-[#6ec6e7]">{eyeBrightness.toFixed(1)}</span>
                </label>
                <input type="range" min={0.3} max={2} step={0.1} value={eyeBrightness}
                  onChange={e => setEyeBrightness(parseFloat(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs font-mono text-[#8888aa] mb-1">
                  <span>Saturacja (0=B/N)</span>
                  <span className="text-[#6ec6e7]">{eyeSaturation.toFixed(1)}</span>
                </label>
                <input type="range" min={0} max={2} step={0.1} value={eyeSaturation}
                  onChange={e => setEyeSaturation(parseFloat(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs font-mono text-[#8888aa] mb-1">
                  <span>Blur środka</span>
                  <span className="text-[#6ec6e7]">{eyeBlur.toFixed(1)}px</span>
                </label>
                <input type="range" min={0} max={10} step={0.5} value={eyeBlur}
                  onChange={e => setEyeBlur(parseFloat(e.target.value))} className="w-full" />
              </div>
            </div>
          )}
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-0 mb-2">
            <Server size={16} className="text-[#00f5d4]" />
            <span className="text-sm font-mono text-[#e8e8f5]">Dostawca AI</span>
          </div>
          <div className="grid gap-0 md:grid-cols-2">
            {providers.map(p => (
              <button
                key={p.id}
                onClick={() => update('provider', p.id)}
                className={`p-2  border text-left transition-all ${
                  settings.provider === p.id
                    ? 'bg-[#00f5d4]/10 border-[#00f5d4]/50 text-[#00f5d4]'
                    : 'bg-[#252535] border-[#383850] text-[#8888aa] hover:border-[#00f5d4]/30'
                }`}
              >
                <div className="flex items-center gap-0 mb-1">
                  {p.icon}
                  <span className="text-sm font-mono">{p.label}</span>
                </div>
                <div className="text-[10px] font-mono opacity-70">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {settings.provider === 'openrouter' && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-0 mb-2">
              <Key size={16} className="text-[#6ec6e7]" />
              <span className="text-sm font-mono text-[#e8e8f5]">Konfiguracja OpenRouter</span>
            </div>
            <div>
              <label className="text-xs font-mono text-[#8888aa] mb-1 block">API Key</label>
              <div className="relative">
                <input
                  type={showKeys ? 'text' : 'password'}
                  value={settings.openrouterKey}
                  onChange={e => update('openrouterKey', e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full bg-[#252535] border border-[#383850]  px-3 py-2 pr-10 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#00f5d4]/50 font-mono"
                />
                <button type="button" onClick={() => setShowKeys(!showKeys)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8888aa] hover:text-[#e8e8f5]">
                  {showKeys ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-mono text-[#8888aa] mb-1 block">Model</label>
              <input
                type="text"
                value={settings.openrouterModel}
                onChange={e => update('openrouterModel', e.target.value)}
                placeholder="openai/gpt-oss-120b"
                className="w-full bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#00f5d4]/50 font-mono"
              />
            </div>
          </div>
        )}

        {settings.provider === 'ollama' && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-0 mb-2">
              <Cpu size={16} className="text-[#4ade80]" />
              <span className="text-sm font-mono text-[#e8e8f5]">Konfiguracja Ollama</span>
            </div>

            {/* Server URL + status */}
            <div>
              <label className="text-xs font-mono text-[#8888aa] mb-1 block">URL serwera Ollama</label>
              <div className="flex gap-0">
                <input type="text" value={settings.ollamaUrl} onChange={e => update('ollamaUrl', e.target.value)} placeholder="http://localhost:11434" className="flex-1 bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#00f5d4]/50 font-mono" />
                <button onClick={() => fetchOllamaModels()} disabled={ollamaLoading} className="px-3 py-2  bg-[#252535] border border-[#383850] text-[#8888aa] hover:border-[#00f5d4]/30 text-xs font-mono disabled:opacity-50">
                  {ollamaLoading ? '...' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* Server status badge */}
            {ollamaStatus && (
              <div className={`text-[11px] font-mono px-3 py-2  border ${
                ollamaStatus.reachable
                  ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]'
                  : 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ff6b6b]'
              }`}>
                {ollamaStatus.reachable ? (
                  <span>
 Server Ollama działa
                    {ollamaStatus.serverVersion && <span className="opacity-60"> · {ollamaStatus.serverVersion}</span>}
                    {' · '}{ollamaModels.length} modeli
                    {ollamaRunning.length > 0 && <span className="text-[#ffd93d]"> · {ollamaRunning.length} załadowanych w RAM</span>}
                  </span>
                ) : (
 <span> Server nieosiągalny: {ollamaStatus.error ||'sprawdź czy Ollama działa'}</span>
                )}
              </div>
            )}

            {/* Running models (loaded in RAM) */}
            {ollamaRunning.length > 0 && (
              <div className="bg-[#fbbf24]/5 border border-[#fbbf24]/20  p-2">
 <div className="text-[10px] font-mono text-[#ffd93d] mb-2 uppercase tracking-wider"> Załadowane w pamięci (gotowe do rozmowy)</div>
                <div className="flex flex-wrap gap-1.5">
                  {ollamaRunning.map(m => (
                    <span key={m.name} className="text-[11px] font-mono px-2 py-1  bg-[#fbbf24]/10 border border-[#fbbf24]/30 text-[#ffd93d]">
                      {m.name} {m.sizeVRam > 0 && <span className="opacity-60">· {formatBytes(m.sizeVRam)} VRAM</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Model picker — rich cards instead of dropdown */}
            <div>
              <label className="text-xs font-mono text-[#8888aa] mb-2 block">
                Wybierz model {ollamaModels.length > 0 && <span className="opacity-60">({ollamaModels.length} dostępnych)</span>}
              </label>

              {ollamaLoading ? (
                <div className="text-[11px] font-mono text-[#8888aa] py-4 text-center">Szukam modeli...</div>
              ) : ollamaModels.length > 0 ? (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {ollamaModels.map(m => {
                    const selected = settings.ollamaModel === m.name;
                    const isRunning = ollamaRunning.some(r => r.name === m.name);
                    return (
                      <button
                        key={m.name}
                        onClick={() => update('ollamaModel', m.name)}
                        className={`w-full text-left p-2.5  border transition-all ${
                          selected
                            ? 'bg-[#4ade80]/10 border-[#4ade80]/50'
                            : 'bg-[#252535] border-[#383850] hover:border-[#4ade80]/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-0">
                          <div className="flex items-center gap-0 min-w-0">
                            <span className={`text-sm font-mono truncate ${selected ? 'text-[#4ade80]' : 'text-[#e8e8f5]'}`}>{m.name}</span>
                            {isRunning && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5  bg-[#fbbf24]/20 text-[#ffd93d] shrink-0">W RAM</span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-[#8888aa] shrink-0">{formatBytes(m.size)}</span>
                        </div>
                        {(m.family || m.parameterSize || m.quantization) && (
                          <div className="flex items-center gap-0 mt-1 text-[10px] font-mono text-[#8888aa]">
 {m.family && <span> {m.family}</span>}
 {m.parameterSize && <span> {m.parameterSize}</span>}
 {m.quantization && <span>️ {m.quantization}</span>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-[#252535] border border-[#383850]  p-2">
                  <input type="text" value={settings.ollamaModel} onChange={e => update('ollamaModel', e.target.value)} placeholder="llama3" className="w-full bg-[#0f0f17] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#00f5d4]/50 font-mono mb-2" />
                  <div className="text-[10px] text-[#8888aa] font-mono">
                    No wykryto modeli. Run Ollamę i pobierz model poniżej, albo w terminalu: <code className="text-[#4ade80]">ollama pull llama3</code>
                  </div>
                </div>
              )}
            </div>

            {/* Pull new model helper */}
            <div className="bg-[#0f0f17] border border-[#383850]  p-2">
              <div className="text-[10px] font-mono text-[#8888aa] mb-2 uppercase tracking-wider">⬇️ Download nowy model z rejestru Ollama</div>
              <div className="flex gap-0">
                <input
                  type="text"
                  value={ollamaPullName}
                  onChange={e => setOllamaPullName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !ollamaPulling) pullOllamaModel(); }}
                  placeholder="np. llama3, mistral, gemma3, qwen2.5, phi4..."
                  disabled={ollamaPulling}
                  className="flex-1 bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#4ade80]/50 font-mono disabled:opacity-50"
                />
                <button
                  onClick={pullOllamaModel}
                  disabled={ollamaPulling || !ollamaPullName.trim()}
                  className="px-4 py-2  bg-[#4ade80]/10 border border-[#4ade80]/40 text-[#4ade80] hover:bg-[#4ade80]/20 text-xs font-mono disabled:opacity-40"
                >
                  {ollamaPulling ? 'Downloading...' : 'Download'}
                </button>
              </div>
              <div className="text-[10px] text-[#8888aa] font-mono mt-2">
                Popularne modele: <button onClick={() => setOllamaPullName('llama3.1')} className="text-[#4ade80] hover:underline">llama3.1</button>
                {' · '}<button onClick={() => setOllamaPullName('mistral')} className="text-[#4ade80] hover:underline">mistral</button>
                {' · '}<button onClick={() => setOllamaPullName('gemma3')} className="text-[#4ade80] hover:underline">gemma3</button>
                {' · '}<button onClick={() => setOllamaPullName('qwen2.5')} className="text-[#4ade80] hover:underline">qwen2.5</button>
                {' · '}<button onClick={() => setOllamaPullName('phi4')} className="text-[#4ade80] hover:underline">phi4</button>
                {' · '}<button onClick={() => setOllamaPullName('deepseek-r1')} className="text-[#4ade80] hover:underline">deepseek-r1</button>
              </div>
              {ollamaPullResult && (
                <div className={`text-[11px] font-mono mt-2 px-2 py-1  ${
                  ollamaPullResult.ok ? 'text-[#4ade80] bg-[#4ade80]/10' : 'text-[#ff6b6b] bg-[#ef4444]/10'
                }`}>
 {ollamaPullResult.ok ?'' :''}{ollamaPullResult.message}
                </div>
              )}
              <div className="text-[9px] text-[#8888aa]/70 font-mono mt-2">
 ️ Downloading dużych modeli (np. 70B) może trwać wiele minut i wymaga kilkudziesięciu GB RAM/VRAM. Polecam modele 7B-13B na start.
              </div>
            </div>

            {/* Hint how to install Ollama if not running */}
            {ollamaStatus && !ollamaStatus.reachable && (
              <div className="bg-[#252535] border border-[#383850]  p-2 text-[11px] font-mono text-[#8888aa] space-y-1">
                <div className="text-[#e8e8f5]">How uruchomić Ollamę:</div>
                <div>1. Download z <span className="text-[#00f5d4]">https://ollama.com/download</span></div>
                <div>2. Zainstaluj i uruchom aplikację Ollama</div>
                <div>3. W terminalu: <code className="text-[#4ade80]">ollama pull llama3</code></div>
                <div>4. Wróć tutaj i kliknij „Refresh”</div>
              </div>
            )}
          </div>
        )}

        {settings.provider === 'gguf' && (
          <GgufSettings settings={settings} update={update} />
        )}

        {settings.provider === 'custom' && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-0 mb-2">
              <Server size={16} className="text-[#a855f7]" />
              <span className="text-sm font-mono text-[#e8e8f5]">Własny serwer API</span>
            </div>
            <div>
              <label className="text-xs font-mono text-[#8888aa] mb-1 block">URL endpoint</label>
              <input type="text" value={settings.customUrl} onChange={e => update('customUrl', e.target.value)} placeholder="http://192.168.1.100:8080/v1" className="w-full bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#00f5d4]/50 font-mono" />
            </div>
            <div>
              <label className="text-xs font-mono text-[#8888aa] mb-1 block">API Key (opcjonalny)</label>
              <input type={showKeys ? 'text' : 'password'} value={settings.customKey} onChange={e => update('customKey', e.target.value)} placeholder="opcjonalny" className="w-full bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#00f5d4]/50 font-mono" />
            </div>
            <div>
              <label className="text-xs font-mono text-[#8888aa] mb-1 block">Model</label>
              <input type="text" value={settings.customModel} onChange={e => update('customModel', e.target.value)} placeholder="my-model" className="w-full bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#00f5d4]/50 font-mono" />
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <SettingsIcon size={16} className="text-[#ffd93d]" />
            <span className="text-sm font-mono text-[#e8e8f5]">Parametry modelu</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-mono text-[#8888aa] mb-1.5 block">Temperature: {(settings.temperature ?? 0.7).toFixed(1)}</label>
              <input type="range" min="0" max="1.5" step="0.1" value={settings.temperature ?? 0.7} onChange={e => update('temperature', parseFloat(e.target.value))} className="w-full accent-[#00f5d4]" />
              <div className="flex justify-between text-[10px] text-[#8888aa] font-mono mt-1"><span>Precyzyjny</span><span>Kreatywny</span></div>
            </div>
            <div>
              <label className="text-xs font-mono text-[#8888aa] mb-1.5 block">Max tokens: {settings.maxTokens}</label>
              <input type="range" min="256" max="4096" step="256" value={settings.maxTokens} onChange={e => update('maxTokens', parseInt(e.target.value))} className="w-full accent-[#00f5d4]" />
              <div className="flex justify-between text-[10px] text-[#8888aa] font-mono mt-1"><span>Krótkie</span><span>Debtie</span></div>
            </div>
            <div>
              <label className="text-xs font-mono text-[#8888aa] mb-1.5 block">Top-p: {(settings.topP ?? 0.95).toFixed(2)}</label>
              <input type="range" min="0.1" max="1" step="0.05" value={settings.topP ?? 0.95} onChange={e => update('topP', parseFloat(e.target.value))} className="w-full accent-[#00f5d4]" />
              <div className="flex justify-between text-[10px] text-[#8888aa] font-mono mt-1"><span>Fokus</span><span>Losowo</span></div>
            </div>
            <div>
              <label className="text-xs font-mono text-[#8888aa] mb-1.5 block">Frequency penalty: {(settings.frequencyPenalty ?? 0).toFixed(1)}</label>
              <input type="range" min="0" max="2" step="0.1" value={settings.frequencyPenalty ?? 0} onChange={e => update('frequencyPenalty', parseFloat(e.target.value))} className="w-full accent-[#00f5d4]" />
              <div className="flex justify-between text-[10px] text-[#8888aa] font-mono mt-1"><span>None</span><span>Unikaj powtórzeń</span></div>
            </div>
          </div>
        </div>

        {/* ── KONTROLA KOSZTÓW ── */}
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-0 mb-2">
            <Whatins size={16} className="text-[#4ade80]" />
            <span className="text-sm font-mono text-[#e8e8f5]">Kontrola kosztów</span>
            <span className="text-[10px] text-[#8888aa]">— oszczędza kredyty / tokeny</span>
          </div>

          {/* Adaptive max_tokens */}
          <label className="flex items-start gap-0 cursor-pointer bg-[#252535] border border-[#383850]  p-2.5">
            <input
              type="checkbox"
              checked={settings.adaptiveMaxTokens ?? true}
              onChange={e => update('adaptiveMaxTokens', e.target.checked)}
              className="mt-0.5 accent-[#4ade80]"
            />
            <div className="flex-1">
              <div className="text-sm text-[#e8e8f5] flex items-center gap-1">
                <Zap size={12} className="text-[#4ade80]" />
                Adaptacyjny max_tokens
              </div>
              <div className="text-[10px] text-[#8888aa] mt-0.5">
                Krótkie pytania (&lt; {settings.shortPromptThreshold ?? 80} znaków) używają {settings.maxTokensShort ?? 256} tokenów zamiast {settings.maxTokens}. Zapobiega błędom 402 na darmowych kontach.
              </div>
            </div>
          </label>

          {settings.adaptiveMaxTokens && (
            <div className="grid gap-0 md:grid-cols-3 pl-2">
              <div>
                <label className="text-xs font-mono text-[#8888aa] mb-1 block">Krótkie: {settings.maxTokensShort ?? 256}</label>
                <input type="range" min="64" max="1024" step="64" value={settings.maxTokensShort ?? 256} onChange={e => update('maxTokensShort', parseInt(e.target.value))} className="w-full accent-[#4ade80]" />
              </div>
              <div>
                <label className="text-xs font-mono text-[#8888aa] mb-1 block">Debtie: {settings.maxTokensLong ?? 1500}</label>
                <input type="range" min="512" max="4096" step="256" value={settings.maxTokensLong ?? 1500} onChange={e => update('maxTokensLong', parseInt(e.target.value))} className="w-full accent-[#4ade80]" />
              </div>
              <div>
                <label className="text-xs font-mono text-[#8888aa] mb-1 block">Próg (znaki): {settings.shortPromptThreshold ?? 80}</label>
                <input type="range" min="20" max="300" step="10" value={settings.shortPromptThreshold ?? 80} onChange={e => update('shortPromptThreshold', parseInt(e.target.value))} className="w-full accent-[#4ade80]" />
              </div>
            </div>
          )}

          {/* Prompt cache */}
          <label className="flex items-start gap-0 cursor-pointer bg-[#252535] border border-[#383850]  p-2.5">
            <input
              type="checkbox"
              checked={settings.cacheSystemPrompt ?? true}
              onChange={e => update('cacheSystemPrompt', e.target.checked)}
              className="mt-0.5 accent-[#4ade80]"
            />
            <div className="flex-1">
              <div className="text-sm text-[#e8e8f5] flex items-center gap-1">
                <Sparkles size={12} className="text-[#4ade80]" />
                Cache system promptu (~50% taniej)
              </div>
              <div className="text-[10px] text-[#8888aa] mt-0.5">
                Oznacza system prompt jako <code className="text-[#ffd93d]">cache_control: ephemeral</code>. OpenRouter / Anthropic liczą go raz, potem z 50% zniżką. Dla BOKA (duży soul + memory context) to oszczędność 30-50% na każdym zapytaniu.
              </div>
            </div>
          </label>

          {/* Stop sequences */}
          <div className="bg-[#252535] border border-[#383850]  p-2.5">
            <div className="text-sm text-[#e8e8f5] flex items-center gap-1 mb-1">
              <Square size={12} className="text-[#ffd93d]" />
              Stop sequences
              <span className="text-[10px] text-[#8888aa] font-normal">— wymusza krótsze odpowiedzi (max 4)</span>
            </div>
            <input
              type="text"
              value={(settings.stopSequences || []).join(', ')}
              onChange={e => {
                const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
                update('stopSequences', arr);
              }}
              placeholder="np. \n\n\n (przecinek = nowy sekwens)"
              className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-xs font-mono text-[#e8e8f5]"
            />
            <div className="text-[10px] text-[#8888aa] mt-1">
              Np. <code className="text-[#ffd93d]">{'\\n\\n\\n'}</code> zatrzyma generowanie po 3 pustych liniach. Puste = wyłączone.
            </div>
          </div>
        </div>

        {/* ── ASR ENGINE SELECTOR ── */}
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-0 mb-2">
            <Mic size={16} className="text-[#ff6b6b]" />
            <span className="text-sm font-mono text-[#e8e8f5]">Speech recognition (ASR)</span>
          </div>
          <div className="grid gap-0 md:grid-cols-3">
            {([
              { id: 'auto' as const, label: 'Auto', desc: 'Whisper lokalny jeśli dostępny, inaczej chmura', icon: <Zap size={14} /> },
              { id: 'whisper' as const, label: 'Whisper (lokalny)', desc: 'Najlepsza jakość PL, wymaga serwera na :5100', icon: <Mic size={14} /> },
                          ]).map(e => (
              <button
                key={e.id}
                onClick={() => update('asrEngine', e.id)}
                className={`p-2  border text-left transition-all ${
                  settings.asrEngine === e.id
                    ? 'bg-[#ff6b6b]/10 border-[#ff6b6b]/50 text-[#ff6b6b]'
                    : 'bg-[#252535] border-[#383850] text-[#8888aa] hover:border-[#ff6b6b]/30'
                }`}
              >
                <div className="flex items-center gap-0 mb-1">
                  {e.icon}
                  <span className="text-sm font-mono">{e.label}</span>
                </div>
                <div className="text-[10px] font-mono opacity-70">{e.desc}</div>
              </button>
            ))}
          </div>
          {(settings.asrEngine === 'whisper' || settings.asrEngine === 'auto') && (
            <div className="grid gap-0 md:grid-cols-2">
              <div>
                <label className="text-xs font-mono text-[#8888aa] mb-1 block">Whisper URL</label>
                <input type="text" value={settings.whisperUrl} onChange={e => update('whisperUrl', e.target.value)} placeholder="http://127.0.0.1:5100" className="w-full bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#ff6b6b]/50 font-mono" />
              </div>
              <div>
                <label className="text-xs font-mono text-[#8888aa] mb-1 block">Model Whisper</label>
                <select value={settings.whisperModel} onChange={e => update('whisperModel', e.target.value)} className="w-full bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] focus:outline-none focus:border-[#ff6b6b]/50 font-mono">
                  <option value="tiny">tiny — najszybszy, podstawowa jakość</option>
                  <option value="base">base — szybki, dobra jakość</option>
                  <option value="small">small — szybkość + jakość</option>
                  <option value="medium">medium — najlepsza jakość PL (zalecany)</option>
                  <option value="large-v3">large-v3 — maksymalna jakość (wolny)</option>
                </select>
              </div>
            </div>
          )}
          <div className="text-[10px] font-mono text-[#8888aa]">
            Run Whisper: python3 scripts/whisper/whisper-server.py --model {settings.whisperModel}
          </div>
        </div>

        <div className="flex items-center gap-0 mb-2">
          <button onClick={save} disabled={saving} className="flex items-center gap-0 px-5 py-2.5  bg-[#00f5d4] text-[#0a0a0f] font-mono text-sm disabled:opacity-50 hover:bg-[#00dbc4] transition-all">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            Save
          </button>
          <button onClick={test} disabled={testing} className="flex items-center gap-0 px-5 py-2.5  bg-[#252535] border border-[#383850] text-[#e8e8f5] font-mono text-sm disabled:opacity-50 hover:border-[#00f5d4]/50 transition-all">
            {testing ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
            Test
          </button>
        </div>

        {testResult && (
          <div className={`p-2  border text-sm font-mono ${testResult.ok ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]' : 'bg-[#ff6b6b]/10 border-[#ff6b6b]/30 text-[#ff6b6b]'}`}>
            <div className="flex items-center gap-0">
              {testResult.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {testResult.message}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// GGUF SETTINGS — wybór pliku .gguf z dysku
// ═══════════════════════════════════════════
function GgufSettings({ settings, update }: {
  settings: SettingsState;
  update: (key: keyof SettingsState, value: string | number) => void;
}) {
  const [ggufStatus, setGgufStatus] = useState<{ running: boolean; model: string; port: number; llamaServerDetected: string | null } | null>(null);
  const [ggufBusy, setGgufBusy] = useState<'start' | 'stop' | null>(null);
  const [ggufMessage, setGgufMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const serverInputRef = useRef<HTMLInputElement>(null);

  // Load status on mount + when provider switches to gguf
  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/gguf-server');
      if (res.ok) {
        const data = await res.json();
        setGgufStatus(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Scan for .gguf files in common locations
  const scanForModels = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/gguf-scan');
      if (res.ok) {
        const data = await res.json();
        setDetectedModels(data.files || []);
      }
    } catch { /* ignore */ }
    setScanning(false);
  };

  const startServer = async () => {
    setGgufBusy('start');
    setGgufMessage(null);
    try {
      // Save settings first so server reads latest config
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const res = await fetch('/api/gguf-server', { method: 'POST' });
      const data = await res.json();
      setGgufMessage({ ok: !!data.ok, message: data.ok ? 'Server uruchomiony' : (data.error || 'Error uruchamiania') });
      loadStatus();
    } catch (e) {
      setGgufMessage({ ok: false, message: e instanceof Error ? e.message : 'Error' });
    }
    setGgufBusy(null);
    setTimeout(() => setGgufMessage(null), 6000);
  };

  const stopServer = async () => {
    setGgufBusy('stop');
    try {
      await fetch('/api/gguf-server', { method: 'DELETE' });
      setGgufMessage({ ok: true, message: 'Server zatrzymany' });
      loadStatus();
    } catch (e) {
      setGgufMessage({ ok: false, message: e instanceof Error ? e.message : 'Error' });
    }
    setGgufBusy(null);
    setTimeout(() => setGgufMessage(null), 4000);
  };

  const pickFile = () => fileInputRef.current?.click();
  const pickServer = () => serverInputRef.current?.click();

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // In browser we can't get full path, but file.name is available
      // User must type the path manually OR we use file.path (Electron only)
      const filePath = (file as File & { path?: string }).path || file.name;
      update('ggufFilePath', filePath);
    }
  };

  const onServerPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const filePath = (file as File & { path?: string }).path || file.name;
      update('ggufServerPath', filePath);
    }
  };

  return (
    <div className="mb-6 space-y-2">
      <div className="flex items-center gap-0 mb-2">
        <HardDrive size={16} className="text-[#ffd93d]" />
        <span className="text-sm font-mono text-[#e8e8f5]">File GGUF (lokalny przez llama.cpp)</span>
      </div>

      <div className="bg-[#fbbf24]/5 border border-[#fbbf24]/20  p-2 text-[11px] font-mono text-[#8888aa] leading-relaxed">
        <div className="text-[#e8e8f5] mb-1">How to działa?</div>
        Wskaż plik <code className="text-[#ffd93d]">.gguf</code> na dysku (np. z HuggingFace).
        BOKA uruchomi <code className="text-[#ffd93d]">llama-server</code> (z llama.cpp) w tle,
        który załaduje ten model i wystawi OpenAI-compat API na wybranym porcie.
        Pełna prywatność — model działa lokalnie, bez internetu.
      </div>

      {/* File GGUF */}
      <div>
 <label className="text-xs font-mono text-[#8888aa] mb-1 block"> File modelu .gguf</label>
        <div className="flex gap-0">
          <input
            type="text"
            value={settings.ggufFilePath}
            onChange={e => update('ggufFilePath', e.target.value)}
            placeholder="C:\Models\llama-3-8b-instruct.Q4_K_M.gguf"
            className="flex-1 bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#fbbf24]/50 font-mono"
          />
          <button
            onClick={pickFile}
            className="px-3 py-2  bg-[#252535] border border-[#383850] text-[#8888aa] hover:border-[#fbbf24]/30 text-xs font-mono flex items-center gap-1"
            title="Wybierz plik (wymaga Electron/full path — w przeglądarce wpisz ścieżkę ręcznie)"
          >
            <FolderOpen size={14} /> Wybierz
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gguf,.bin"
            onChange={onFilePicked}
            className="hidden"
          />
        </div>
        <div className="text-[10px] text-[#8888aa] font-mono mt-1">
 Download modele GGUF z <a href="https://huggingface.co/models?other=gguf" target="_blank" rel="noopener" className="text-[#ffd93d] hover:underline">HuggingFace</a>.
          Polecam kwantyzację <code className="text-[#ffd93d]">Q4_K_M</code> (dobry kompromis rozmiar/jakość).
        </div>
      </div>

      {/* Skanuj dysk w poszukiwaniu modeli */}
      <div>
        <button
          onClick={scanForModels}
          disabled={scanning}
          className="text-[11px] font-mono text-[#ffd93d] hover:underline disabled:opacity-50"
        >
 {scanning ?' Skanuję...' :' Skanuj dysk w poszukiwaniu plików .gguf'}
        </button>
        {detectedModels.length > 0 && (
          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
            {detectedModels.map(p => (
              <button
                key={p}
                onClick={() => update('ggufFilePath', p)}
                className={`block w-full text-left text-[11px] font-mono px-2 py-1.5  border ${
                  settings.ggufFilePath === p
                    ? 'bg-[#fbbf24]/10 border-[#fbbf24]/40 text-[#ffd93d]'
                    : 'bg-[#252535] border-[#383850] text-[#8888aa] hover:border-[#fbbf24]/30'
                }`}
                title={p}
              >
 {p.split(/[\\/]/).pop()} <span className="opacity-60">— {p}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Path do llama-server */}
      <div>
        <label className="text-xs font-mono text-[#8888aa] mb-1 block">
 ️ File wykonywalny llama-server <span className="opacity-60">(opcjonalny — auto-detekcja)</span>
        </label>
        <div className="flex gap-0">
          <input
            type="text"
            value={settings.ggufServerPath}
            onChange={e => update('ggufServerPath', e.target.value)}
            placeholder="C:\llama.cpp\build\bin\Release\llama-server.exe"
            className="flex-1 bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#fbbf24]/50 font-mono"
          />
          <button
            onClick={pickServer}
            className="px-3 py-2  bg-[#252535] border border-[#383850] text-[#8888aa] hover:border-[#fbbf24]/30 text-xs font-mono flex items-center gap-1"
          >
            <FolderOpen size={14} /> Wybierz
          </button>
          <input
            ref={serverInputRef}
            type="file"
            accept=".exe,.bin,llama-server"
            onChange={onServerPicked}
            className="hidden"
          />
        </div>
        {ggufStatus?.llamaServerDetected ? (
          <div className="text-[10px] text-[#4ade80] font-mono mt-1">
 Wykryto: {ggufStatus.llamaServerDetected}
          </div>
        ) : (
          <div className="text-[10px] text-[#ff6b6b] font-mono mt-1">
 No wykryto llama-server. Download z <a href="https://github.com/ggerganov/llama.cpp/releases" target="_blank" rel="noopener" className="underline">github.com/ggerganov/llama.cpp/releases</a>
          </div>
        )}
      </div>

      {/* Port + kontekst + GPU layers */}
      <div className="grid grid-cols-3 gap-0">
        <div>
          <label className="text-xs font-mono text-[#8888aa] mb-1 block">Port</label>
          <input
            type="number"
            value={settings.ggufPort}
            onChange={e => update('ggufPort', parseInt(e.target.value) || 8080)}
            className="w-full bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] focus:outline-none focus:border-[#fbbf24]/50 font-mono"
          />
        </div>
        <div>
          <label className="text-xs font-mono text-[#8888aa] mb-1 block">Kontekst</label>
          <input
            type="number"
            value={settings.ggufWhatntextSize}
            onChange={e => update('ggufWhatntextSize', parseInt(e.target.value) || 4096)}
            step={512}
            className="w-full bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] focus:outline-none focus:border-[#fbbf24]/50 font-mono"
          />
        </div>
        <div>
          <label className="text-xs font-mono text-[#8888aa] mb-1 block">GPU layers (-1=all)</label>
          <input
            type="number"
            value={settings.ggufGpuLayers}
            onChange={e => update('ggufGpuLayers', parseInt(e.target.value))}
            className="w-full bg-[#252535] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5] focus:outline-none focus:border-[#fbbf24]/50 font-mono"
          />
        </div>
      </div>

      {/* Sterowanie serwerem */}
      <div className="flex items-center gap-0 pt-2">
        {ggufStatus?.running ? (
          <button
            onClick={stopServer}
            disabled={ggufBusy !== null}
            className="px-4 py-2  bg-[#ff6b6b]/10 border border-[#ff6b6b]/40 text-[#ff6b6b] hover:bg-[#ff6b6b]/20 text-xs font-mono flex items-center gap-0 disabled:opacity-50"
          >
            <Square size={14} /> {ggufBusy === 'stop' ? 'Zatrzymuję...' : 'Stop serwer'}
          </button>
        ) : (
          <button
            onClick={startServer}
            disabled={ggufBusy !== null || !settings.ggufFilePath}
            className="px-4 py-2  bg-[#4ade80]/10 border border-[#4ade80]/40 text-[#4ade80] hover:bg-[#4ade80]/20 text-xs font-mono flex items-center gap-0 disabled:opacity-50"
          >
            <Play size={14} /> {ggufBusy === 'start' ? 'Uruchamiam (do 60s)...' : 'Run serwer'}
          </button>
        )}
        <button
          onClick={loadStatus}
          className="px-3 py-2  bg-[#252535] border border-[#383850] text-[#8888aa] hover:border-[#fbbf24]/30 text-xs font-mono"
        >
          Refresh status
        </button>
      </div>

      {/* Status serwera */}
      {ggufStatus && (
        <div className={`text-[11px] font-mono px-3 py-2  border ${
          ggufStatus.running
            ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]'
            : 'bg-[#6b6b8d]/10 border-[#6b6b8d]/30 text-[#8888aa]'
        }`}>
          {ggufStatus.running ? (
            <span>
 Server działa na porcie {ggufStatus.port}
              {ggufStatus.model && <span className="opacity-70"> · model: {ggufStatus.model.split(/[\\/]/).pop()}</span>}
            </span>
          ) : (
            <span>○ Server zatrzymany</span>
          )}
        </div>
      )}

      {/* Wiadomość akcji */}
      {ggufMessage && (
        <div className={`text-[11px] font-mono px-3 py-2  ${
          ggufMessage.ok ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#ff6b6b]/10 text-[#ff6b6b]'
        }`}>
 {ggufMessage.ok ?'' :''}{ggufMessage.message}
        </div>
      )}

      {/* Instrukcja instalacji llama-server */}
      {!ggufStatus?.llamaServerDetected && (
        <div className="bg-[#252535] border border-[#383850]  p-2 text-[11px] font-mono text-[#8888aa] space-y-1">
          <div className="text-[#e8e8f5]">How zainstalować llama-server:</div>
          <div>1. Wejdź na <a href="https://github.com/ggerganov/llama.cpp/releases" target="_blank" rel="noopener" className="text-[#ffd93d] underline">github.com/ggerganov/llama.cpp/releases</a></div>
          <div>2. Download <code className="text-[#ffd93d]">llama-bXXXX-bin-win-cublas-cu12.X.zip</code> (dla NVIDIA GPU)</div>
          <div>   lub <code className="text-[#ffd93d]">llama-bXXXX-bin-win-avx2.zip</code> (dla CPU)</div>
          <div>3. Rozpakuj np. do <code className="text-[#ffd93d]">C:\llama.cpp\</code></div>
          <div>4. Wskaż <code className="text-[#ffd93d]">llama-server.exe</code> w polu powyżej</div>
          <div>5. Wskaż plik <code className="text-[#ffd93d]">.gguf</code> i kliknij „Run serwer”</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// MOI AGENTI — społeczność agentów AI do debat
// ═══════════════════════════════════════════

interface ExternalAgent {
  id: string;
  name: string;
  specialty: string;
  description: string;
  color: string;
  glyph: string;
  avatar?: string;
  connected: boolean;
  debateWins: number;
  debateParticipations: number;
  author: string;
}

const FEATURED_AGENTS: ExternalAgent[] = [
  { id: 'sage', name: 'Sage', specialty: 'Filozof · etyka', description: 'Spokojny myśliciel. Zadaje głębokie pytania i patrzy z perspektywy długoterminowej.', color: '#6ec6e7', glyph: 'S', connected: true, debateWins: 12, debateParticipations: 28, author: 'BOKA' },
  { id: 'inżynier', name: 'Inżynier', specialty: 'Praktyk · realizacja', description: 'Konkretny i zorientowany na działanie. Zawsze pyta: jak to zrealizować?', color: '#4ade80', glyph: 'I', connected: true, debateWins: 8, debateParticipations: 22, author: 'BOKA' },
  { id: 'sceptyk', name: 'Sceptyk', specialty: 'Krytyk · analiza', description: 'Szuka luk w argumentacji. No ufa oczywistym rozwiązaniom.', color: '#ff6b6b', glyph: 'S', connected: true, debateWins: 15, debateParticipations: 30, author: 'BOKA' },
  { id: 'kreator', name: 'Kreator', specialty: 'Kreatywny · wizjoner', description: 'Generatee nieoczywiste pomysły. Łączy rzeczy, które wydają się niełączyć.', color: '#a855f7', glyph: 'K', connected: true, debateWins: 6, debateParticipations: 18, author: 'BOKA' },
  { id: 'prawnik-ai', name: 'Lex', specialty: 'Prawo · regulacje', description: 'Analyzee konsekwencje prawne. Zna polskie i unijne regulacje AI.', color: '#ffd93d', glyph: 'L', connected: false, debateWins: 9, debateParticipations: 15, author: 'Whatmmunity' },
  { id: 'ekonomista-ai', name: 'Adam', specialty: 'Ekonomia · finanse', description: 'Liczy koszty i zyski. Ocenia opłacalność i ryzyko finansowe.', color: '#4ade80', glyph: 'A', connected: false, debateWins: 11, debateParticipations: 20, author: 'Whatmmunity' },
  { id: 'psycholog-ai', name: 'Mira', specialty: 'Psychologia · relacje', description: 'Patrzy przez pryzmat emocji i relacji międzyludzkich.', color: '#f472b6', glyph: 'M', connected: false, debateWins: 7, debateParticipations: 14, author: 'Whatmmunity' },
  { id: 'tech-guru', name: 'Nexus', specialty: 'Technologia · AI', description: 'Specjalista od trendów technologicznych i sztucznej inteligencji.', color: '#00f5d4', glyph: 'N', connected: false, debateWins: 13, debateParticipations: 25, author: 'Whatmmunity' },
];

export function AgentsTab() {
  const [agents, setAgents] = useState<ExternalAgent[]>(FEATURED_AGENTS);
  const [filter, setFilter] = useState<'all' | 'connected' | 'community'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', specialty: '', description: '', color: '#00f5d4' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const toggleWhatnnect = (id: string) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, connected: !a.connected } : a));
  };

  const addAgent = () => {
    if (!newAgent.name.trim()) return;
    const a: ExternalAgent = {
      id: `custom-${Date.now()}`,
      name: newAgent.name.trim(),
      specialty: newAgent.specialty.trim() || 'Własny agent',
      description: newAgent.description.trim() || 'Agent dodany przez użytkownika.',
      color: newAgent.color,
      glyph: newAgent.name.trim().charAt(0).toUpperCase(),
      connected: true,
      debateWins: 0,
      debateParticipations: 0,
      author: 'Ty',
    };
    setAgents(prev => [...prev, a]);
    setNewAgent({ name: '', specialty: '', description: '', color: '#00f5d4' });
    setShowAddForm(false);
  };

  const removeAgent = (id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const startEdit = (a: ExternalAgent) => {
    setEditingId(a.id);
    setEditName(a.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveEdit = (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setAgents(prev => prev.map(a => a.id === id ? {
      ...a,
      name: trimmed,
      glyph: trimmed.charAt(0).toUpperCase(),
    } : a));
    setEditingId(null);
    setEditName('');
  };

  const filtered = agents.filter(a => {
    if (filter === 'connected') return a.connected;
    if (filter === 'community') return a.author === 'Whatmmunity';
    return true;
  });

  const connectedWhatunt = agents.filter(a => a.connected).length;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── SIDEBAR ── */}
      <aside className="w-64 shrink-0 border-r border-[#383850] bg-[#181828] flex flex-col">
        <div className="px-3 py-2 border-b border-[#383850] flex items-center justify-between">
          <h2 className="font-pixel text-[10px] text-[#00f5d4]">MOI AGENTI</h2>
          <button onClick={() => setShowAddForm(s => !s)}
            className="w-6 h-6 flex items-center justify-center bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4] hover:bg-[#00f5d4]/20"
            title="Add własnego agenta">
            <Plus size={12} />
          </button>
        </div>

        {/* Stats */}
        <div className="px-3 py-2 border-b border-[#383850]">
          <div className="flex items-center gap-3 text-[10px] font-mono text-[#8888aa]">
            <span><span className="text-[#4ade80]">{connectedWhatunt}</span> połączonych</span>
            <span><span className="text-[#e8e8f5]">{agents.length}</span> łącznie</span>
          </div>
        </div>

        {/* Filter */}
        <div className="px-3 py-2 border-b border-[#383850] flex gap-0">
          {(['all', 'connected', 'community'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 px-2 py-1 text-[9px] font-mono border transition-all ${filter === f ? 'bg-[#00f5d4]/10 text-[#00f5d4] border-[#00f5d4]/50' : 'bg-transparent text-[#8888aa] border-[#383850] hover:text-[#e8e8f5]'}`}>
              {f === 'all' ? 'Wszyscy' : f === 'connected' ? 'Połączeni' : 'Społeczność'}
            </button>
          ))}
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map(a => (
            <div key={a.id}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-all border-l-2 ${a.connected ? 'border-l-[#4ade80] bg-[#252535]/50' : 'border-l-transparent hover:bg-[#1a1a28]'}`}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-pixel text-xs shrink-0"
                style={{ backgroundWhatlor: `${a.color}1a`, color: a.color, border: `1px solid ${a.color}66` }}>
                {a.glyph}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-[#e8e8f5] truncate">{a.name}</div>
                <div className="text-[9px] text-[#8888aa] font-mono truncate">{a.specialty}</div>
              </div>
              {a.connected && <div className="w-2 h-2 rounded-full bg-[#4ade80] shrink-0" />}
            </div>
          ))}
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="border-t border-[#383850] p-3 space-y-2 bg-[#12121c]">
            <div className="text-[9px] font-mono uppercase text-[#00f5d4]">New agent</div>
            <input type="text" value={newAgent.name} onChange={e => setNewAgent(p => ({ ...p, name: e.target.value }))}
              placeholder="Imię agenta" autoFocus
              className="w-full bg-[#181828] border border-[#383850] px-2 py-1 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#00f5d4]/50 font-mono" />
            <input type="text" value={newAgent.specialty} onChange={e => setNewAgent(p => ({ ...p, specialty: e.target.value }))}
              placeholder="Specjalność (np. Prawo)"
              className="w-full bg-[#181828] border border-[#383850] px-2 py-1 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#00f5d4]/50 font-mono" />
            <textarea value={newAgent.description} onChange={e => setNewAgent(p => ({ ...p, description: e.target.value }))}
              placeholder="Description osobowości..." rows={2}
              className="w-full bg-[#181828] border border-[#383850] px-2 py-1 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#00f5d4]/50 font-mono resize-none" />
            <div className="flex items-center gap-2">
              <label className="text-[9px] font-mono text-[#8888aa]">Whatlor</label>
              <input type="color" value={newAgent.color} onChange={e => setNewAgent(p => ({ ...p, color: e.target.value }))}
                className="w-6 h-6 bg-transparent border-0 cursor-pointer" />
            </div>
            <div className="flex gap-1">
              <button onClick={addAgent} disabled={!newAgent.name.trim()}
                className="flex-1 px-2 py-1 text-[10px] font-mono bg-[#00f5d4]/20 text-[#00f5d4] border border-[#00f5d4]/40 hover:bg-[#00f5d4]/30 disabled:opacity-30">
                Add
              </button>
              <button onClick={() => setShowAddForm(false)}
                className="px-2 py-1 text-[10px] font-mono bg-[#252535] border border-[#383850] text-[#8888aa]">
                Cancel
                </button>
            </div>
          </div>
        )}
      </aside>

      {/* ── CONTENT: agent cards grid ── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h2 className="font-pixel text-sm text-[#00f5d4] mb-2">SPOŁECZNOŚĆ AGENTÓW</h2>
            <p className="text-xs text-[#8888aa] font-mono">
              Podłącz agentów AI do debat BOKA. Każdy agent ma swoją osobowość i specjalność.
              Połączonych agentów możesz zaprosić do debaty — pojawią się jako orby po prawej stronie.
            </p>
          </div>

          {/* Agent cards */}
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map(a => (
              <div key={a.id}
                className={`p-4 border transition-all ${a.connected ? 'bg-[#252535] border-[#4ade80]/30' : 'bg-[#181828] border-[#383850] hover:border-[#8888aa]/30'}`}>
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-pixel text-lg shrink-0"
                    style={{ backgroundWhatlor: `${a.color}1a`, color: a.color, border: `2px solid ${a.color}66` }}>
                    {editingId === a.id ? (editName.trim().charAt(0).toUpperCase() || a.glyph) : a.glyph}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === a.id ? (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEdit(a.id);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          autoFocus
                          maxLength={32}
                          placeholder="Imię agenta"
                          className="w-full bg-[#181828] border border-[#00f5d4]/50 px-2 py-1 text-sm font-mono font-bold text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#00f5d4]"
                        />
                        <div className="flex items-center gap-1">
                          <button onClick={() => saveEdit(a.id)} disabled={!editName.trim()}
                            className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono bg-[#00f5d4]/20 text-[#00f5d4] border border-[#00f5d4]/40 hover:bg-[#00f5d4]/30 disabled:opacity-30">
                            <Check size={10} /> Save
                          </button>
                          <button onClick={cancelEdit}
                            className="px-2 py-0.5 text-[9px] font-mono bg-[#252535] border border-[#383850] text-[#8888aa] hover:text-[#e8e8f5]">
                            Cancel
                          </button>
                          <span className="text-[8px] font-mono text-[#5a5a78] ml-1">Enter · Esc</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-bold text-[#e8e8f5]">{a.name}</span>
                          {a.connected && (
                            <span className="text-[8px] font-mono px-1.5 py-0.5 bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/30">
                              POŁĄCZONY
                            </span>
                          )}
                          <button onClick={() => startEdit(a)}
                            className="ml-auto p-1 text-[#5a5a78] hover:text-[#00f5d4] transition-colors"
                            title="Edit imię">
                            <Pencil size={11} />
                          </button>
                        </div>
                        <div className="text-[10px] font-mono text-[#8888aa]">{a.specialty}</div>
                        <div className="text-[9px] font-mono text-[#5a5a78] mt-0.5">przez {a.author}</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-[#8888aa] font-mono leading-relaxed mb-3">{a.description}</p>

                {/* Stats */}
                <div className="flex items-center gap-4 mb-3 text-[10px] font-mono text-[#5a5a78]">
                  <span><span className="text-[#4ade80]">{a.debateWins}</span> wygrane</span>
                  <span><span className="text-[#e8e8f5]">{a.debateParticipations}</span> debat</span>
                  <span>{a.debateParticipations > 0 ? `${Math.round(a.debateWins / a.debateParticipations * 100)}%` : '—'} skuteczność</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button onClick={() => toggleWhatnnect(a.id)}
                    className={`flex-1 px-3 py-1.5 text-[10px] font-mono border transition-all ${
                      a.connected
                        ? 'bg-[#ff6b6b]/10 text-[#ff6b6b] border-[#ff6b6b]/30 hover:bg-[#ff6b6b]/20'
                        : 'bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30 hover:bg-[#4ade80]/20'
                    }`}>
                    {a.connected ? 'Odłącz' : 'Połącz'}
                  </button>
                  {a.author === 'Ty' && (
                    <button onClick={() => removeAgent(a.id)}
                      className="px-2 py-1.5 text-[10px] font-mono bg-[#252535] border border-[#383850] text-[#8888aa] hover:text-[#ff6b6b]"
                      title="Delete agenta">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="text-center py-16">
              <Bot size={48} className="text-[#383850] mx-auto mb-3" />
              <div className="text-sm text-[#8888aa] font-mono">None agentów w tej kategorii</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// APPS TAB (zachowane — dostęp przez backend)
// ═══════════════════════════════════════════ — zarządzanie własnymi appkami
// ═══════════════════════════════════════════
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

