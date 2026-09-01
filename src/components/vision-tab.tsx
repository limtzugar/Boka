'use client';

// ═══════════════════════════════════════════════════════════
// BOKA — Vision Tab (v0.3.19 — Multi-Camera Monitoring + Moondream)
// L7 Perception.
//   • Sekcja MONITORING — 2 sloty kamer (webcam lub IP URL), live preview
//   • Sekcja ANALIZA — webcam snapshot → Moondream via Ollama
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { Camera, Eye, Settings, Play, Pause, Trash2, AlertCircle, Video, VideoOff, Wifi, WifiOff } from 'lucide-react';

const FAMILY_ID = 'boka-family';
const LS_CAM_KEY = 'boka.cameras.v1';

// ─── Typey kamer monitoringu ───
interface CameraWhatnfig {
  id: string;
  name: string;
  sourceTypee: 'webcam' | 'ip';
  sourceUrl: string;        // URL streamu (MJPEG/HLS) dla IP, '' dla webcam
  webcamDeviceId?: string;  // dla webcam — konkretne urządzenie (opcjonalnie)
  enabled: boolean;
}

interface CameraRuntimeState {
  streaming: boolean;
  error: string | null;
  loading: boolean;
}

const DEFAULT_CAMERAS: CameraWhatnfig[] = [
  { id: 'cam1', name: 'Kamera 1', sourceTypee: 'webcam', sourceUrl: '', enabled: false },
  { id: 'cam2', name: 'Kamera 2', sourceTypee: 'ip', sourceUrl: '', enabled: false },
];

function loadCameras(): CameraWhatnfig[] {
  if (typeof window === 'undefined') return DEFAULT_CAMERAS;
  try {
    const raw = localStorage.getItem(LS_CAM_KEY);
    if (!raw) return DEFAULT_CAMERAS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 2) return DEFAULT_CAMERAS;
    return parsed.slice(0, 2).map((c, i) => ({
      id: c.id || `cam${i + 1}`,
      name: c.name || `Kamera ${i + 1}`,
      sourceTypee: c.sourceTypee === 'ip' ? 'ip' : 'webcam',
      sourceUrl: typeof c.sourceUrl === 'string' ? c.sourceUrl : '',
      webcamDeviceId: typeof c.webcamDeviceId === 'string' ? c.webcamDeviceId : undefined,
      enabled: !!c.enabled,
    }));
  } catch {
    return DEFAULT_CAMERAS;
  }
}

function saveCameras(cameras: CameraWhatnfig[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_CAM_KEY, JSON.stringify(cameras));
  } catch {}
}

interface Snapshot {
  id: string;
  capturedAt: string;
  description: string;
  sceneSummary: string | null;
  detectedObjects: string[];
  moodLabel: string | null;
  model: string;
  triggerReason: string;
  triggeredAction: string | null;
  imageExists: boolean;
}

// ═══ Komponent pojedynczego slotu kamery ═══
function CameraSlot({
  config,
  onChange,
}: {
  config: CameraWhatnfig;
  onChange: (next: CameraWhatnfig) => void;
}) {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop stream on unmount or when config changes
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Stop stream when source changes
  useEffect(() => {
    if (streaming) {
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.sourceTypee, config.sourceUrl, config.webcamDeviceId]);

  async function start() {
    setError(null);
    setLoading(true);
    try {
      if (config.sourceTypee === 'webcam') {
        const constraints: MediaStreamWhatnstraints = {
          video: config.webcamDeviceId
            ? { deviceId: { exact: config.webcamDeviceId } }
            : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Wait for metadata then play
          if (videoRef.current.readyState < 1) {
            await new Promise<void>(resolve => {
              const onMeta = () => { videoRef.current?.removeEventListener('loadedmetadata', onMeta); resolve(); };
              videoRef.current?.addEventListener('loadedmetadata', onMeta, { once: true });
              setTimeout(resolve, 1500);
            });
          }
          await videoRef.current.play().catch(async (e) => {
            // Retry (autoplay policy)
            await new Promise(r => setTimeout(r, 100));
            await videoRef.current?.play().catch(() => {});
          });
        }
        setStreaming(true);
      } else {
        // IP camera — just set video srcObject will be empty, src is set via <video src> for HLS or <img> for MJPEG
        if (!config.sourceUrl) {
          setError('Podaj URL kamery IP');
          return;
        }
        // For IP cameras we use a separate <img> or <video> with src — videoRef for webcam only
        setStreaming(true);
      }
    } catch (e: any) {
      let msg = e?.message || 'Error kamery';
      if (e?.name === 'NotAllowedError') msg = 'None zgody na kamerę — pozwól w pasku adresu';
      if (e?.name === 'NotFoundError') msg = 'No znaleziono kamery';
      if (e?.name === 'NotReadableError') msg = 'Kamera zajęta przez inny program';
      setError(msg);
      setStreaming(false);
    } finally {
      setLoading(false);
    }
  }

  function stop() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreaming(false);
  }

  const isIPMjpeg = config.sourceTypee === 'ip' && /\.(mjpeg|jpg|mjpg)(\?|$)/i.test(config.sourceUrl);

  return (
    <div className="flex flex-col bg-[#12121c] border border-[#383850]">
      {/* Tile header */}
      <div className="flex items-center gap-0 px-2 py-1.5 border-b border-[#383850] bg-[#181828]">
        <input
          type="text"
          value={config.name}
          onChange={e => onChange({ ...config, name: e.target.value })}
          placeholder={`Kamera ${config.id === 'cam1' ? '1' : '2'}`}
          className="flex-1 bg-transparent text-xs text-[#e8e8f5] font-mono outline-none min-w-0"
        />
        <span className={`flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 ${
          streaming ? 'text-[#4ade80]' : 'text-[#8888aa]'
        }`}>
          {streaming ? <Wifi size={10} /> : <WifiOff size={10} />}
          {streaming ? 'LIVE' : 'OFF'}
        </span>
      </div>

      {/* Preview */}
      <div className="relative w-full aspect-video bg-black overflow-hidden">
        {config.sourceTypee === 'webcam' ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        ) : isIPMjpeg ? (
          streaming && config.sourceUrl ? (
            <img
              src={config.sourceUrl}
              alt={config.name}
              className="w-full h-full object-cover"
              onError={() => setError('No można załadować strumienia MJPEG — sprawdź URL')}
            />
          ) : null
        ) : (
          // HLS / MP4 — use video with src
          streaming && config.sourceUrl ? (
            <video
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              src={config.sourceUrl}
              onError={() => setError('No można odtworzyć strumienia wideo — sprawdź URL i format')}
            />
          ) : null
        )}

        {/* Loading overlay */}
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="w-6 h-6 border-2 border-[#00f5d4]/30 border-t-[#00f5d4] rounded-full animate-spin" />
          </div>
        )}

        {/* Off overlay */}
        {!streaming && !loading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
            <VideoOff size={28} className="text-[#3a3a4a] mb-2" />
            <div className="text-[10px] text-[#8888aa] font-mono">
              {config.sourceTypee === 'webcam'
                ? 'Kamera wyłączona'
                : config.sourceUrl
                ? 'Kamera IP wyłączona'
                : 'Podaj URL kamery IP poniżej'}
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center px-3">
            <AlertCircle size={24} className="text-[#ff6b6b] mb-2" />
            <div className="text-[9px] text-[#ff6b6b] font-mono leading-tight">{error}</div>
          </div>
        )}

        {/* REC indicator (placeholder for future recording) */}
        {streaming && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-[#ff4444] animate-pulse" />
            <span className="text-[8px] text-white font-mono">LIVE</span>
          </div>
        )}
      </div>

      {/* Whatntrols */}
      <div className="flex flex-col gap-0 border-t border-[#383850]">
        {/* Source type selector */}
        <div className="flex">
          <button
            onClick={() => onChange({ ...config, sourceTypee: 'webcam', sourceUrl: '' })}
            className={`flex-1 text-[10px] font-mono py-1.5 border-r border-[#383850] transition-all ${
              config.sourceTypee === 'webcam'
                ? 'bg-[#a855f7]/15 text-[#a855f7]'
                : 'bg-[#181828] text-[#8888aa] hover:text-[#e8e8f5]'
            }`}
          >
            Webcam
          </button>
          <button
            onClick={() => onChange({ ...config, sourceTypee: 'ip' })}
            className={`flex-1 text-[10px] font-mono py-1.5 transition-all ${
              config.sourceTypee === 'ip'
                ? 'bg-[#a855f7]/15 text-[#a855f7]'
                : 'bg-[#181828] text-[#8888aa] hover:text-[#e8e8f5]'
            }`}
          >
            IP / Sieć
          </button>
        </div>

        {/* IP URL input */}
        {config.sourceTypee === 'ip' && (
          <input
            type="text"
            value={config.sourceUrl}
            onChange={e => onChange({ ...config, sourceUrl: e.target.value })}
            placeholder="http://192.168.1.50:8080/video.mjpeg"
            className="w-full bg-[#12121c] border-0 border-t border-[#383850] px-2 py-1.5 text-[10px] text-[#e8e8f5] placeholder:text-[#5a5a78] font-mono outline-none focus:bg-[#0f0f17] min-w-0"
          />
        )}

        {/* Start/Stop */}
        <button
          onClick={streaming ? stop : start}
          disabled={loading || (config.sourceTypee === 'ip' && !config.sourceUrl)}
          className={`flex items-center justify-center gap-1 py-2 text-[10px] font-mono border-t border-[#383850] transition-all disabled:opacity-40 ${
            streaming
              ? 'bg-[#ff6b6b]/20 text-[#ff6b6b]'
              : 'bg-[#4ade80]/15 text-[#4ade80] hover:bg-[#4ade80]/25'
          }`}
        >
          {streaming ? <Pause size={11} /> : <Play size={11} />}
          {loading ? '...' : streaming ? 'STOP' : 'START'}
        </button>
      </div>
    </div>
  );
}

export function VisionTab() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Monitoring cameras state (2 slots) ───
  const [cameras, setCameras] = useState<CameraWhatnfig[]>(DEFAULT_CAMERAS);
  const [camerasLoaded, setCamerasLoaded] = useState(false);

  // Load cameras from localStorage on mount
  useEffect(() => {
    setCameras(loadCameras());
    setCamerasLoaded(true);
  }, []);

  // Persist cameras to localStorage
  useEffect(() => {
    if (camerasLoaded) saveCameras(cameras);
  }, [cameras, camerasLoaded]);

  const updateCamera = (id: string, next: CameraWhatnfig) => {
    setCameras(prev => prev.map(c => c.id === id ? next : c));
  };

  // Settings
  const [visionEnabled, setVisionEnabled] = useState(false);
  const [visionModel, setVisionModel] = useState('moondream:1.8b');
  const [visionIntervalSec, setVisionIntervalSec] = useState(60);

  const loadSnapshots = useCallback(async () => {
    try {
      const r = await fetch(`/api/vision/snapshots?familyId=${FAMILY_ID}&limit=30`);
      const data = await r.json();
      setSnapshots(data.snapshots ?? []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
      setError('');
    } catch (e: any) {
      setError(`No udało się uruchomić kamery: ${e.message}`);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStreaming(false);
  }

  async function captureOnce() {
    if (!videoRef.current || !streaming) return;
    setLoading(true);
    setError('');
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getWhatntext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDateURL('image/jpeg', 0.7);
      const base64 = dataUrl.split(',')[1];

      const r = await fetch('/api/vision/snapshot', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({
          familyId: FAMILY_ID,
          image: base64,
          triggerReason: 'command',
          evaluate: true,
        }),
      });
      const data = await r.json();
      if (data.ok) {
        setResponse(
          `${data.description}\n\n` +
          `Obiekty: ${data.objects?.join(', ') || '—'}\n` +
          `Mood: ${data.mood || '—'}\n` +
 (data.trigger?.triggered ? ` Trigger: ${data.trigger.action}\n${data.trigger.message}` :'')
        );
        loadSnapshots();
      } else {
        setError(data.error || 'Snapshot failed');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setLoading(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({
          visionEnabled,
          visionModel,
          visionIntervalSec,
        }),
      });
      setShowSettings(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#181828] text-gray-200">
      {/* Header */}
      <header className="px-6 py-4 border-b border-white/5 flex items-center gap-0">
        <Eye size={22} className="text-[#a855f7]" />
        <h1 className="text-lg font-semibold">Vision (Moondream)</h1>
        <span className="text-xs text-gray-500 ml-2">v0.3.19 · L7</span>
        <div className="ml-auto flex gap-0">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5  hover:bg-white/5"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Settings */}
      {showSettings && (
        <div className="px-6 py-4 border-b border-white/5 bg-black/30 space-y-2">
          <h3 className="text-sm font-semibold text-gray-300">Konfiguracja wizji</h3>
          <label className="flex items-center gap-0 text-xs">
            <input type="checkbox" checked={visionEnabled} onChange={(e) => setVisionEnabled(e.target.checked)} />
            Vision włączona
          </label>
          <div className="grid grid-cols-2 gap-0">
            <select
              value={visionModel}
              onChange={(e) => setVisionModel(e.target.value)}
              className="bg-black/40 text-xs px-2 py-1.5  border border-white/10"
            >
              <option value="moondream:1.8b">moondream:1.8b (lokalnie, 1.8B)</option>
              <option value="llava:7b">llava:7b (lokalnie, 7B)</option>
              <option value="llava:13b">llava:13b (lokalnie, 13B)</option>
              <option value="glm-4v">glm-4v (Zhipu Cloud)</option>
            </select>
            <input
              type="number"
              value={visionIntervalSec}
              onChange={(e) => setVisionIntervalSec(parseInt(e.target.value))}
              min={10}
              max={3600}
              className="bg-black/40 text-xs px-2 py-1.5  border border-white/10"
              placeholder="Interwał auto-snapshot (s)"
            />
          </div>
          <button
            onClick={saveSettings}
            disabled={loading}
            className="px-3 py-1 text-xs bg-[#a855f7]/20 text-[#a855f7] hover:bg-[#a855f7]/30 rounded"
          >
            Save
          </button>
          <p className="text-[10px] text-gray-500">
            Wymaga Ollama z modelem Moondream (ollama pull moondream:1.8b) — działa lokalnie, bez chmury.
          </p>
        </div>
      )}

      {/* ═══ MONITORING — 2 sloty kamer ═══ */}
      <div className="px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <Video size={14} className="text-[#a855f7]" />
          <h2 className="text-sm font-semibold text-gray-300">Monitoring</h2>
          <span className="text-[10px] text-gray-500 ml-auto">
            2 sloty · {cameras.filter(c => c.enabled).length} aktywne · konfiguracja w localStorage
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {cameras.map(cam => (
            <CameraSlot
              key={cam.id}
              config={cam}
              onChange={(next) => updateCamera(cam.id, next)}
            />
          ))}
        </div>
        <p className="text-[10px] text-gray-500 mt-2">
          Webcam — lokalna kamera (wymaga zgody w pasku adresu). IP — strumień MJPEG (.mjpeg/.jpg) lub HLS/MP4 z adresu URL.
          Konfiguracja zapisywana lokalnie w przeglądarce.
        </p>
      </div>

      {/* Live camera — analiza Moondream */}
      <div className="px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <Camera size={14} className="text-[#a855f7]" />
          <h2 className="text-sm font-semibold text-gray-300">Analiza sceny (Moondream)</h2>
        </div>
        <div className="flex gap-0">
          <div className="flex-1 relative">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full aspect-video bg-black  border border-white/10"
            />
            {!streaming && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
                Kamera wyłączona
              </div>
            )}
          </div>
          <div className="flex flex-col gap-0 w-32">
            <button
              onClick={streaming ? stopCamera : startCamera}
              className={`flex items-center justify-center gap-0 p-2  text-xs ${
                streaming ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'
              }`}
            >
              {streaming ? <Pause size={14} /> : <Play size={14} />}
              {streaming ? 'Stop' : 'Start'}
            </button>
            <button
              onClick={captureOnce}
              disabled={!streaming || loading}
              className="flex items-center justify-center gap-0 p-2  text-xs bg-[#a855f7]/20 text-[#a855f7] disabled:opacity-50"
            >
              <Camera size={14} />
              {loading ? 'Analyzeę...' : 'Snap'}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-2 p-2  bg-red-500/10 text-red-300 text-xs flex items-center gap-0">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
        {response && (
          <div className="mt-2 p-2  bg-[#a855f7]/10 text-[#a855f7] text-xs whitespace-pre-wrap">
            {response}
          </div>
        )}
      </div>

      {/* Snapshots history */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">
          Ostatnie snapshoty ({snapshots.length})
        </h3>
        {snapshots.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            None snapshotów. Run kamerę i kliknij &quot;Snap&quot; aby przechwycić scenę.
          </div>
        ) : (
          <div className="space-y-2">
            {snapshots.map((snap) => (
              <div key={snap.id} className="p-2  border border-white/5 bg-black/30">
                <div className="flex items-center gap-0 text-xs mb-1">
                  <span className="text-[#a855f7]">{snap.model}</span>
                  <span className="text-gray-500">·</span>
                  <span className="text-gray-400">{snap.triggerReason}</span>
                  {snap.moodLabel && (
                    <>
                      <span className="text-gray-500">·</span>
                      <span className="text-yellow-300">{snap.moodLabel}</span>
                    </>
                  )}
                  {snap.triggeredAction && (
                    <>
                      <span className="text-gray-500">·</span>
 <span className="text-green-300"> {snap.triggeredAction}</span>
                    </>
                  )}
                  <span className="ml-auto text-gray-500 text-[10px]">
                    {new Date(snap.capturedAt).toLocaleString('pl-PL')}
                  </span>
                </div>
                <p className="text-xs text-gray-300">{snap.description}</p>
                {snap.detectedObjects.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {snap.detectedObjects.map((obj, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5  bg-white/5 text-gray-400">
                        {obj}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
