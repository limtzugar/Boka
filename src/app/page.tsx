'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore, type TabId, type FamilyMember, type Message, type MemoryEntry, type WellbeingEntry } from '@/lib/store';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { useBokaTTS } from '@/hooks/use-boka-tts';
import { BokaFace, BokaFaceMini, type BokaEmotion, type FaceStyle, EMOTION_LABELS, FACE_STYLE_LABELS, type MemoryGraphNode, type MemoryGraphEdge } from '@/components/boka-face';
import { FORMULA_TYPES, FORMULA_PALETTES, type FormulaSettings } from '@/components/formula-renderer';
import { MemoryGraph } from '@/components/memory-graph';
import { PixelAvatar, getCategoryLabel } from '@/components/pixel-avatar';
import { FileExplorer } from '@/components/file-explorer';
import { FileViewer } from '@/components/file-viewer';
import { DebateTab } from '@/components/debate-tab';
import { McpTab } from '@/components/mcp-tab';
import { PrivacyTab } from '@/components/privacy-tab';
import { VisionTab } from '@/components/vision-tab';
import { ErrorBoundary } from '@/components/error-boundary';
import { ResizableSplit } from '@/components/resizable-split';
import { SessionsPanel } from '@/components/sessions-panel';
import { OrchestratorCockpit } from '@/components/orchestrator-cockpit';
import { AgentMemoryTab } from '@/components/agent-memory-tab';
import { SkillsTab } from '@/components/tabs/skills-tab';
import { SettingsTab } from '@/components/tabs/settings-tab';
import { AppsTab } from '@/components/tabs/apps-tab';
import { ProfilesTab } from '@/components/tabs/profiles-tab';
import { AgentsTab } from '@/components/tabs/settings-tab';
import {
  Mic, MicOff, Volume2, VolumeX, Send, Brain,
  Shield, BookOpen, Coins, Wrench, Users, Clock,
  ChevronRight, AlertTriangle, MessageSquare, Star,
  Baby, User, UserCheck, MemoryStick,
  Sparkles, Activity, Search, Globe, Settings, Server, Key, Cpu, Wifi, Eye, EyeOff, CheckCircle, XCircle, Loader2, Zap, HardDrive, FolderOpen, Play, Square, Download, Check,
  Heart, Sun, CloudRain, Cloud, Smile, Circle
} from 'lucide-react';
import { useVAD } from '@/hooks/use-vad';
import { useVision } from '@/hooks/use-vision';
import { useImageGeneration } from '@/hooks/use-image-generation';
import { useProactive } from '@/hooks/use-proactive';
import { useReminders } from '@/hooks/use-reminders';
import { useVoiceEmotion } from '@/hooks/use-voice-emotion';
import { useChatStream } from '@/hooks/use-chat-stream';
import { useSpeakerId } from '@/hooks/use-speaker-id';
import { useWeather } from '@/hooks/use-weather';
import { usePresenceDetection } from '@/hooks/use-presence-detection';
import { Image as ImageIcon, Camera, Ear, Radio, Bell, Palette, UsersRound, Trash2, Plus, Upload, X, CircleDot, Network, List, Beaker, Calendar, FolderTree, FileCode, File, PanelRight, PanelLeftClose, ChevronDown, Home, Paperclip, Terminal as TerminalIcon, Home as HomeIcon, Folder, Layers, Pencil, Bot, Database } from 'lucide-react';
import { MemoryTab, VaultTab } from '@/components/panels/insights-panels';


// ═══════════════════════════════════════════
// AGENT ICONS MAP
// ═══════════════════════════════════════════

// VaultNoteData — alias for Prisma VaultNote type (used in Vault tab)
type VaultNoteData = {
  id: string;
  familyId: string;
  noteType: string;
  title: string;
  content: string;
  frontmatter: string;
  tags: string;
  isPinned?: boolean;
  emotion?: string;
  createdAt: Date;
  updatedAt: Date;
};

const AGENT_ICONS: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  general: { icon: <Brain size={14} />, color: '#00f5d4', label: 'BOKA' },
  search: { icon: <Globe size={14} />, color: '#6ec6e7', label: 'Wyszukiwanie' },
  child_culture: { icon: <Star size={14} />, color: '#ffd93d', label: 'Kultura Dziecięca' },
  education: { icon: <BookOpen size={14} />, color: '#a855f7', label: 'Edukacja' },
  finance: { icon: <Coins size={14} />, color: '#4ade80', label: 'Finanse' },
  legal: { icon: <Shield size={14} />, color: '#6ec6e7', label: 'Prawo' },
  mathematics: { icon: <Brain size={14} />, color: '#a855f7', label: 'Matematyka' },
  safety: { icon: <AlertTriangle size={14} />, color: '#ff6b6b', label: 'Bezpieczeństwo' },
};

export default function BokaPage() {
  // individual selectors to avoid Zustand 5 + React 19 infinite re-render
  const familyId = useAppStore(s => s.familyId);
  const members = useAppStore(s => s.members);
  const activeMemberId = useAppStore(s => s.activeMemberId);
  const childNearby = useAppStore(s => s.childNearby);
  const messages = useAppStore(s => s.messages);
  const isStreaming = useAppStore(s => s.isStreaming);
  const currentAgentId = useAppStore(s => s.currentAgentId);
  const memoryEntries = useAppStore(s => s.memoryEntries);
  const activeTab = useAppStore(s => s.activeTab);
  const faceStyle = useAppStore(s => s.faceStyle);
  const wellbeingLog = useAppStore(s => s.wellbeingLog);
  const lastWellbeingCheckIn = useAppStore(s => s.lastWellbeingCheckIn);
  const setFamily = useAppStore(s => s.setFamily);
  const setActiveMember = useAppStore(s => s.setActiveMember);
  const toggleChildNearby = useAppStore(s => s.toggleChildNearby);
  const addMessage = useAppStore(s => s.addMessage);
  const setStreaming = useAppStore(s => s.setStreaming);
  const setCurrentAgent = useAppStore(s => s.setCurrentAgent);
  const setMemoryEntries = useAppStore(s => s.setMemoryEntries);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const setFaceStyle = useAppStore(s => s.setFaceStyle);
  const addWellbeingEntry = useAppStore(s => s.addWellbeingEntry);
  const setLastWellbeingCheckIn = useAppStore(s => s.setLastWellbeingCheckIn);
  const updateLastAssistantMessage = useAppStore(s => s.updateLastAssistantMessage);

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [memoryGrowth, setMemoryGrowth] = useState(0);
  const [bokaEmotion, setBokaEmotion] = useState<BokaEmotion>('neutral');
  const [showWellbeingCheckIn, setShowWellbeingCheckIn] = useState(false);
  const [sessionStart] = useState(() => Date.now());
  const [waveformSize, setWaveformSize] = useState(400);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── v0.3.7: File Explorer side panel + File Viewer ──
  const [showFileExplorer, setShowFileExplorer] = useState(false);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);

  // ── Obsidian Graph: real memory data for face visualization ──
  const [memoryGraphNodes, setMemoryGraphNodes] = useState<MemoryGraphNode[]>([]);
  const [memoryGraphEdges, setMemoryGraphEdges] = useState<MemoryGraphEdge[]>([]);
  const [focusNodeId, setFocusNodeId] = useState<string | undefined>();
  const [focusIntensity, setFocusIntensity] = useState(0);
  const [thinkingTopics, setThinkingTopics] = useState<string[]>([]);

  const { isListening, toggleListening, isSupported: asrSupported, nativeAsrSupported, continuousMode, toggleContinuousMode, setOnSpeechResult, micError } = useSpeechRecognition();
  const { isSpeaking, speak, stop: stopSpeaking, isSupported: ttsSupported, analyserNode, micAnalyserNode, startMic, stopMic, playBurp, playFart, playSneeze, playRandomBodySound, fallbackReason } = useBokaTTS();
  const isSpeakingRef = useRef(false);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  // New AI Features
  const vad = useVAD({ energyThreshold: 0.015, silenceDuration: 1500, minSpeechDuration: 300 });
  const vision = useVision();
  const imageGen = useImageGeneration();
  const proactive = useProactive(activeMemberId);
  const reminders = useReminders(activeMemberId);
  const voiceEmotion = useVoiceEmotion();
  const chatStream = useChatStream();
  const speakerId = useSpeakerId();
  const weather = useWeather(); // Rozprza weather for sneezy days

  const [vadMode, setVadMode] = useState(false); // Always-listening toggle
  const [showImageUpload, setShowImageUpload] = useState(false);

  // ── v0.3.16: drag&drop file attachments in chat ──
  interface ChatAttachment {
    id: string;
    fileName: string;
    fileType: string;
    extractionKind: string | null;
    thumbnailDataUrl: string | null;
    status: 'uploading' | 'ready' | 'error';
    error?: string;
  }
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [showImageGen, setShowImageGen] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const [imageGenPrompt, setImageGenPrompt] = useState('');
  const [proactiveDismissed, setProactiveDismissed] = useState(false);
  const [showRemindersTab, setShowRemindersTab] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderDate, setNewReminderDate] = useState('');
  const [detectedEmotion, setDetectedEmotion] = useState<string | null>(null);
  const [detectedSpeaker, setDetectedSpeaker] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ═══ FEATURE #1: Streaming Mode ═══
  const [streamingMode, setStreamingMode] = useState(true);

  // ═══ v0.3.18 — Tryb Debaty wbudowany w zakładkę „Rozmowa" ═══
  // Użytkownik może przełączać między zwykłą rozmową (jak wcześniej) a trybem debaty
  // (Boka dzieli się na kilku agentów-personowości i debatuje ze sobą).
  // 'normal' = zwykły czat (klasyczne zachowanie)
  // 'debate' = tryb debaty (DebateTab renderowany w miejscu panelu czatu + centralnego waveformu)
  const [chatMode, setChatMode] = useState<'normal' | 'debate'>('normal');

  // v0.3.19 — Toggle left sidebar visibility (header button)
  const [sidebarHidden, setSidebarHidden] = useState(false);
  // v0.3.19 — Sessions panel (slide-out from left)
  const [showSessions, setShowSessions] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // ═══ v0.3.19 — Kamera użytkownika w czacie (pod kulą BOKI) ═══
  // Kamera 16:9, dwa style: rectangular (zwykła) | spherical (rybie oko z vigiette)
  // Stream lokalny (getUserMedia), nie wysyła nigdzie.
  const [visionStreamOn, setVisionStreamOn] = useState(false);
  const [visionStarting, setVisionStarting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  // v0.3.19 — Camera settings moved to Zustand store (so SettingsTab can access them)
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showAppearancePopover, setShowAppearancePopover] = useState(false);
  const visionVideoRef = useRef<HTMLVideoElement>(null);
  const visionStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appearancePopoverRef = useRef<HTMLDivElement>(null);

  // Attach stream to video element + force play
  const attachStreamToVideo = useCallback(async (stream: MediaStream) => {
    const video = visionVideoRef.current;
    if (!video) {
      console.warn('[vision] video element not ready yet');
      return false;
    }
    video.srcObject = stream;
    // Wait for metadata before play (Safari requirement)
    if (video.readyState < 1) {
      await new Promise<void>(resolve => {
        const onMeta = () => { video.removeEventListener('loadedmetadata', onMeta); resolve(); };
        video.addEventListener('loadedmetadata', onMeta, { once: true });
        // Failsafe: don't wait forever
        setTimeout(resolve, 1500);
      });
    }
    try {
      await video.play();
      setVideoReady(true);
      return true;
    } catch (e: any) {
      console.warn('[vision] play() failed:', e?.message);
      // Try again after a short delay (autoplay policy workaround)
      try {
        await new Promise(r => setTimeout(r, 100));
        await video.play();
        setVideoReady(true);
        return true;
      } catch (e2: any) {
        console.error('[vision] play() retry failed:', e2?.message);
        setVisionError(`Kamera nie startuje: ${e2?.message || 'play() rejected'}`);
        return false;
      }
    }
  }, []);

  // Toggle camera stream
  const toggleVisionStream = useCallback(async () => {
    if (visionStreamOn) {
      // Stop
      if (visionStreamRef.current) {
        visionStreamRef.current.getTracks().forEach(t => t.stop());
        visionStreamRef.current = null;
      }
      if (visionVideoRef.current) {
        visionVideoRef.current.srcObject = null;
      }
      setVisionStreamOn(false);
      setVideoReady(false);
      setVisionError(null);
      return;
    }
    setVisionStarting(true);
    setVisionError(null);
    setVideoReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } },
        audio: false,
      });
      // Check if we actually got video tracks
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        stream.getTracks().forEach(t => t.stop());
        setVisionError('Kamera nie zwraca strumienia wideo');
        setVisionStarting(false);
        return;
      }
      const settings = videoTracks[0].getSettings();
      console.log('[vision] camera tracks:', videoTracks.length, 'settings:', settings);
      visionStreamRef.current = stream;
      setVisionStreamOn(true);
      setVisionStarting(false);
      // Give React a tick to render the <video> element, then attach
      setTimeout(() => {
        attachStreamToVideo(stream);
      }, 50);
    } catch (e: any) {
      console.error('[vision] getUserMedia failed:', e);
      let msg = e?.message || 'Nie udało się uruchomić kamery';
      if (e?.name === 'NotAllowedError') msg = 'Brak zgody na kamerę — pozwól w pasku adresu';
      if (e?.name === 'NotFoundError') msg = 'Nie znaleziono kamery';
      if (e?.name === 'NotReadableError') msg = 'Kamera zajęta przez inny program';
      setVisionError(msg);
      setVisionStreamOn(false);
      setVisionStarting(false);
    }
  }, [visionStreamOn, attachStreamToVideo]);

  // v0.3.19 — Close plus menu on outside click
  useEffect(() => {
    if (!showPlusMenu) return;
    const handler = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPlusMenu]);

  // Stop stream on unmount
  useEffect(() => {
    return () => {
      if (visionStreamRef.current) {
        visionStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  // Format recording time
  const formatRecTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Screen recording (getDisplayMedia)
  const toggleScreenRecording = useCallback(async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsRecording(false);
      setRecordingSeconds(0);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `boka-recording-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (e: any) {
      setVisionError(e?.message || 'Nie udało się nagrywać ekranu');
    }
  }, [isRecording]);

  // ═══ FEATURE #4: Image Generation inline ═══
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});

  // ═══ FEATURE #7: Function Calling notifications ═══
  const [messageExpenses, setMessageExpenses] = useState<Record<string, number>>({});
  const [messageCalendarEvents, setMessageCalendarEvents] = useState<Record<string, number>>({});

  // ── Connect speech recognition to sendMessage ──
  useEffect(() => {
    setOnSpeechResult((text, isFinal) => {
      if (isFinal && text.trim()) {
        // Auto-send when speech is finalized
        sendMessage(text.trim());
      } else {
        // Show interim text in input
        setInputText(text);
      }
    });
  }, [setOnSpeechResult]);

  // ── Start/stop mic when listening changes ──
  useEffect(() => {
    if (isListening) {
      startMic();
    } else {
      stopMic();
    }
  }, [isListening, startMic, stopMic]);

  // ── v0.3.4: AHI Wellbeing popup USUNIĘTY na życzenie użytkownika ──
  // (oryginalny useEffect okresowo pokazujący "Jak się dzisiaj czujesz?" usunięty)

  // ── Compute waveform size based on viewport ──
  useEffect(() => {
    const update = () => setWaveformSize(Math.min(window.innerHeight * 0.55, 500));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ── Startup: check memory integrity, then load family ──
  useEffect(() => {
    async function startup() {
      // 1. Check memory integrity
      try {
        const startupRes = await fetch('/api/startup');
        if (startupRes.ok) {
          const startupData = await startupRes.json();
          if (startupData.errors?.length > 0) {
 console.warn('️ BOKA Memory issues:', startupData.errors);
          }
          if (startupData.warnings?.length > 0) {
            console.info('ℹ️ BOKA Memory warnings:', startupData.warnings);
          }
 console.log(' BOKA Memory paths:', startupData.paths);
        }
      } catch (e) {
        console.warn('Startup check failed (non-critical):', e);
      }

      // 2. Load family data
      try {
        const res = await fetch('/api/family');
        if (!res.ok) return;
        const data = await res.json();
        if (data.family && data.members) {
          setFamily(data.family.id, data.members);
          const parent = data.members.find((m: FamilyMember) => m.role === 'parent');
          if (parent) setActiveMember(parent.id);
        }
      } catch (e) {
        console.error('Failed to load family:', e);
      }
    }
    startup();
  }, [setFamily, setActiveMember]);

  // ── Load memory on mount ──
  useEffect(() => {
    loadMemoryEntries();
  }, [setMemoryEntries]);

  async function loadMemoryEntries() {
    try {
      const res = await fetch('/api/memory');
      if (!res.ok) return;
      const data = await res.json();
      if (data.entries) {
        setMemoryEntries(data.entries.map((e: { id: string; memberId?: string; entryType: string; domain?: string; title?: string; content: string; importance: number; tags: string; createdAt: string }) => ({
          ...e,
          tags: JSON.parse(typeof e.tags === 'string' ? e.tags : '[]'),
        })));
      }
    } catch (e) {
      console.error('Failed to load memory:', e);
    }
  }

  // ── Load memory graph data for Obsidian face ──
  // v0.3.19 — Builds a real graph from MemoryEntry + FamilyMember + Entity data
  async function loadMemoryGraph() {
    try {
      const family = await fetch('/api/family').then(r => r.ok ? r.json() : null).catch(() => null);
      const familyId = family?.family?.id;
      if (!familyId) return;

      // 1. Try Entity/EntityRelation from graph API
      const graphRes = await fetch(`/api/memory/graph?familyId=${familyId}`);
      const graphData = graphRes.ok ? await graphRes.json() : { nodes: [], edges: [] };

      let nodes: MemoryGraphNode[] = [];
      let edges: MemoryGraphEdge[] = [];

      if (graphData.nodes && graphData.nodes.length > 0) {
        // Convert Entity format → MemoryGraphNode format
        const typeColors: Record<string, string> = {
          person: '#00f5d4', place: '#6ec6e7', organization: '#a855f7',
          concept: '#ffd93d', event: '#4ade80', object: '#ff6b6b', other: '#6b6b8d',
        };
        nodes = graphData.nodes.map((e: any) => ({
          id: e.id,
          label: e.name,
          type: e.type === 'person' ? 'member' : 'domain',
          size: Math.min(5, Math.max(1, Math.ceil((e.mentionCount || 1) / 3))),
          color: typeColors[e.type] || '#6b6b8d',
        }));
        edges = (graphData.edges || []).map((r: any) => ({
          source: r.source,
          target: r.target,
          weight: Math.min(1, r.strength || 0.5),
          label: r.type,
        }));
      }

      // 2. Always add family members as central nodes
      const memberColors = ['#00f5d4', '#a855f7', '#6ec6e7', '#ffd93d', '#4ade80', '#ff6b6b'];
      const existingMemberIds = new Set(nodes.filter(n => n.type === 'member').map(n => n.id));
      for (const m of (family.members || [])) {
        const nodeId = `member:${m.id}`;
        if (!existingMemberIds.has(nodeId)) {
          nodes.push({
            id: nodeId,
            label: m.name,
            type: 'member',
            size: 5,
            color: m.color || memberColors[nodes.length % memberColors.length],
          });
        }
      }

      // 3. Add memory entries as satellite nodes
      const memRes = await fetch(`/api/memory?familyId=${familyId}&limit=50`);
      const memData = memRes.ok ? await memRes.json() : { entries: [] };
      const domainColors: Record<string, string> = {
        general: '#6b6b8d', child_culture: '#ffd93d', education: '#a855f7',
        finance: '#4ade80', health: '#ff6b6b', food: '#f472b6',
        hobby: '#00f5d4', semantic: '#00f5d4', episodic: '#a855f7',
      };
      for (const entry of (memData.entries || [])) {
        const nodeId = `memory:${entry.id}`;
        // Extract a short label from content
        const label = (entry.title || entry.content || '').substring(0, 25).trim() || 'wspomnienie';
        nodes.push({
          id: nodeId,
          label,
          type: 'memory',
          size: Math.min(4, Math.max(1, Math.ceil((entry.importance || 0.5) * 4))),
          color: domainColors[entry.domain || 'general'] || '#6b6b8d',
        });
        // Connect to member who owns this memory
        if (entry.memberId) {
          edges.push({
            source: `member:${entry.memberId}`,
            target: nodeId,
            weight: 0.5,
          });
        } else {
          // Connect to first family member
          if (family.members?.[0]) {
            edges.push({
              source: `member:${family.members[0].id}`,
              target: nodeId,
              weight: 0.3,
            });
          }
        }
        // Connect to domain node if exists
        if (entry.domain) {
          const domainNodeId = `domain:${entry.domain}`;
          if (!nodes.find(n => n.id === domainNodeId)) {
            nodes.push({
              id: domainNodeId,
              label: entry.domain,
              type: 'domain',
              size: 2,
              color: domainColors[entry.domain] || '#6b6b8d',
            });
          }
          edges.push({
            source: nodeId,
            target: domainNodeId,
            weight: 0.4,
          });
        }
      }

      // 4. Connect members to each other (family links)
      const memberNodes = nodes.filter(n => n.type === 'member');
      for (let i = 0; i < memberNodes.length; i++) {
        for (let j = i + 1; j < memberNodes.length; j++) {
          edges.push({
            source: memberNodes[i].id,
            target: memberNodes[j].id,
            weight: 0.8,
          });
        }
      }

      if (nodes.length > 0) {
        setMemoryGraphNodes(nodes);
        setMemoryGraphEdges(edges);
      }
    } catch (e) {
      console.error('Failed to load memory graph:', e);
    }
  }

  useEffect(() => {
    loadMemoryGraph();
    // Refresh graph every 30 seconds
    const interval = setInterval(loadMemoryGraph, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Focus logic: when BOKA talks/thinks about someone, focus on their cluster ──
  // v0.3.19 — Enhanced: reacts to conversation topics, not just active member
  useEffect(() => {
    if (activeMemberId && (isLoading || isSpeaking || bokaEmotion === 'thinking' || bokaEmotion === 'talking')) {
      setFocusNodeId(`member:${activeMemberId}`);
      setFocusIntensity(isLoading ? 0.8 : isSpeaking ? 0.5 : 0.3);
      // Extract thinking topics from active member name
      const member = members.find(m => m.id === activeMemberId);
      if (member) {
        setThinkingTopics([member.name]);
      }
    } else {
      // Gradually reduce focus
      const fadeTimer = setTimeout(() => {
        setFocusIntensity(prev => Math.max(0, prev - 0.2));
        if (focusIntensity <= 0.2) {
          setFocusNodeId(undefined);
          setThinkingTopics([]);
        }
      }, 2000);
      return () => clearTimeout(fadeTimer);
    }
  }, [activeMemberId, isLoading, isSpeaking, bokaEmotion, members]);

  // ── Extract thinking topics from ALL messages (not just user) ──
  // v0.3.19 — Matches graph nodes against conversation content
  useEffect(() => {
    if (messages.length === 0) return;

    // Get last 5 messages for context
    const recentMsgs = messages.slice(-5);
    const combinedText = recentMsgs.map(m => m.content.toLowerCase()).join(' ');

    // 1. Extract member names mentioned in conversation
    const memberNames = members.map(m => m.name);
    const mentionedMembers = memberNames.filter(name =>
      combinedText.includes(name.toLowerCase())
    );

    // 2. Extract topics from graph node labels that appear in conversation
    const graphTopics = memoryGraphNodes
      .filter(n => n.type !== 'member' && n.label)
      .map(n => n.label)
      .filter(label => {
        const lower = label.toLowerCase();
        return lower.length > 3 && combinedText.includes(lower);
      })
      .slice(0, 5); // Limit to 5 topics

    // 3. Extract domain keywords from conversation
    const domainKeywords = ['matematyka', 'finanse', 'edukacja', 'zdrowie', 'jedzenie',
      'hobby', 'praca', 'szkoła', 'minecraft', 'lego', 'technologia', 'ai'];
    const mentionedDomains = domainKeywords.filter(kw => combinedText.includes(kw));

    // Combine all topics
    const allTopics = [...new Set([...mentionedMembers, ...graphTopics, ...mentionedDomains])];

    if (allTopics.length > 0) {
      setThinkingTopics(allTopics);
      // If a member is mentioned, also set focus to that member
      if (mentionedMembers.length > 0) {
        const mentionedMember = members.find(m => mentionedMembers.includes(m.name));
        if (mentionedMember) {
          setFocusNodeId(`member:${mentionedMember.id}`);
          setFocusIntensity(isLoading ? 0.9 : isSpeaking ? 0.7 : 0.4);
        }
      }
    }
  }, [messages, members, memoryGraphNodes]);

  // ── Auto-scroll chat ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Update BOKA emotion based on state ──
  useEffect(() => {
    if (isSpeaking) {
      setBokaEmotion('talking');
    } else if (isListening) {
      setBokaEmotion('listening');
    } else if (isLoading) {
      setBokaEmotion('thinking');
    } else if (bokaEmotion === 'talking' || bokaEmotion === 'listening' || bokaEmotion === 'greeting') {
      setBokaEmotion('neutral');
    }
  }, [isSpeaking, isListening, isLoading]);

  // ── AHI: Greeting on first visit ──
  useEffect(() => {
    const hasGreeted = sessionStorage.getItem('boka-greeted');
    if (!hasGreeted && messages.length === 0) {
      setBokaEmotion('greeting');
      sessionStorage.setItem('boka-greeted', '1');
      // Reset to neutral after greeting animation
      setTimeout(() => setBokaEmotion('neutral'), 3000);
    }
  }, []);

  // ── Wellbeing check-in handler ──
  const handleWellbeingResponse = useCallback((mood: number) => {
    const entry: WellbeingEntry = {
      id: `wb-${Date.now()}`,
      date: new Date().toISOString(),
      mood,
      note: ['', 'Trudno mi', 'Jest ok', 'Nieźle', 'Dobrze', 'Świetnie!'][mood],
      timestamp: Date.now(),
    };
    addWellbeingEntry(entry);
    setLastWellbeingCheckIn(Date.now());
    setShowWellbeingCheckIn(false);

    // Boka reacts to the mood
    if (mood >= 4) {
      setBokaEmotion('happy');
      sendMessage(mood === 5 ? 'Czuję się świetnie!' : 'Jest mi dobrze.');
    } else if (mood <= 2) {
      setBokaEmotion('neutral');
      sendMessage('Nie mam dzisiaj najlepszego dnia...');
    } else {
      sendMessage('Jest tak średnio...');
    }
    setTimeout(() => setBokaEmotion('neutral'), 2000);
  }, [addWellbeingEntry, setLastWellbeingCheckIn]);

  // ═══ FEATURE #2: VAD Wake Word ═══
  useEffect(() => {
    if (vadMode && vad.isListening) {
      vad.setOnSpeechEnd(async (audioBlob) => {
        // Guard: validate audioBlob before using FileReader
        if (!audioBlob || !(audioBlob instanceof Blob) || audioBlob.size === 0) {
          console.warn('[BOKA VAD] Received invalid/empty audio blob, skipping ASR');
          return;
        }
        try {
          const base64Audio = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result;
              if (typeof result === 'string' && result.length > 0) {
                resolve(result);
              } else {
                reject(new Error('FileReader returned empty result'));
              }
            };
            reader.onerror = () => reject(new Error('FileReader error'));
            reader.readAsDataURL(audioBlob);
          });

          try {
            const res = await fetch('/api/asr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64Audio, format: 'audio/webm' }),
            });
            const data = await res.json();
            if (data.text && data.text.trim()) {
              const lowerText = data.text.toLowerCase().trim();
              const wakeWords = ['hej boka', 'hey boka', 'ej boka'];
              const hasWakeWord = wakeWords.some(w => lowerText.includes(w));
              if (hasWakeWord) {
                // Strip wake word and send the remaining text
                let cleanedText = data.text.trim();
                for (const w of wakeWords) {
                  const regex = new RegExp(`^${w}[\\s,!.?]*`, 'i');
                  cleanedText = cleanedText.replace(regex, '');
                }
                sendMessage(cleanedText.trim() || 'Cześć!');
              }
              // No wake word → ignore in VAD mode (only respond to wake word)
            }
          } catch (e) {
            console.error('VAD ASR error:', e);
          }
          // ═══ FEATURE #6: Voice Emotion ═══
          try {
            const emotionResult = await voiceEmotion.analyzeEmotion(base64Audio);
            if (emotionResult) {
              setDetectedEmotion(emotionResult.emotion);
            }
          } catch (e) {
            console.warn('Voice emotion analysis error:', e);
          }
        } catch (e) {
          console.error('[BOKA VAD] FileReader error:', e);
        }
      });
      vad.setOnSpeechStart(() => {
        setBokaEmotion('listening');
      });
    }
  }, [vadMode, vad.isListening]);

  // Toggle VAD mode
  useEffect(() => {
    if (vadMode) {
      vad.startVAD();
    } else {
      vad.stopVAD();
      if (bokaEmotion === 'listening') setBokaEmotion('neutral');
    }
  }, [vadMode]);

  // ═══ SNEEZE ON RAINY DAYS IN ROZPRZA ═══
  // When it's raining, Boka occasionally sneezes — she's alive!
  useEffect(() => {
    if (!weather.isRaining) return;

    // Schedule random sneezes every 3-8 minutes while it's raining
    const scheduleSneeze = () => {
      const delay = (3 + Math.random() * 5) * 60 * 1000; // 3-8 min
      return setTimeout(() => {
        playSneeze();
        // Briefly change emotion to show Boka sneezed
        setBokaEmotion('surprised');
        setTimeout(() => setBokaEmotion('neutral'), 1500);
      }, delay);
    };

    const timer = scheduleSneeze();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [weather.isRaining, playSneeze]);

  // ═══ FEATURE #8: Multi-party ═══
  // Auto-switch active member when speaker is identified
  useEffect(() => {
    if (speakerId.currentSpeaker && speakerId.currentSpeaker.memberId && speakerId.currentSpeaker.memberId !== activeMemberId) {
      setActiveMember(speakerId.currentSpeaker.memberId);
    }
  }, [speakerId.currentSpeaker, activeMemberId, setActiveMember]);

  // Start/stop speaker identification with VAD analyser node
  useEffect(() => {
    if (vadMode && vad.analyserNode && speakerId.profileCount > 0) {
      speakerId.startIdentifying(vad.analyserNode);
    } else {
      speakerId.stopIdentifying();
    }
  }, [vadMode, vad.analyserNode, speakerId.profileCount]);

  // ── Proactive: Show Boka's proactive messages ──
  useEffect(() => {
    if (proactive.proactiveMessage && !proactiveDismissed) {
      const msg = proactive.proactiveMessage;
      if (msg.shouldSend && msg.message) {
        // Add as a system-like message from Boka
        addMessage({
          id: `proactive-${Date.now()}`,
          role: 'agent',
 content: ` ${msg.message}`,
          agentId: 'general',
          timestamp: new Date(),
        });
        speak(msg.message);
        setProactiveDismissed(true);
        setTimeout(() => setProactiveDismissed(false), 300000); // 5 min cooldown
      }
    }
  }, [proactive.proactiveMessage]);

  // ═══ v0.3.16: Drag & drop file attachments ═══
  const uploadAttachment = async (file: File): Promise<void> => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setPendingAttachments((prev) => [
      ...prev,
      { id: tempId, fileName: file.name, fileType: file.type, extractionKind: null, thumbnailDataUrl: null, status: 'uploading' },
    ]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/chat/attachments', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setPendingAttachments((prev) =>
        prev.map((a) =>
          a.id === tempId
            ? {
                id: data.id,
                fileName: data.fileName,
                fileType: data.fileType,
                extractionKind: data.extractionKind,
                thumbnailDataUrl: data.thumbnailDataUrl,
                status: 'ready',
              }
            : a,
        ),
      );
    } catch (err) {
      setPendingAttachments((prev) =>
        prev.map((a) =>
          a.id === tempId
            ? { ...a, status: 'error', error: err instanceof Error ? err.message : String(err) }
            : a,
        ),
      );
    }
  };

  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    arr.forEach(uploadAttachment);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if leaving the container (not entering a child)
    if (e.currentTarget === e.target) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const removeAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // ── Send message to BOKA ──
  const sendMessage = async (text: string) => {
    // Allow send if there's text OR pending ready attachments
    const readyAttachments = pendingAttachments.filter((a) => a.status === 'ready');
    if ((!text.trim() && readyAttachments.length === 0) || isLoading) return;
    const attachmentIds = readyAttachments.map((a) => a.id);

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text.trim() || (attachmentIds.length > 0 ? `[${attachmentIds.length} plików]` : ''),
      inputMode: isListening ? 'voice' : 'text',
      timestamp: new Date(),
    };
    addMessage(userMsg);
    setInputText('');
    // Clear attachments after send
    if (attachmentIds.length > 0) setPendingAttachments([]);
    setIsLoading(true);
    setStreaming(true);
    setBokaEmotion('thinking');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          memberId: activeMemberId,
          inputMode: userMsg.inputMode,
          // ═══ FEATURE #6: Voice Emotion context ═══
          voiceEmotion: detectedEmotion || undefined,
          // ═══ v0.3.7: childNearby flag → emoji mode (child) vs no-emoji (adult) ═══
          childNearby,
          // ═══ v0.3.16: attachment IDs from drag&drop ═══
          attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        }),
      });

      if (!res.ok) {
        const textBody = await res.text().catch(() => '');
        throw new Error(`API error ${res.status}: ${textBody.substring(0, 100)}`);
      }
      const data = await res.json();

      if (data.response) {
        const agentMsg: Message = {
          id: `msg-${Date.now()}-agent`,
          role: 'agent',
          content: data.response,
          agentId: data.agentId || 'general',
          confidence: 0.85,
          timestamp: new Date(),
        };
        addMessage(agentMsg);
        setCurrentAgent(data.agentId || 'general');

        // ═══ FEATURE #4: Image Generation inline ═══
        if (data.generatedImageUrl) {
          setGeneratedImages(prev => ({ ...prev, [agentMsg.id]: data.generatedImageUrl }));
        }
        // ═══ FEATURE #7: Function Calling ═══
        if (data.remindersCreated > 0) {
          setMessageCalendarEvents(prev => ({ ...prev, [agentMsg.id]: data.remindersCreated }));
        }
        if (data.expensesCreated > 0) {
          setMessageExpenses(prev => ({ ...prev, [agentMsg.id]: data.expensesCreated }));
        }
        if (data.calendarEventsCreated > 0) {
          setMessageCalendarEvents(prev => ({ ...prev, [agentMsg.id]: data.calendarEventsCreated }));
        }

        // Set BOKA emotion from response
        if (data.emotion) {
          setBokaEmotion(data.emotion as BokaEmotion);
        }

        // Auto-speak the response
        try {
          speak(data.response);
        } catch (ttsErr) {
          console.warn('TTS failed, trying browser fallback:', ttsErr);
          // Fallback: try browser speech synthesis — stop any existing first
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel(); // v0.3.19 — stop overlapping
            const utterance = new SpeechSynthesisUtterance(data.response.substring(0, 500));
            utterance.lang = 'pl-PL';
            const voices = window.speechSynthesis.getVoices();
            const plVoice = voices.find(v => v.lang.startsWith('pl'));
            if (plVoice) utterance.voice = plVoice;
            window.speechSynthesis.speak(utterance);
          }
        }

        // ── BĄKI & BEKNIĘCIA: Play sound effects when Boka talks about them ──
        const lowerResp = data.response.toLowerCase();
        if (lowerResp.includes('bąk') || lowerResp.includes('bąki') || lowerResp.includes('pierd') || lowerResp.includes('gaz') || lowerResp.includes('pup')) {
          // Fart sound after a short delay (so it plays after TTS starts)
          setTimeout(() => playFart(), 800);
        } else if (lowerResp.includes('bekn') || lowerResp.includes('błęk') || lowerResp.includes('odbij') || lowerResp.includes('eruct')) {
          // Burp sound
          setTimeout(() => playBurp(), 800);
        } else if (lowerResp.includes('kich') || lowerResp.includes('apsik') || lowerResp.includes('atchoo') || lowerResp.includes('sneeze')) {
          // Sneeze sound — Boka kicha!
          setTimeout(() => playSneeze(), 600);
        } else if (Math.random() < 0.08) {
          // 8% chance of a random body sound after any response — Boka is alive!
          const delay = 1500 + Math.random() * 3000;
          setTimeout(() => playRandomBodySound(), delay);
        }

        // Memory growth indicator
        if (data.memoryUpdates > 0) {
          setMemoryGrowth(data.memoryUpdates);
          setTimeout(() => setMemoryGrowth(0), 3000);
        }

        // Reload memory
        loadMemoryEntries();
      }
    } catch (error) {
      console.error('Chat error:', error);
      addMessage({
        id: `msg-${Date.now()}-error`,
        role: 'system',
        content: 'Błąd połączenia z BOKĄ. Spróbuj ponownie.',
        timestamp: new Date(),
      });
      setBokaEmotion('angry');
      setTimeout(() => setBokaEmotion('neutral'), 3000);
    } finally {
      setIsLoading(false);
      setStreaming(false);
    }
  };

  // ═══ FEATURE #3: Vision ═══
  const handleImageUpload = async (file: File) => {
    // Show immediate feedback that image is being analyzed
    const uploadMsgId = `msg-${Date.now()}`;
    addMessage({
      id: uploadMsgId,
      role: 'user',
 content: ` Analizuję zdjęcie: ${file.name}...`,
      inputMode: 'text',
      timestamp: new Date(),
    });
    setBokaEmotion('thinking');

    const result = await vision.analyzeImage(file);
    if (result) {
      // Update the user message with the final description
      addMessage({
        id: `msg-${Date.now()}-vision`,
        role: 'user',
 content: ` Zdjęcie: ${file.name}`,
        inputMode: 'text',
        timestamp: new Date(),
      });
      // Send the description to chat with vision context + emotion
      const emotionContext = result.emotion !== 'neutral' ? ` (nastrój: ${result.emotion})` : '';
      sendMessage(`Opisz to zdjęcie: ${result.description}${emotionContext}`);
      setShowImageUpload(false);
    } else {
      // Show error message
      const errorMsg = vision.error || 'Nie udało się przeanalizować zdjęcia';
      addMessage({
        id: `msg-${Date.now()}-error`,
        role: 'system',
 content: ` ${errorMsg}`,
        inputMode: 'text',
        timestamp: new Date(),
      });
      setBokaEmotion('neutral');
    }
  };

  // ═══ FEATURE #4: Image Generation panel ═══
  const handleGenerateImage = async () => {
    if (!imageGenPrompt.trim()) return;

    // Show immediate feedback
    const pendingMsgId = `msg-${Date.now()}`;
    addMessage({
      id: pendingMsgId,
      role: 'user',
 content: ` Narysuj:"${imageGenPrompt}"`,
      inputMode: 'text',
      timestamp: new Date(),
    });
    setBokaEmotion('thinking');

    const result = await imageGen.generateImage(imageGenPrompt);
    if (result) {
      const imgMsgId = `msg-${Date.now()}-gen`;
      addMessage({
        id: imgMsgId,
        role: 'agent',
 content: ` Oto mój rysunek:"${imageGenPrompt}"`,
        agentId: 'general',
        timestamp: new Date(),
      });
      // Store image URL for inline rendering
      setGeneratedImages(prev => ({ ...prev, [imgMsgId]: result.imageUrl }));
      setImageGenPrompt('');
      setShowImageGen(false);
      setBokaEmotion('happy');
    } else {
      const errorMsg = imageGen.error || 'Nie udało się narysować obrazka';
      addMessage({
        id: `msg-${Date.now()}-error`,
        role: 'system',
 content: ` ${errorMsg}`,
        inputMode: 'text',
        timestamp: new Date(),
      });
      setBokaEmotion('neutral');
    }
  };

  const sendMessageStream = async (text: string) => {
    const readyAttachments = pendingAttachments.filter((a) => a.status === 'ready');
    if ((!text.trim() && readyAttachments.length === 0) || chatStream.isStreaming) return;
    const attachmentIds = readyAttachments.map((a) => a.id);

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text.trim() || (attachmentIds.length > 0 ? `[${attachmentIds.length} plików]` : ''),
      inputMode: isListening ? 'voice' : 'text',
      timestamp: new Date(),
    };
    addMessage(userMsg);
    setInputText('');
    if (attachmentIds.length > 0) setPendingAttachments([]);
    setIsLoading(true);
    setStreaming(true);
    setBokaEmotion('thinking');
    
    // Add placeholder agent message
    const agentMsgId = `msg-${Date.now()}-agent`;
    addMessage({
      id: agentMsgId,
      role: 'agent',
      content: '',
      agentId: 'general',
      timestamp: new Date(),
    });

    let fullText = '';
    let speakQueue: string[] = [];
    let isSpeakingNow = false;
    
    // v0.3.19 — Sequential TTS: speak sentences one at a time, no overlap
    const speakNext = async () => {
      if (speakQueue.length === 0) {
        isSpeakingNow = false;
        return;
      }
      const nextSentence = speakQueue.shift()!;
      isSpeakingNow = true;
      // Stop any current speech before starting next
      stopSpeaking();
      // Small delay to ensure previous is fully stopped
      await new Promise(r => setTimeout(r, 50));
      speak(nextSentence);
      // Wait for this sentence to finish before speaking next
      const waitAndNext = () => {
        // isSpeaking is from the TTS hook closure
        if (!isSpeakingRef.current) {
          if (speakQueue.length > 0) {
            setTimeout(speakNext, 50);
          } else {
            isSpeakingNow = false;
          }
          return;
        }
        setTimeout(waitAndNext, 100);
      };
      setTimeout(waitAndNext, 300);
    };
    
    // ═══ FEATURE #6: Voice Emotion context (streaming) ═══
    // Voice emotion is passed via the inputMode field for now since streamChat doesn't accept extra params
    await chatStream.streamChat(text.trim(), activeMemberId, userMsg.inputMode || 'text', {
      onSentence: (sentence) => {
        fullText += sentence;
        updateLastAssistantMessage(fullText);
        // ═══ FEATURE #1: Streaming TTS — queue sentences to prevent overlap ═══
        speakQueue.push(sentence);
        if (!isSpeakingNow) {
          speakNext();
        }
      },
      onEmotion: (emotion) => {
        if (emotion) setBokaEmotion(emotion as BokaEmotion);
      },
      onDone: (finalText, metadata) => {
        updateLastAssistantMessage(finalText);
        if (metadata?.agentId) setCurrentAgent(metadata.agentId);
        if (metadata?.emotion) setBokaEmotion(metadata.emotion as BokaEmotion);
        // ═══ FEATURE #4: Image Generation inline ═══
        if (metadata?.generatedImageUrl) {
          setGeneratedImages(prev => ({ ...prev, [agentMsgId]: metadata.generatedImageUrl! }));
        }
        // ═══ FEATURE #7: Function Calling ═══
        if (metadata?.expensesCreated && metadata.expensesCreated > 0) {
          setMessageExpenses(prev => ({ ...prev, [agentMsgId]: metadata.expensesCreated! }));
        }
        if (metadata?.calendarEventsCreated && metadata.calendarEventsCreated > 0) {
          setMessageCalendarEvents(prev => ({ ...prev, [agentMsgId]: metadata.calendarEventsCreated! }));
        }
        // Reload memory after stream completes
        loadMemoryEntries();
        loadMemoryGraph(); // Refresh graph view
      },
      onError: (error) => {
        updateLastAssistantMessage(`Błąd: ${error}`);
        setBokaEmotion('angry');
      },
    }, { childNearby, attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined });
    // Reset loading state after stream completes
    setIsLoading(false);
    setStreaming(false);
  };

  const handleCreateReminder = async () => {
    if (!newReminderTitle.trim() || !newReminderDate) return;
    await reminders.createReminder({
      title: newReminderTitle,
      dueDate: newReminderDate,
      category: 'general',
      priority: 'normal',
    } as any);
    setNewReminderTitle('');
    setNewReminderDate('');
  };

  // ═══ FEATURE #1: Streaming Mode toggle ═══
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (streamingMode) {
      sendMessageStream(inputText);
    } else {
      sendMessage(inputText);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (streamingMode) {
        sendMessageStream(inputText);
      } else {
        sendMessage(inputText);
      }
    }
  };

  const activeMember = members.find(m => m.id === activeMemberId);
  const currentAgentInfo = currentAgentId ? AGENT_ICONS[currentAgentId] : AGENT_ICONS.general;

  // ═══════════════════════════════════════════
  // RENDER — Waveform center, Chat right
  // ═══════════════════════════════════════════
  return (
    <div className={`h-screen flex flex-col bg-[#12121c] text-[#e8e8f5] overflow-hidden ${childNearby ? 'child-nearby-mode' : ''}`}>
      {/* ══ HEADER ══ */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[#383850] bg-[#181828] shrink-0">
        <div className="flex items-center gap-0">
          {/* v0.3.19 — Hide sidebar toggle (next to BOKA logo) */}
          <button
            onClick={() => setSidebarHidden(h => !h)}
            className="w-6 h-6 flex items-center justify-center text-[#8888aa] hover:text-[#00f5d4] transition-colors mr-2"
            title={sidebarHidden ? 'Pokaż panel boczny' : 'Ukryj panel boczny'}
            aria-label={sidebarHidden ? 'Pokaż panel boczny' : 'Ukryj panel boczny'}
            aria-expanded={!sidebarHidden}
          >
            {sidebarHidden ? <PanelRight size={14} /> : <PanelLeftClose size={14} />}
          </button>
          {/* v0.3.19 — Sessions toggle */}
          <button
            onClick={() => setShowSessions(s => !s)}
            className={`w-6 h-6 flex items-center justify-center transition-colors mr-2 ${showSessions ? 'text-[#6ec6e7]' : 'text-[#8888aa] hover:text-[#6ec6e7]'}`}
            title="Sesje rozmów"
            aria-label="Sesje rozmów"
            aria-expanded={showSessions}
          >
            <Folder size={14} />
          </button>
          <div className="w-6 h-6 flex items-center justify-center overflow-hidden">
            <BokaFaceMini emotion={bokaEmotion} size={6} faceStyle={faceStyle} />
          </div>
          <h1 className="font-pixel text-xs tracking-wider" style={{ color: '#6ec6e7' }}>BOKA</h1>
          {memoryGrowth > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-[#ffd93d] font-mono">
              <Sparkles size={10} />
              <span>+{memoryGrowth}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0">
          {childNearby && (
            <span className="flex items-center gap-1 px-2 py-1  text-[10px] bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/50 font-mono">
              <Baby size={12} /> Dziecko obok
            </span>
          )}
          {ttsSupported && (
            <button
              onClick={isSpeaking ? stopSpeaking : () => {}}
              className={`p-1.5  transition-colors ${isSpeaking ? 'bg-[#00f5d4]/20 text-[#00f5d4]' : 'text-[#8888aa]'}`}
              title={isSpeaking ? 'Zatrzymaj mowę' : 'Mowa aktywna'}
            >
              {isSpeaking ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          )}
          {/* Bell — przypomnienia (przeniesione z sidebara) */}
          <button
            onClick={() => setShowRemindersTab(!showRemindersTab)}
            className={`p-1.5  transition-colors relative ${showRemindersTab ? 'bg-[#ffd93d]/20 text-[#ffd93d]' : 'text-[#8888aa] hover:text-[#ffd93d]'}`}
            title="Przypomnienia"
          >
            <Bell size={14} />
            {reminders.reminders.filter(r => !r.isCompleted).length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full bg-[#ffd93d] text-[#0a0a0f] text-[8px] font-bold leading-none">
                {reminders.reminders.filter(r => !r.isCompleted).length}
              </span>
            )}
          </button>
          {activeMember && (
            <span className="text-[10px] text-[#8888aa] font-mono flex items-center gap-1">
              {activeMember.photoUrl ? (
                <img
                  src={`/api/family/photo/file?id=${encodeURIComponent(activeMember.id)}&t=${activeMember.photoUrl.split('.').slice(-2, -1)[0] || ''}`}
                  alt={activeMember.name}
                  className="w-5 h-5 object-cover border border-[#383850]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <PixelAvatar name={activeMember.name} category={(activeMember.category || 'family') as any} color={activeMember.color || undefined} role={activeMember.role} size={16} showRing={false} />
              )}
              {activeMember.name}
            </span>
          )}
        </div>
      </header>

      {/* ══ MAIN LAYOUT: Left nav | Left chat | Center waveform ══ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Slim nav sidebar ── */}
        {/* v0.3.19 — togglable via header button (sidebarHidden state) */}
        {!sidebarHidden && (
        <aside className="w-14 border-r border-[#383850] bg-[#181828] flex flex-col items-center py-2 gap-1 shrink-0 overflow-y-auto">
          <button
            onClick={() => setActiveTab('chat')}
            className={`w-10 h-10 shrink-0 flex items-center justify-center transition-all ${activeTab === 'chat' ? 'bg-[#00f5d4]/15 text-[#00f5d4] border border-[#00f5d4]/30' : 'text-[#8888aa] hover:text-[#e8e8f5]'}`}
            title="Czat"
          >
            <MessageSquare size={16} />
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`w-10 h-10 shrink-0 flex items-center justify-center transition-all ${activeTab === 'memory' ? 'bg-[#00f5d4]/15 text-[#00f5d4] border border-[#00f5d4]/30' : 'text-[#8888aa] hover:text-[#e8e8f5]'}`}
            title="Pamięć"
          >
            <MemoryStick size={16} />
          </button>
          <button
            onClick={() => setActiveTab('profiles')}
            className={`w-10 h-10 shrink-0 flex items-center justify-center transition-all ${activeTab === 'profiles' ? 'bg-[#00f5d4]/15 text-[#00f5d4] border border-[#00f5d4]/30' : 'text-[#8888aa] hover:text-[#e8e8f5]'}`}
            title="Rodzina"
          >
            <Users size={16} />
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`w-10 h-10 shrink-0 flex items-center justify-center transition-all ${activeTab === 'agents' ? 'bg-[#00f5d4]/15 text-[#00f5d4] border border-[#00f5d4]/30' : 'text-[#8888aa] hover:text-[#e8e8f5]'}`}
            title="Moi agenci — społeczność agentów AI do debat"
          >
            <Bot size={16} />
          </button>

          {/* v0.4 — Cockpit — wielomodelowy organizm sterowany głosem */}
          <button
            onClick={() => setActiveTab('cockpit')}
            className={`w-10 h-10 shrink-0 flex items-center justify-center transition-all ${activeTab === 'cockpit' ? 'bg-[#ffd93d]/15 text-[#ffd93d] border border-[#ffd93d]/30' : 'text-[#8888aa] hover:text-[#e8e8f5]'}`}
            title="Cockpit — wielomodelowy organizm (Kimi + DeepSeek + GLM + Claude), 3 tryby pamięci, sterowanie głosem"
          >
            <Brain size={16} />
          </button>

          {/* v0.4 — Agent Memory — port z github.com/rohitg00/agentmemory */}
          <button
            onClick={() => setActiveTab('agent-memory')}
            className={`w-10 h-10 shrink-0 flex items-center justify-center transition-all ${activeTab === 'agent-memory' ? 'bg-[#a855f7]/15 text-[#a855f7] border border-[#a855f7]/30' : 'text-[#8888aa] hover:text-[#e8e8f5]'}`}
            title="Agent Memory — hybrydowa pamięć BM25 + synonimy + auto-forget + consolidation"
          >
            <Database size={16} />
          </button>

          {/* v0.3.19 — Skills — frameworki AI (Vector Mem, Mem0, GraphRAG, DeepAgents, AutoGen, Guardrails, Crew, OpenHands, Isaac, Reflection) */}
          <button
            onClick={() => setActiveTab('skills')}
            className={`w-10 h-10 shrink-0 flex items-center justify-center transition-all ${activeTab === 'skills' ? 'bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/30' : 'text-[#8888aa] hover:text-[#e8e8f5]'}`}
            title="Skills — frameworki AI: Vector, Mem0, GraphRAG, DeepAgents, AutoGen, Guardrails, Crew, OpenHands, Isaac, Reflection"
          >
            <Layers size={16} />
          </button>

          {/* v0.3.18 — Tryb Debaty przeniesiony do zakładki „Rozmowa" (chatMode toggle). Przycisk w pasku bocnym usunięty. */}

          {/* v0.3.18 — Dokumenty: osobna zakładka usunięta. Przeciąganie i upuszczanie plików działa w zwykłym czacie (drag&drop → /api/chat/attachments). Backend /api/documents/* pozostaje dostępny. */}

          {/* v0.3.16 — MCP & CLI — serwery MCP + terminal */}
          <button
            onClick={() => setActiveTab('mcp')}
            className={`w-10 h-10 shrink-0 flex items-center justify-center transition-all ${activeTab === 'mcp' ? 'bg-[#6ee7b2]/15 text-[#4ade80] border border-[#6ee7b2]/30' : 'text-[#8888aa] hover:text-[#e8e8f5]'}`}
            title="MCP & CLI — podłącz serwery MCP i używaj terminala"
          >
            <TerminalIcon size={16} />
          </button>

          {/* v0.3.17 — Privacy Layer: Audit Log + Forget API + Consent */}
          <button
            onClick={() => setActiveTab('privacy')}
            className={`w-10 h-10 shrink-0 flex items-center justify-center transition-all ${activeTab === 'privacy' ? 'bg-[#a855f7]/15 text-[#a855f7] border border-[#a855f7]/30' : 'text-[#8888aa] hover:text-[#e8e8f5]'}`}
            title="Prywatność — Dziennik decyzji BOKI ('Dlaczego to zrobiłam?'), Forget API, Zgody domowników"
          >
            <Shield size={16} />
          </button>

          {/* v0.3.19 — Home Assistant usunięty z UI (backend zachowany na przyszłość) */}

          {/* v0.3.19 — Wizja usunięta z lite (kamera monitoring w czacie) */}

          {/* v0.3.4 — USTAWIENIA BOKI przeniesione do menu bocznego Umysł BOKA (zakładka insights) */}

          <div className="w-8 h-px bg-[#2a2a3a] my-2" />

          {/* Mini agent icons */}
          {Object.entries(AGENT_ICONS).map(([key, agent]) => (
            <button
              key={key}
              className={`w-8 h-8 shrink-0 flex items-center justify-center transition-all ${
                currentAgentId === key
                  ? 'bg-[#252535] border border-[#00f5d4]/40'
                  : 'hover:bg-[#1a1a28]'
              }`}
              style={{ color: agent.color }}
              title={agent.label}
            >
              {agent.icon}
            </button>
          ))}

          <div className="flex-1" />

          {/* Memory counter */}
          <div className="text-center">
            <Activity size={12} className="text-[#00f5d4] mx-auto" />
            <div className="text-[8px] text-[#00f5d4] font-mono">{memoryEntries.length}</div>
          </div>

          {/* Child toggle */}
          <button
            onClick={toggleChildNearby}
            className={`w-8 h-8 shrink-0 flex items-center justify-center transition-all ${childNearby ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'text-[#8888aa]'}`}
            title={childNearby ? 'Tryb dziecko (emotki włączone)' : 'Tryb dorosły (bez emotików)'}
          >
            <Baby size={14} />
          </button>

          {/* v0.3.7 — File Explorer toggle (Show side bar) */}
          <button
            onClick={() => setShowFileExplorer(v => !v)}
            className={`w-8 h-8 shrink-0 flex items-center justify-center transition-all ${showFileExplorer ? 'bg-[#6ec6e7]/10 text-[#6ec6e7]' : 'text-[#8888aa] hover:text-[#6ec6e7]'}`}
            title={showFileExplorer ? 'Ukryj explorator plików' : 'Pokaż explorator plików (drzewko PC)'}
          >
            <PanelRight size={14} />
          </button>
        </aside>
        )}
        {/* ── LEFT-CENTER: Chat panel (v0.3.4 — pół okna z lewej) ── */}
        {/* v0.3.18 — chatMode toggle: 'normal' (zwykły czat) | 'debate' (DebateTab zamiast panelu czatu + waveformu) */}
        {activeTab === 'chat' && !showRemindersTab && chatMode === 'debate' && (
          <main className="flex-1 flex overflow-hidden">
            <DebateTab onExit={() => setChatMode('normal')} chatMode={chatMode} setChatMode={setChatMode} />
          </main>
        )}
        {activeTab === 'chat' && !showRemindersTab && chatMode === 'normal' && (
          <ResizableSplit
            left={
              <aside
                className="h-full border-r border-[#383850] bg-[#181828] flex flex-col min-w-0 relative"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* v0.3.16: Drag & drop overlay */}
            {isDragOver && (
              <div className="absolute inset-0 z-50 bg-[#6ec6e7]/10 border-2 border-dashed border-[#6ec6e7]/60  flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Paperclip size={48} className="text-[#6ec6e7] mx-auto mb-2 animate-pulse" />
                  <div className="text-sm font-mono text-[#6ec6e7]">Upuść pliki tutaj</div>
                  <div className="text-[10px] text-[#8888aa] font-mono mt-1">obraz · audio · txt · pdf</div>
                </div>
              </div>
            )}
            {/* Chat header — v0.3.18: dodany przełącznik trybu Rozmowa ↔ Debata */}
            <div className="px-4 py-2 border-b border-[#383850] flex items-center justify-between">
              <div className="flex items-center gap-1">
                {/* Przycisk „Rozmowa" — aktywny, bo jesteśmy w bloku chatMode === 'normal'. */}
                <button
                  type="button"
                  onClick={() => setChatMode('normal')}
                  className="px-2 py-0.5  text-[10px] font-mono transition-all bg-[#00f5d4]/15 text-[#00f5d4] border border-[#00f5d4]/30"
                  title="Zwykła rozmowa — tak jak wcześniej"
                >
                  Rozmowa
                </button>
                {/* Przycisk „Debata" — nieaktywny (klikalny, przełącza do trybu debaty). */}
                <button
                  type="button"
                  onClick={() => setChatMode('debate')}
                  className="px-2 py-0.5  text-[10px] font-mono transition-all flex items-center gap-1 text-[#8888aa] hover:text-[#a855f7] hover:border-[#a855f7]/40 border border-transparent"
                  title="Tryb debaty — Boka dzieli się na kilku agentów-personowości i debatuje ze sobą. Ty moderujesz."
                >
                  <Users size={10} />
                  Debata
                </button>
              </div>
              <div className="flex items-center gap-0">
                {vadMode && speakerId.currentSpeaker && (
                  <span className="text-[10px] text-[#4ade80] font-mono flex items-center gap-1">
                    <UsersRound size={10} />
                    {speakerId.currentSpeaker.memberName} ({Math.round(speakerId.currentSpeaker.confidence * 100)}%)
                  </span>
                )}
                {currentAgentId && AGENT_ICONS[currentAgentId] && (
                  <span className="text-[10px] font-mono flex items-center gap-1" style={{ color: AGENT_ICONS[currentAgentId].color }}>
                    {AGENT_ICONS[currentAgentId].icon}
                    {AGENT_ICONS[currentAgentId].label}
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {/* v0.3.6 — empty-chat welcome + 4 default buttons usunięte na życzenie użytkownika */}
              {messages.length === 0 && (
                <div className="text-center py-16 text-[#5a5a78]">
                  <div className="text-[10px] font-mono">·</div>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`msg-appear flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%]  p-2.5 ${
                    msg.role === 'user'
                      ? 'bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#e8e8f5]'
                      : msg.role === 'system'
                      ? 'bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[#ff6b6b]'
                      : 'bg-[#252535] border border-[#383850] text-[#e8e8f5]'
                  }`}>
                    {msg.role === 'agent' && msg.agentId && AGENT_ICONS[msg.agentId] && (
                      <div className="flex items-center gap-1 mb-1 text-[9px]" style={{ color: AGENT_ICONS[msg.agentId].color }}>
                        {AGENT_ICONS[msg.agentId].icon}
                        <span>{AGENT_ICONS[msg.agentId].label}</span>
                      </div>
                    )}
                    <div className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>
                    {generatedImages[msg.id] && (
                      <div className="mt-2">
                        <img
                          src={generatedImages[msg.id]}
                          alt="Wygenerowany obrazek"
                          className=" max-w-full border border-[#383850]"
                          style={{ maxHeight: '200px' }}
                        />
                      </div>
                    )}
                    {(messageExpenses[msg.id] || messageCalendarEvents[msg.id]) && (
                      <div className="mt-1.5 flex items-center gap-0 flex-wrap">
                        {messageExpenses[msg.id] && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5  text-[8px] font-mono bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20">
                            <Coins size={8} /> {messageExpenses[msg.id]} wydatek
                          </span>
                        )}
                        {messageCalendarEvents[msg.id] && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5  text-[8px] font-mono bg-[#ffd93d]/10 text-[#ffd93d] border border-[#ffd93d]/20">
                            <Clock size={8} /> {messageCalendarEvents[msg.id]} wydarzenie
                          </span>
                        )}
                      </div>
                    )}
                    {msg.id.startsWith('proactive-') && (
                      <button
                        onClick={() => setProactiveDismissed(true)}
                        className="mt-1 text-[9px] text-[#8888aa] hover:text-[#e8e8f5] font-mono underline"
                      >
                        Zamknij
                      </button>
                    )}
                    <div className="mt-1 text-[9px] text-[#8888aa]">
                      {msg.timestamp instanceof Date
                        ? msg.timestamp.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
                        : new Date(msg.timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
                      }
                    </div>
                  </div>
                </div>
              ))}

              {isStreaming && (
                <div className="flex justify-start">
                  <div className="bg-[#252535] border border-[#383850]  p-2.5 flex items-center gap-0">
                    <BokaFace emotion="thinking" size={6} analyserNode={analyserNode} isSpeaking={isSpeaking} isListening={isListening} faceStyle={faceStyle} />
                    <span className="text-[10px] text-[#8888aa] font-mono">{currentAgentInfo.label} myśli...</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input — v0.3.19: flush bar, same height as vision bar (h-10 = 40px) */}
            <div className="shrink-0 border-t border-[#383850] p-0">
              {micError && (
                <div className="px-3 py-1.5 bg-[#ff6b6b]/10 border-b border-[#ff6b6b]/20 flex items-center gap-0">
                  <span className="text-[10px] text-[#ff6b6b] font-mono">{micError}</span>
                </div>
              )}
              {showImageGen && (
                <div className="mb-2 p-2 bg-[#a855f7]/5 border border-[#a855f7]/30 rounded-lg">
                  <div className="flex items-center gap-0 mb-1.5">
                    <Palette size={12} className="text-[#a855f7]" />
                    <span className="text-[10px] text-[#a855f7] font-mono">Boka narysuje...</span>
                    <button type="button" onClick={() => setShowImageGen(false)} className="ml-auto text-[#8888aa] hover:text-[#e8e8f5]"><X size={12} /></button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={imageGenPrompt}
                      onChange={e => setImageGenPrompt(e.target.value)}
                      placeholder="Kot w kosmosie..."
                      className="flex-1 bg-[#252535] border border-[#383850]  px-2 py-1 text-xs text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#a855f7]/50 font-mono"
                      onKeyDown={e => { if (e.key === 'Enter') handleGenerateImage(); }}
                    />
                    <button
                      type="button"
                      onClick={handleGenerateImage}
                      disabled={imageGen.isGenerating || !imageGenPrompt.trim()}
                      className="px-2 py-1  bg-[#a855f7] text-white text-[10px] font-mono disabled:opacity-30"
                    >
                      {imageGen.isGenerating ? '...' : 'Rysuj'}
                    </button>
                  </div>
                </div>
              )}
              {/* v0.3.16: pending attachments preview (drag&drop) */}
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {pendingAttachments.map((att) => (
                    <div
                      key={att.id}
                      className={`flex items-center gap-0 px-2 py-1  border text-[10px] font-mono ${
                        att.status === 'ready'
                          ? 'bg-[#6ec6e7]/10 border-[#6ec6e7]/30 text-[#6ec6e7]'
                          : att.status === 'error'
                          ? 'bg-[#ff6b6b]/10 border-[#ff6b6b]/30 text-[#ff6b6b]'
                          : 'bg-[#252535] border-[#383850] text-[#8888aa]'
                      }`}
                    >
                      {att.thumbnailDataUrl ? (
                        <img src={att.thumbnailDataUrl} alt={att.fileName} className="w-6 h-6  object-cover" />
                      ) : att.status === 'uploading' ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : att.status === 'error' ? (
                        <X size={12} />
                      ) : (
                        <Paperclip size={12} />
                      )}
                      <span className="max-w-[120px] truncate" title={att.fileName}>{att.fileName}</span>
                      {att.extractionKind && att.status === 'ready' && (
                        <span className="text-[8px] opacity-60">[{att.extractionKind}]</span>
                      )}
                      {att.status === 'error' && (
                        <span className="text-[8px]" title={att.error}>błąd</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        className="hover:text-[#ff6b6b] ml-1"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleSubmit} className="flex items-stretch gap-0">
                <div className="relative shrink-0 flex">
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`px-3 h-10 transition-all border-r border-[#383850] ${
                      isListening
                        ? 'voice-recording bg-[#ff6b6b]/20 text-[#ff6b6b]'
                        : 'bg-[#252535] text-[#8888aa] hover:text-[#00f5d4]'
                    }`}
                    title={isListening ? 'Zatrzymaj nasłuchiwanie' : 'Kliknij aby mówić'}
                  >
                    {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                  {detectedEmotion && (
                    <span className="absolute top-1 right-1 px-1 py-0.5  text-[7px] font-mono font-bold leading-none" style={{
                      backgroundColor: detectedEmotion === 'happy' ? '#4ade80' : detectedEmotion === 'sad' ? '#60a5fa' : detectedEmotion === 'angry' ? '#ff6b6b' : detectedEmotion === 'excited' ? '#ffd93d' : '#6b6b8d',
                      color: '#0a0a0f',
                    }}>
                      {detectedEmotion === 'happy' ? '😊' : detectedEmotion === 'sad' ? '😢' : detectedEmotion === 'angry' ? '😠' : detectedEmotion === 'excited' ? '🤩' : detectedEmotion === 'calm' ? '😌' : '😐'}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setVadMode(!vadMode)}
                  className={`p-2  transition-all shrink-0 ${
                    vadMode
                      ? 'bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/50'
                      : 'bg-[#252535] text-[#8888aa] border border-[#383850] hover:border-[#4ade80]/30'
                  }`}
                  title={vadMode ? 'Zawsze nasłuchuję — wyłącz' : 'Włącz nasłuchiwanie (hands-free)'}
                >
                  <Ear size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setStreamingMode(!streamingMode)}
                  className={`p-2  transition-all shrink-0 ${
                    streamingMode
                      ? 'bg-[#00f5d4]/20 text-[#00f5d4] border border-[#00f5d4]/50'
                      : 'bg-[#252535] text-[#8888aa] border border-[#383850] hover:border-[#00f5d4]/30'
                  }`}
                  title={streamingMode ? 'Tryb streaming: WŁĄCZONY' : 'Włącz tryb streaming'}
                >
                  <Radio size={16} />
                </button>
                {nativeAsrSupported && (
                  <button
                    type="button"
                    onClick={toggleContinuousMode}
                    className={`p-2  transition-all shrink-0 ${
                      continuousMode
                        ? 'bg-[#00f5d4]/20 text-[#00f5d4] border border-[#00f5d4]/50'
                        : 'bg-[#252535] text-[#8888aa] border border-[#383850] hover:border-[#00f5d4]/30'
                    }`}
                    title={continuousMode ? 'Tryb ciągły: WŁĄCZONY (Boka cały czas słucha)' : 'Włącz tryb ciągłego nasłuchiwania'}
                  >
                    <Activity size={16} />
                  </button>
                )}
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
 placeholder={isListening ? (continuousMode ?' Ciągłe nasłuchiwanie...' :'Mów...') :'Napisz do Boki...'}
                  className="flex-1 bg-[#181828] border-0 px-3 h-10 text-xs text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:bg-[#0f0f17] font-mono min-w-0"
                  disabled={isLoading}
                />
                {/* v0.3.19 — Single + button replaces camera + paperclip + palette */}
                {/* Opens popover menu with 3 attachment options */}
                <div className="relative shrink-0" ref={plusMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowPlusMenu(v => !v)}
                    className={`px-3 h-10 transition-all ${
                      showPlusMenu || pendingAttachments.length > 0 || showImageGen
                        ? 'bg-[#00f5d4]/20 text-[#00f5d4]'
                        : 'bg-[#252535] text-[#8888aa] hover:text-[#00f5d4]'
                    }`}
                    title="Załącz plik · zdjęcie · narysuj obrazek"
                    aria-label="Dodaj załącznik lub narysuj obrazek"
                    aria-expanded={showPlusMenu}
                  >
                    <Plus size={16} />
                  </button>
                  {showPlusMenu && (
                    <div
                      className="absolute bottom-full right-0 mb-2 w-56 bg-[#252535] border border-[#383850] shadow-2xl overflow-hidden z-50"
                      role="menu"
                    >
                      {/* Zdjęcie (kamera) — upload obrazu, BOKA go zobaczy przez VLM */}
                      <button
                        type="button"
                        onClick={() => { setShowPlusMenu(false); fileInputRef.current?.click(); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-mono text-[#e8e8f5] hover:bg-[#a855f7]/10 transition-colors border-b border-[#383850]"
                        role="menuitem"
                      >
                        <Camera size={14} className="text-[#a855f7] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div>Zdjęcie</div>
                          <div className="text-[9px] text-[#8888aa]">BOKA zobaczy i opisze obraz</div>
                        </div>
                      </button>
                      {/* Plik (spinacz) — dowolny plik: obraz, audio, txt, pdf */}
                      <button
                        type="button"
                        onClick={() => { setShowPlusMenu(false); attachmentInputRef.current?.click(); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-mono text-[#e8e8f5] hover:bg-[#6ec6e7]/10 transition-colors border-b border-[#383850]"
                        role="menuitem"
                      >
                        <Paperclip size={14} className="text-[#6ec6e7] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div>Plik</div>
                          <div className="text-[9px] text-[#8888aa]">obraz · audio · txt · pdf · csv</div>
                        </div>
                      </button>
                      {/* Narysuj obrazek (paleta) — generowanie przez AI */}
                      <button
                        type="button"
                        onClick={() => { setShowPlusMenu(false); setShowImageGen(true); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-mono text-[#e8e8f5] hover:bg-[#ffd93d]/10 transition-colors"
                        role="menuitem"
                      >
                        <Palette size={14} className="text-[#ffd93d] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div>Narysuj obrazek</div>
                          <div className="text-[9px] text-[#8888aa]">BOKA narysuje to o co poprosisz</div>
                        </div>
                      </button>
                      {/* Podpowiedź: drag&drop też działa */}
                      <div className="px-3 py-1.5 bg-[#181828] border-t border-[#383850] text-[9px] text-[#5a5a78] font-mono">
                        Możesz też przeciągnąć i upuścić plik bezpośrednio w oknie czatu
                      </div>
                    </div>
                  )}
                </div>
                {/* Ukryte inputy — wywoływane z menu "+" lub drag&drop */}
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  accept="image/*,audio/*,text/*,.txt,.md,.json,.csv,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFiles(e.target.files);
                    }
                    e.target.value = '';
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="submit"
                  disabled={(!inputText.trim() && pendingAttachments.filter(a => a.status === 'ready').length === 0) || isLoading}
                  className="px-4 h-10 bg-[#00f5d4] text-[#0a0a0f] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#00dbc4] transition-all shrink-0"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </aside>
            }
            right={
          <>
        {showRemindersTab && (
          <main className="flex-1 overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-pixel text-sm" style={{ color: '#4ade80' }}>PRZYPOMNIENIA</h2>
                <button onClick={() => setShowRemindersTab(false)} className="text-[#8888aa] hover:text-[#e8e8f5]"><X size={16} /></button>
              </div>
              
              {/* New reminder form */}
              <div className="mb-2 p-2 bg-[#252535] border border-[#383850] rounded-lg">
                <div className="flex items-center gap-0 mb-2">
                  <Plus size={14} className="text-[#00f5d4]" />
                  <span className="text-xs font-mono text-[#e8e8f5]">Nowe przypomnienie</span>
                </div>
                <div className="flex items-center gap-0">
                  <input type="text" value={newReminderTitle} onChange={e => setNewReminderTitle(e.target.value)} placeholder="Co przypomnieć?" className="flex-1 bg-[#1a1a28] border border-[#383850]  px-2 py-1.5 text-xs text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:border-[#00f5d4]/50 font-mono" />
                  <input type="datetime-local" value={newReminderDate} onChange={e => setNewReminderDate(e.target.value)} className="bg-[#1a1a28] border border-[#383850]  px-2 py-1.5 text-xs text-[#e8e8f5] focus:outline-none focus:border-[#00f5d4]/50 font-mono" />
                  <button onClick={handleCreateReminder} className="px-3 py-1.5  bg-[#00f5d4] text-[#0a0a0f] text-xs font-mono">Dodaj</button>
                </div>
              </div>
              
              {/* Reminders list */}
              <div className="space-y-2">
                {reminders.isLoading ? (
                  <div className="text-center py-8 text-[#8888aa] text-sm font-mono">Ładowanie...</div>
                ) : reminders.reminders.length === 0 ? (
                  <div className="text-center py-8 text-[#8888aa] text-sm font-mono">Brak przypomnień</div>
                ) : (
                  reminders.reminders.map(r => (
                    <div key={r.id} className={`p-2 bg-[#252535] border border-[#383850]  flex items-center gap-0 ${r.isCompleted ? 'opacity-50' : ''}`}>
                      <Clock size={14} className="text-[#ffd93d] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[#e8e8f5] font-mono">{r.title}</div>
                        <div className="text-[10px] text-[#8888aa] font-mono">{new Date(r.dueDate).toLocaleString('pl-PL')}</div>
                      </div>
                      <button onClick={() => reminders.deleteReminder(r.id)} className="text-[#8888aa] hover:text-[#ff6b6b] shrink-0"><Trash2 size={14} /></button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </main>
        )}

        {/* ── CENTER: BIG WAVEFORM (the star of the show) ── */}
        {/* v0.3.18 — waveform tylko w trybie 'normal'. W trybie 'debate' DebateTab zastępuje całą sekcję. */}
        {/* v0.3.19 — pod kulą BOKI jest panel kamery (16:9) + dolny pasek kontrolny — inside ResizableSplit right */}
        {(!showRemindersTab) && (
          <main className="h-full flex flex-col relative overflow-hidden">
            {/* Glow background effect */}
            <div className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse 80% 70% at 50% 40%, ${
                  bokaEmotion === 'talking' ? 'rgba(0,245,212,0.10)' :
                  bokaEmotion === 'listening' ? 'rgba(0,245,212,0.06)' :
                  bokaEmotion === 'thinking' ? 'rgba(255,217,61,0.06)' :
                  bokaEmotion === 'happy' || bokaEmotion === 'greeting' ? 'rgba(74,222,128,0.06)' :
                  bokaEmotion === 'angry' ? 'rgba(255,68,68,0.06)' :
                  'rgba(0,245,212,0.03)'
                } 0%, transparent 70%)`
              }}
            />

            {/* ── TOP: Kula BOKI + emotion label (flex-1, centered) ── */}
            {/* v0.3.19 — BokaFace fills entire panel as Obsidian graph (full-bleed) */}
            <div className="flex-1 flex flex-col items-center justify-center gap-0 relative z-10 min-h-0">
              {/* THE GRAPH — fills entire panel, interactive with conversation */}
              <div className="absolute inset-0">
                <BokaFace
                  emotion={bokaEmotion}
                  size={waveformSize}
                  analyserNode={analyserNode}
                  micAnalyserNode={vadMode ? vad.analyserNode : micAnalyserNode}
                  isSpeaking={isSpeaking}
                  isListening={isListening || vad.isSpeechDetected}
                  onClick={() => {
                    const phrases = [
                      'Hej, co tam?',
                      'Semanko!',
                      'O czym pogadamy?',
                      'Co mnie zaczepiasz?',
                    ];
                    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
                    try { speak(phrase); } catch (e) { console.warn('TTS failed:', e); }
                  }}
                  faceStyle={faceStyle}
                  fillContainer={true}
                  graphNodes={memoryGraphNodes}
                  graphEdges={memoryGraphEdges}
                  focusNodeId={focusNodeId}
                  focusIntensity={focusIntensity}
                  thinkingTopics={thinkingTopics}
                  formulaSettings={formulaSettings}
                />
              </div>

              {/* Emotion label — overlaid on graph */}
              <div className="text-center relative z-10 mt-auto mb-4">
                {/* Quick status line */}
                {isSpeaking && (
                  <div className="text-xs text-[#00f5d4]/60 font-mono mt-1 animate-pulse">
                    Boka mówi...
                  </div>
                )}
                {isListening && (
                  <div className="text-xs text-[#ff6b6b]/80 font-mono mt-1 animate-pulse">
                    ● Słucham...
                  </div>
                )}
                {isLoading && !isSpeaking && (
                  <div className="text-xs text-[#ffd93d]/60 font-mono mt-1">
                    Myśli...
                  </div>
                )}
                {/* ═══ FEATURE #2: VAD "Nasłuchuję..." indicator ═══ */}
                {vadMode && vad.isSpeechDetected && (
                  <div className="text-xs text-[#4ade80] font-mono mt-1 animate-pulse">
                    ● Nasłuchuję...
                  </div>
                )}
                {/* ═══ FEATURE #8: Multi-party "Mówi:" indicator ═══ */}
                {vadMode && speakerId.currentSpeaker && (
                  <div className="text-[10px] text-[#4ade80]/80 font-mono mt-1 flex items-center gap-1">
                    <UsersRound size={10} />
                    Mówi: {speakerId.currentSpeaker.memberName}
                  </div>
                )}

                {/* Voice Emotion indicator */}
                {detectedEmotion && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-mono" style={{ color: detectedEmotion === 'happy' ? '#4ade80' : detectedEmotion === 'sad' ? '#60a5fa' : detectedEmotion === 'angry' ? '#ff6b6b' : detectedEmotion === 'excited' ? '#ffd93d' : '#6b6b8d' }}>
                      Emocja z głosu: {detectedEmotion}
                    </span>
                  </div>
                )}
              </div>

              {/* ══ PROACTIVE MESSAGE BANNER ══ */}
              {proactive.proactiveMessage?.shouldSend && !proactiveDismissed && (
                <div className="mt-1 p-2  bg-[#252535]/90 border border-[#ffd93d]/30 backdrop-blur-sm max-w-xs animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-start gap-0">
                    <Sparkles size={14} className="text-[#ffd93d] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[10px] text-[#ffd93d] font-mono mb-1">Boka pisze:</div>
                      <div className="text-xs text-[#e8e8f5] font-mono">{proactive.proactiveMessage.message}</div>
                    </div>
                    <button onClick={() => setProactiveDismissed(true)} className="text-[#8888aa] hover:text-[#e8e8f5] shrink-0"><X size={12} /></button>
                  </div>
                </div>
              )}
            </div>

            {/* ── MIDDLE: Panel wizji — kamera 16:9, rozciągnięta DO BOKÓW ── */}
            {/* v0.3.19 — okno kamery renderuje się gdy visionStreamOn LUB visionStarting (overlay loading) */}
            {(visionStreamOn || visionStarting) && (
              <div className="shrink-0 flex items-stretch justify-stretch relative z-10">
                {cameraStyle === 'spherical' ? (
                  /* SFERA — czarno-białe rybie oko */
                  <div className="relative w-full aspect-video bg-[#12121c] flex items-center justify-center overflow-hidden">
                    <div
                      className="relative mx-auto"
                      style={{
                        width: `${Math.min(waveformSize, 320)}px`,
                        height: `${Math.min(waveformSize, 320)}px`,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        border: '2px solid rgba(0, 245, 212, 0.3)',
                        boxShadow: '0 0 40px rgba(0, 245, 212, 0.15), inset 0 0 30px rgba(0,0,0,0.7)',
                      }}
                    >
                      <video
                        ref={visionVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        style={{
                          transform: 'scaleX(-1) scale(1.2)',
                          filter: `grayscale(1) contrast(${eyeSharpness}) brightness(${eyeBrightness}) saturate(${eyeSaturation}) blur(${eyeBlur}px)`,
                        }}
                      />
                      <div className="absolute inset-0 pointer-events-none" style={{
                        background: `radial-gradient(circle at center,
                          transparent 0%, transparent 25%,
                          rgba(10,10,15,0.2) 45%,
                          rgba(10,10,15,0.5) 60%,
                          rgba(10,10,15,0.85) 80%)`,
                      }} />
                      {/* Loading / not-ready overlay */}
                      {(visionStarting || !videoReady) && !visionError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#12121c] text-center">
                          <div className="w-6 h-6 border-2 border-[#00f5d4]/30 border-t-[#00f5d4] rounded-full animate-spin mb-2" />
                          <div className="text-[10px] text-[#8888aa] font-mono">
                            {visionStarting ? 'Uruchamianie kamery...' : 'Ładowanie strumienia...'}
                          </div>
                        </div>
                      )}
                      {/* Error overlay */}
                      {visionError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#12121c] text-center px-3">
                          <Camera size={24} className="text-[#ff6b6b] mb-2" />
                          <div className="text-[9px] text-[#ff6b6b] font-mono leading-tight">{visionError}</div>
                        </div>
                      )}
                      {isRecording && (
                        <div className="absolute top-[12%] right-[12%] flex items-center gap-1 px-1.5 py-0.5  bg-[#ff4444]/80 backdrop-blur-sm animate-pulse">
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          <span className="text-[8px] text-white font-mono">REC {formatRecTime(recordingSeconds)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* PROSTOKĄT — zwykła kamera 16:9 */
                  <div className="relative w-full aspect-video bg-black overflow-hidden">
                    <video
                      ref={visionVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    {/* Loading / not-ready overlay */}
                    {(visionStarting || !videoReady) && !visionError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center">
                        <div className="w-8 h-8 border-2 border-[#00f5d4]/30 border-t-[#00f5d4] rounded-full animate-spin mb-3" />
                        <div className="text-xs text-[#8888aa] font-mono">
                          {visionStarting ? 'Uruchamianie kamery...' : 'Ładowanie strumienia...'}
                        </div>
                        <div className="text-[10px] text-[#5a5a78] font-mono mt-1">
                          Jeśli nie startuje — sprawdź zgodę w pasku adresu
                        </div>
                      </div>
                    )}
                    {/* Error overlay */}
                    {visionError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center px-4">
                        <Camera size={36} className="text-[#ff6b6b] mb-2" />
                        <div className="text-xs text-[#ff6b6b] font-mono mb-2">Błąd kamery</div>
                        <div className="text-[10px] text-[#a0a0c0] font-mono leading-tight max-w-xs">{visionError}</div>
                      </div>
                    )}
                    {isRecording && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5  bg-[#ff4444]/80 backdrop-blur-sm animate-pulse">
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        <span className="text-[8px] text-white font-mono">REC {formatRecTime(recordingSeconds)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── BOTTOM: Pasek kontrolny kamery ── */}
            {/* v0.3.19 — edge-to-edge: bez paddingu, przyciski na styk */}
            <div className="shrink-0 border-t border-[#383850] p-0 relative z-10 bg-[#181828]/50 flex items-stretch">
              <span className="text-[10px] font-mono text-[#8888aa] shrink-0 flex items-center gap-1.5 px-3 border-r border-[#383850]">
                <Eye size={11} className="text-[#a855f7]" />
                Wizja
              </span>
              <button
                type="button"
                onClick={toggleVisionStream}
                className={`px-3 h-10 transition-all flex items-center gap-1 shrink-0 border-r border-[#383850] ${
                  visionStreamOn
                    ? 'bg-[#ff6b6b]/20 text-[#ff6b6b]'
                    : 'bg-[#a855f7]/15 text-[#a855f7] hover:bg-[#a855f7]/25'
                }`}
                title={visionStreamOn ? 'Zatrzymaj kamerę' : 'Uruchom kamerę'}
              >
                {visionStreamOn ? <Square size={12} /> : <Play size={12} />}
              </button>
              <button
                type="button"
                onClick={toggleScreenRecording}
                className={`px-3 h-10 transition-all flex items-center gap-1 shrink-0 border-r border-[#383850] ${
                  isRecording
                    ? 'bg-[#ff4444]/30 text-[#ff6b6b] animate-pulse'
                    : 'bg-[#252535] text-[#8888aa] hover:text-[#ff6b6b]'
                }`}
                title={isRecording ? 'Zatrzymaj nagrywanie ekranu' : 'Nagraj ekran (zapis do pamięci BOKI)'}
              >
                {isRecording ? <><Square size={12} /></> : <><Circle size={12} className="fill-current" /></>}
              </button>

              {visionError && (
                <span className="text-[10px] text-[#ff6b6b] font-mono flex items-center px-3 border-r border-[#383850]">
 {visionError}
                </span>
              )}

              <div className="flex-1" />

              {/* v0.3.19 — Wygląd BOKA i kamery przeniesione do Ustawień */}
            </div>
          </main>
        )}
          </>
            }
          />
        )}

        {/* v0.3.19 — File Explorer/Viewer moved to end of layout (always right side) */}

        {/* v0.3.18 — Tryb Debaty przeniesiony do zakładki „Rozmowa" (chatMode toggle). Niezależna zakładka 'debate' usunięta. */}

        {/* v0.3.18 — Dokumenty: niezależna zakładka usunięta. Drag&drop plików w zwykłym czacie obsługuje /api/chat/attachments. Backend /api/documents/* pozostaje dostępny dla przyszłych funkcji i zewnętrznych integracji. */}

        {/* v0.3.16 — MCP & CLI — serwery MCP + terminal */}
        {activeTab === 'mcp' && (
          <main className="flex-1 flex overflow-hidden">
            <ErrorBoundary tabName="MCP & CLI">
              <McpTab />
            </ErrorBoundary>
          </main>
        )}

        {/* v0.3.17 — Privacy Layer: Audit Log + Forget API + Consent */}
        {activeTab === 'privacy' && (
          <main className="flex-1 flex overflow-hidden">
            <ErrorBoundary tabName="Prywatność">
              <PrivacyTab />
            </ErrorBoundary>
          </main>
        )}

        {/* v0.3.19 — Home Assistant usunięty z UI (backend /api/homeassistant/* pozostaje dla przyszłości) */}

        {/* v0.3.19 — Wizja usunięta z lite */}

        {/* Non-chat tabs in center */}
        {activeTab !== 'chat' && activeTab !== 'mcp' && activeTab !== 'privacy' && activeTab !== 'insights' && (
          <main className="flex-1 overflow-y-auto">
            <ErrorBoundary tabName="Pamięć">
              {activeTab === 'memory' && <MemoryTab entries={memoryEntries} members={members} activeMemberId={activeMemberId} familyId={familyId} />}
            </ErrorBoundary>
            <ErrorBoundary tabName="Vault">
              {activeTab === 'vault' && <VaultTab />}
            </ErrorBoundary>
            <ErrorBoundary tabName="Rodzina">
              {activeTab === 'profiles' && <ProfilesTab members={members} activeMemberId={activeMemberId} setActiveMember={setActiveMember} childNearby={childNearby} toggleChildNearby={toggleChildNearby} />}
            </ErrorBoundary>
            <ErrorBoundary tabName="Moi agenci">
              {activeTab === 'agents' && <AgentsTab />}
            </ErrorBoundary>
            <ErrorBoundary tabName="Cockpit">
              {activeTab === 'cockpit' && <OrchestratorCockpit />}
            </ErrorBoundary>
            <ErrorBoundary tabName="Agent Memory">
              {activeTab === 'agent-memory' && <AgentMemoryTab />}
            </ErrorBoundary>
            <ErrorBoundary tabName="Umysł BOKA">{null}{null}</ErrorBoundary>
            <ErrorBoundary tabName="Skills">
              {activeTab === 'skills' && <SkillsTab />}
            </ErrorBoundary>
            <ErrorBoundary tabName="Ustawienia">
              {activeTab === 'settings' && <SettingsTab />}
            </ErrorBoundary>
          </main>
        )}

        {/* ══ v0.3.7: FILE VIEWER (okno z tekstem pliku .txt/.html/.md) ══ */}
        {/* v0.3.19 — Always on the RIGHT side (moved after all tab panels) */}
        {showFileExplorer && openFilePath && (
          <aside className="w-[28rem] border-l border-[#383850] bg-[#181828] flex flex-col shrink-0 min-w-0">
            <FileViewer
              path={openFilePath}
              onClose={() => setOpenFilePath(null)}
            />
          </aside>
        )}

        {/* ══ v0.3.7: FILE EXPLORER (drzewko plików PC, zawsze z prawej) ══ */}
        {showFileExplorer && (
          <aside className="w-64 border-l border-[#383850] bg-[#181828] flex flex-col shrink-0">
            <FileExplorer
              onOpenFile={(p) => setOpenFilePath(p)}
              currentFilePath={openFilePath}
            />
          </aside>
        )}

      </div>

      {/* ══ STATUS BAR ══ */}
      <footer className="flex items-center justify-between px-4 py-1 border-t border-[#383850] bg-[#12121c] text-[8px] font-pixel text-[#8888aa] shrink-0">
        <div className="flex items-center gap-0">
          <span className="text-[#00f5d4]">BOKA</span>
          <span>PAMIĘĆ: {memoryEntries.length}</span>
          {wellbeingLog.length > 0 && (
            <span className="text-[#4ade80]">
              <Heart size={8} className="inline" /> {wellbeingLog.length > 0 ? ['','😢','😐','🙂','😊','🌟'][wellbeingLog[0]?.mood || 0] : ''}
            </span>
          )}
          <span className={childNearby ? 'text-[#4ade80]' : ''}>
            {childNearby ? 'DZIECKO: OBOK' : ''}
          </span>
        </div>
        <div className="flex items-center gap-0">
          <span>ASR: {nativeAsrSupported ? 'NATIVE' : asrSupported ? 'BACKEND' : 'BRAK'}</span>
          <span>TTS: {ttsSupported ? 'OK' : 'BRAK'}</span>
          {vadMode && <span className="text-[#4ade80]">VAD</span>}
          {streamingMode && <span className="text-[#00f5d4]">STREAM</span>}
          {fallbackReason && (
            <span className="text-[#ff6b6b] animate-pulse">
 Głos przeglądarki ({fallbackReason})
            </span>
          )}
          <span>AHI</span>
        </div>
      </footer>

      {/* v0.3.19 — Sessions panel (slide-out from left) */}
      <SessionsPanel
        visible={showSessions}
        onClose={() => setShowSessions(false)}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => { setActiveSessionId(id); setShowSessions(false); }}
        onNewSession={() => {}}
      />
    </div>
  );
}

// ═══════════════════════════════════════════
// MEMORY TAB
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// BOKA INSIGHTS — martwe funkcje wskrzeszone: Rituals / Daily Summary / Soul / Improvements
// ═══════════════════════════════════════════
