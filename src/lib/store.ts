import { create } from 'zustand';
import { type FaceStyle } from '@/components/boka-face';
import { type FormulaSettings, DEFAULT_FORMULA_SETTINGS } from '@/components/formula-renderer';

export interface FamilyMember {
  id: string;
  name: string;
  role: string;
  age: number;
  avatarEmoji: string;
  photoUrl?: string | null;  // v0.3.19 — optional photo path
  preferences: Record<string, unknown>;
  isActive: boolean;
  // BOKA v0.3: distinguish family members from "other" people in conversations
  category?: 'family' | 'friend' | 'colleague' | 'acquaintance' | 'other';
  color?: string | null;  // optional UI color override
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'agent';
  content: string;
  agentId?: string;
  confidence?: number;
  inputMode?: 'text' | 'voice';
  timestamp: Date;
}

export interface MemoryEntry {
  id: string;
  memberId?: string;
  entryType: string;
  domain?: string;
  title?: string;
  content: string;
  importance: number;
  tags: string[];
  createdAt: string;
}

export type TabId = 'chat' | 'memory' | 'vault' | 'profiles' | 'agents' | 'settings' | 'insights' | 'debate' | 'documents' | 'mcp' | 'privacy' | 'skills' | 'cockpit' | 'agent-memory';

export interface WellbeingEntry {
  id: string;
  date: string; // ISO date string
  mood: number; // 1-5 scale
  note?: string;
  timestamp: number;
}

interface AppState {
  // Family
  familyId: string | null;
  members: FamilyMember[];
  activeMemberId: string | null;
  childNearby: boolean;

  // Chat
  messages: Message[];
  isStreaming: boolean;
  currentAgentId: string | null;

  // Memory
  memoryEntries: MemoryEntry[];

  // Wellbeing
  wellbeingLog: WellbeingEntry[];
  lastWellbeingCheckIn: number | null; // timestamp of last check-in

  // UI
  activeTab: TabId;
  isListening: boolean;
  isSpeaking: boolean;
  faceStyle: FaceStyle;
  // v0.3.19 — Camera settings (moved from local state to store for Settings access)
  cameraStyle: 'rectangular' | 'spherical';
  eyeSharpness: number;
  eyeBrightness: number;
  eyeSaturation: number;
  eyeBlur: number;
  // v0.3.19 — Formula renderer settings
  formulaSettings: FormulaSettings;

  // Actions
  setFamily: (familyId: string, members: FamilyMember[]) => void;
  setActiveMember: (memberId: string) => void;
  toggleChildNearby: () => void;
  addMessage: (msg: Message) => void;
  setStreaming: (v: boolean) => void;
  setCurrentAgent: (agentId: string | null) => void;
  setMemoryEntries: (entries: MemoryEntry[]) => void;
  addMemoryEntry: (entry: MemoryEntry) => void;
  setActiveTab: (tab: TabId) => void;
  setListening: (v: boolean) => void;
  setSpeaking: (v: boolean) => void;
  setFaceStyle: (style: FaceStyle) => void;
  setCameraStyle: (style: 'rectangular' | 'spherical') => void;
  setEyeSharpness: (v: number) => void;
  setEyeBrightness: (v: number) => void;
  setEyeSaturation: (v: number) => void;
  setEyeBlur: (v: number) => void;
  setFormulaSettings: (s: Partial<FormulaSettings>) => void;
  addWellbeingEntry: (entry: WellbeingEntry) => void;
  setLastWellbeingCheckIn: (timestamp: number) => void;
  updateLastAssistantMessage: (content: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Family
  familyId: null,
  members: [],
  activeMemberId: null,
  childNearby: false,

  // Chat
  messages: [],
  isStreaming: false,
  currentAgentId: null,

  // Memory
  memoryEntries: [],

  // Wellbeing
  wellbeingLog: [],
  lastWellbeingCheckIn: null,

  // UI
  activeTab: 'chat',
  isListening: false,
  isSpeaking: false,
  faceStyle: 'plasma',
  cameraStyle: 'rectangular',
  eyeSharpness: 1.2,
  eyeBrightness: 1.0,
  eyeSaturation: 0,
  eyeBlur: 0,
  formulaSettings: DEFAULT_FORMULA_SETTINGS,

  // Actions
  setFamily: (familyId, members) => set({ familyId, members }),

  setActiveMember: (memberId) => set({ activeMemberId: memberId }),

  toggleChildNearby: () => set((s) => ({ childNearby: !s.childNearby })),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  setStreaming: (v) => set({ isStreaming: v }),

  setCurrentAgent: (agentId) => set({ currentAgentId: agentId }),

  setMemoryEntries: (entries) => set({ memoryEntries: entries }),

  addMemoryEntry: (entry) => set((s) => ({ memoryEntries: [entry, ...s.memoryEntries] })),

  setActiveTab: (tab) => set({ activeTab: tab }),

  addWellbeingEntry: (entry) => set((s) => ({ wellbeingLog: [entry, ...s.wellbeingLog] })),

  setLastWellbeingCheckIn: (timestamp) => set({ lastWellbeingCheckIn: timestamp }),

  setListening: (v) => set({ isListening: v }),

  setSpeaking: (v) => set({ isSpeaking: v }),

  setFaceStyle: (style) => set({ faceStyle: style }),

  setCameraStyle: (style) => set({ cameraStyle: style }),
  setEyeSharpness: (v) => set({ eyeSharpness: v }),
  setEyeBrightness: (v) => set({ eyeBrightness: v }),
  setEyeSaturation: (v) => set({ eyeSaturation: v }),
  setEyeBlur: (v) => set({ eyeBlur: v }),

  setFormulaSettings: (s) => set((state) => ({ formulaSettings: { ...state.formulaSettings, ...s } })),

  updateLastAssistantMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' || msgs[i].role === 'agent') {
          msgs[i] = { ...msgs[i], content };
          break;
        }
      }
      return { messages: msgs };
    }),
}));
