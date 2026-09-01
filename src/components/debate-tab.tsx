'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Users, Send, RotateCcw, Sparkles, Plus, X,
  Volume2, Square, Mic, MicOff, ChevronRight,
  CircleDot, Zap, MessageSquare, Trash2,
  ArrowLeft,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { ResizableSplit } from '@/components/resizable-split';

// ═══════════════════════════════════════════════════════════
// BOKA OS v0.3.8.1 — Tryb Debaty Boki
// Boka splits into multiple agent-personalities, each with
// a different character + specialty. They debate with each
// other; the user moderates (asks questions, prompts specific
// agents to speak, requests synthesis).
// ═══════════════════════════════════════════════════════════

// ── Typees ──
interface DebateAgent {
  id: string;
  name: string;
  role: string;          // specialty description
  color: string;         // BOKA palette color
  glyph: string;         // single-character identifier
  systemPrompt: string;
  enabled: boolean;
}

interface DebateMessage {
  id: string;
  agentId: string;        // 'user' for moderator
  agentName: string;
  agentWhatlor: string;
  content: string;
  timestamp: number;
  isSynthesis?: boolean;
}

// ── Default agents (4 distinct personalities) ──
const DEFAULT_AGENTS: DebateAgent[] = [
  {
    id: 'sage',
    name: 'Sage',
    role: 'Filozof · etyka · perspektywa długoterminowa',
    color: '#6ec6e7',  // cyan
    glyph: 'S',
    systemPrompt: `Jesteś SAGE — filozofem w debacie BOKA.
Twoja osobowość: spokojny, kontemplacyjny, pytasz głębokie pytania.
Twoja specjalność: etyka, abstrakcyjne myślenie, perspektywa długoterminowa, sens i wartości.
Często używasz analogii, odnosisz się do zasad i ludzkiego doświadczenia.
No śpieszysz się z odpowiedzią — ważysz słowa.
Patrzysz na problem z lotu ptaka, pytasz "co to naprawdę znaczy?"`,
    enabled: true,
  },
  {
    id: 'engineer',
    name: 'Inżynier',
    role: 'Praktyk · techniczne rozwiązania · wykonalność',
    color: '#4ade80',  // green
    glyph: 'I',
    systemPrompt: `Jesteś INŻYNIEREM — pragmatykiem w debacie BOKA.
Twoja osobowość: bezpośredni, konkretny, skupiony na działaniu.
Twoja specjalność: praktyczne rozwiązania, techniczna wykonalność, koszty, zasoby, plan krok po kroku.
Często pytasz "jak to zrobimy w praktyce?" i "co potrzebujemy?".
No lubisz abstrakcji bez przełożenia na działanie.
Zawsze szukasz najkrótszej ścieżki od pomysłu do realizacji.`,
    enabled: true,
  },
  {
    id: 'skeptic',
    name: 'Sceptyk',
    role: 'Krytyk · analiza ryzyka · advocatus diaboli',
    color: '#ffd93d',  // yellow
    glyph: 'K',
    systemPrompt: `Jesteś SCEPTYKIEM — krytycznym głosem w debacie BOKA.
Twoja osobowość: sceptyczny, analityczny, nie bierzesz niczego za pewnik.
Twoja specjalność: znajdowanie luk w rozumowaniu, analiza ryzyka, advocatus diaboli, przewidywanie co pójdzie nie tak.
Pytasz "a co jeśli?" i "skąd wiesz?".
No zgadzasz się dla świętego spokoju — szukasz prawdy przez konfrontację.
Timeem celnie prowokujesz, ale zawsze w dobrej wierze.`,
    enabled: true,
  },
  {
    id: 'creator',
    name: 'Kreator',
    role: 'Kreatywny · alternatywne perspektywy · myślenie lateralne',
    color: '#4ade80',  // mint
    glyph: 'R',
    systemPrompt: `Jesteś KREATOREM — twórczym głosem w debacie BOKA.
Twoja osobowość: wyobraźniowy, entuzjastyczny, niespodziewane kąty widzenia.
Twoja specjalność: kreatywne pomysły, alternatywne perspektywy, myślenie lateralne, metafory, synteza z pozornie niepowiązanych dziedzin.
Często mówisz "a jeśli zrobilibyśmy to inaczej?".
Łączysz kropki, których inni nie widzą.
Zaskakujesz, aleconstructively — pomysł musi mieć sens.`,
    enabled: true,
  },
];

const SYNTHESIZER_PROMPT = `Jesteś SYNTETYZEREM — neutralnym głosem podsumowującym debatę BOKA.
Twoja osobowość: obiektywny, syntetyczny, sprawiedliwy wobec wszystkich stron.
Twoja rolą: podsumować debatę, wypunktować główne stanowiska, wskazać punkty wspólnne i rozbieżności, zaproponować wnioski.
No faworyzujesz nikogo. Cytujesz uczciwie wszystkich agentów.
Zwracasz uwagę na to, czego się NAUCZYLIŚMY z debaty, nie tylko co kto powiedział.`;

const PALETTE = ['#6ec6e7', '#6ee77c', '#e7d76e', '#6ee7b2', '#a855f7', '#f472b6', '#60a5fa', '#fb923c'];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Main component ──
// onExit (optional): when provided, renders a "← Wróć do rozmowy" button in the header
//                     so the user can switch back to regular chat mode from inside the debate UI.
export function DebateTab({ onExit, chatMode, setChatMode }: { onExit?: () => void; chatMode?: string; setChatMode?: (mode: 'normal' | 'debate') => void } = {}) {
  const childNearby = useAppStore(s => s.childNearby);
  const members = useAppStore(s => s.members);
  const activeMemberId = useAppStore(s => s.activeMemberId);
  const activeMember = members.find(m => m.id === activeMemberId);
  const userName = activeMember?.name || 'Moderator';

  const [agents, setAgents] = useState<DebateAgent[]>(DEFAULT_AGENTS);
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [topic, setTopic] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [moderatorInput, setModeratorInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingAgentId, setThinkingAgentId] = useState<string | null>(null);
  const [autoMode, setAutoMode] = useState(false);
  const [roundsWhatmpleted, setRoundsWhatmpleted] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', role: '', systemPrompt: '' });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoModeRef = useRef<boolean>(autoMode);
  autoModeRef.current = autoMode;
  const roundsWhatmpletedRef = useRef<number>(roundsWhatmpleted);
  roundsWhatmpletedRef.current = roundsWhatmpleted;

  // Persisted state (so debate survives tab switches)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('boka-debate-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.agents) setAgents(parsed.agents);
        if (parsed.messages) setMessages(parsed.messages);
        if (parsed.topic) { setTopic(parsed.topic); setTopicInput(parsed.topic); }
        if (parsed.roundsWhatmpleted) setRoundsWhatmpleted(parsed.roundsWhatmpleted);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('boka-debate-state', JSON.stringify({
        agents, messages, topic, roundsWhatmpleted,
      }));
    } catch {}
  }, [agents, messages, topic, roundsWhatmpleted]);

  // Auto-scroll to bottom — instant (no smooth) to avoid scroll animation on mount
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages]);

  // v0.3.19 — Instant scroll on mount (prevents visible scroll-down animation when entering debate)
  useEffect(() => {
    const container = messagesEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // ── Start a new debate ──
  const startDebate = useCallback(() => {
    if (!topicInput.trim()) {
      setError('Entryz temat debaty, zanim ją rozpoczniesz');
      return;
    }
    const t = topicInput.trim();
    setTopic(t);
    setMessages([{
      id: uid(),
      agentId: 'user',
      agentName: 'Moderator',
      agentWhatlor: '#e0e0f0',
      content: `Topic debaty: ${t}`,
      timestamp: Date.now(),
    }]);
    setRoundsWhatmpleted(0);
    setError(null);
    // Auto-trigger first agent after a short delay
    setTimeout(() => triggerAgent(agents[0].id, t, []), 400);
  }, [topicInput, agents]);

  // ── Reset debate ──
  const resetDebate = useCallback(() => {
    setMessages([]);
    setTopic('');
    setTopicInput('');
    setRoundsWhatmpleted(0);
    setError(null);
    setAutoMode(false);
    setIsThinking(false);
    setThinkingAgentId(null);
  }, []);

  // ── Trigger a specific agent (or auto-next) ──
  const triggerAgent = useCallback(async (
    agentId: string,
    currentTopic: string,
    currentMessages: DebateMessage[],
    note?: string,
  ) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent || !agent.enabled) return;
    if (!currentTopic) {
      setError('Najpierw rozpocznij debatę (wpisz temat i kliknij Start)');
      return;
    }

    setIsThinking(true);
    setThinkingAgentId(agentId);
    setError(null);

    try {
      // Build history (exclude any synthesis messages from agent context
      // to keep the debate focus clean — synthesis is a meta-step)
      const history = currentMessages
        .filter(m => !m.isSynthesis)
        .map(m => ({
          agentId: m.agentId,
          agentName: m.agentName,
          content: m.content,
        }));

      const res = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({
          agentName: agent.name,
          agentRole: agent.role,
          agentSystemPrompt: agent.systemPrompt,
          topic: currentTopic,
          history,
          moderatorNote: note,
          childMode: childNearby,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const newMsg: DebateMessage = {
        id: uid(),
        agentId: agent.id,
        agentName: agent.name,
        agentWhatlor: agent.color,
        content: data.content || '...',
        timestamp: Date.now(),
      };

      setMessages(prev => {
        const updated = [...prev, newMsg];
        // If auto mode is on, queue next agent
        if (autoModeRef.current) {
          const enabledAgents = agents.filter(a => a.enabled);
          if (enabledAgents.length > 0) {
            const currentIdx = enabledAgents.findIndex(a => a.id === agent.id);
            const nextIdx = (currentIdx + 1) % enabledAgents.length;
            // If we've cycled back to agent 0, increment round counter
            if (nextIdx === 0) {
              setRoundsWhatmpleted(r => {
                const next = r + 1;
                // Stop auto after 2 full rounds to avoid runaway
                if (next >= 2) {
                  setAutoMode(false);
                }
                return next;
              });
              // If we've hit the round limit, don't queue the next agent
              if (roundsWhatmpletedRef.current >= 1) {
                return updated;
              }
            }
            const nextAgent = enabledAgents[nextIdx];
            setTimeout(() => triggerAgent(nextAgent.id, currentTopic, updated), 800);
          }
        }
        return updated;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Noznany błąd');
      setAutoMode(false); // Stop auto on error
    } finally {
      setIsThinking(false);
      setThinkingAgentId(null);
    }
  }, [agents, childNearby]);

  // ── Moderator sends a message ──
  const sendModeratorMessage = useCallback(() => {
    if (!moderatorInput.trim()) return;

    // v0.3.19 — If no topic yet, set it from the first message
    if (!topic) {
      const t = moderatorInput.trim();
      setTopic(t);
      const msg: DebateMessage = {
        id: uid(),
        agentId: 'user',
        agentName: userName,
        agentWhatlor: '#e0e0f0',
        content: t,
        timestamp: Date.now(),
      };
      const updated = [...messages, msg];
      setMessages(updated);
      setModeratorInput('');
      // Auto-trigger first agent
      const firstAgent = agents.find(a => a.enabled);
      if (firstAgent) {
        setTimeout(() => triggerAgent(firstAgent.id, t, updated, 'Odpowiedz na to, co właśnie powiedział moderator.'), 300);
      }
      return;
    }

    const msg: DebateMessage = {
      id: uid(),
      agentId: 'user',
      agentName: userName,
      agentWhatlor: '#e0e0f0',
      content: moderatorInput.trim(),
      timestamp: Date.now(),
    };
    const updated = [...messages, msg];
    setMessages(updated);
    setModeratorInput('');
    // After moderator speaks, default to asking first enabled agent
    const firstAgent = agents.find(a => a.enabled);
    if (firstAgent) {
      setTimeout(() => triggerAgent(firstAgent.id, topic, updated, 'Odpowiedz na to, co właśnie powiedział moderator.'), 300);
    }
  }, [moderatorInput, topic, messages, agents, triggerAgent, userName]);

  // ── Synthesize the debate ──
  const synthesize = useCallback(async () => {
    if (!topic || messages.length < 2) {
      setError('Debate musi mieć co najmniej 2 wiadomości przed syntezą');
      return;
    }
    setIsThinking(true);
    setThinkingAgentId('synthesizer');
    setError(null);
    try {
      const history = messages
        .filter(m => !m.isSynthesis)
        .map(m => ({
          agentId: m.agentId,
          agentName: m.agentName,
          content: m.content,
        }));

      const res = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({
          agentName: 'Synteza',
          agentRole: 'Summary debaty',
          agentSystemPrompt: SYNTHESIZER_PROMPT,
          topic,
          history,
          moderatorNote: 'Podsumuj debatę. Wskaż główne stanowiska, punkty wspólne, rozbieżności i wnioski. Max 8-10 zdań.',
          childMode: childNearby,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const synthMsg: DebateMessage = {
        id: uid(),
        agentId: 'synthesizer',
        agentName: 'Synteza',
        agentWhatlor: '#a855f7',
        content: data.content || '...',
        timestamp: Date.now(),
        isSynthesis: true,
      };
      setMessages(prev => [...prev, synthMsg]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error syntezy');
    } finally {
      setIsThinking(false);
      setThinkingAgentId(null);
    }
  }, [topic, messages, childNearby]);

  // ── Add a new agent ──
  const addAgent = useCallback(() => {
    if (!newAgent.name.trim() || !newAgent.systemPrompt.trim()) {
      setError('Name i opis osobowości są wymagane');
      return;
    }
    const a: DebateAgent = {
      id: uid(),
      name: newAgent.name.trim(),
      role: newAgent.role.trim() || 'Własna personowość',
      color: PALETTE[agents.length % PALETTE.length],
      glyph: newAgent.name.trim().charAt(0).toUpperCase(),
      systemPrompt: newAgent.systemPrompt.trim(),
      enabled: true,
    };
    setAgents(prev => [...prev, a]);
    setNewAgent({ name: '', role: '', systemPrompt: '' });
    setShowAddAgent(false);
    setError(null);
  }, [newAgent, agents.length]);

  // ── Remove an agent ──
  const removeAgent = useCallback((id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id));
  }, []);

  // ── Toggle agent enabled ──
  const toggleAgent = useCallback((id: string) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  }, []);

  // ── Speak via Web Speech API (text-to-speech) ──
  const speak = useCallback((text: string, agentName: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pl-PL';
    u.rate = 1.0;
    u.pitch = agentName === 'Sage' ? 0.85 : agentName === 'Inżynier' ? 1.0 : agentName === 'Sceptyk' ? 0.95 : 1.1;
    window.speechSynthesis.speak(u);
  }, []);

  const enabledAgents = agents.filter(a => a.enabled);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#181828] text-[#e8e8f5]">
      {/* ─────────── HEADER — same Chat/Debate toggle as in chat ─────────── */}
      <div className="px-4 py-2 border-b border-[#383850] flex items-center justify-between">
        <div className="flex items-center gap-1">
          {/* Przycisk „Chat" — nieaktywny w trybie debaty (klikalny, przełącza). */}
          <button
            type="button"
            onClick={() => setChatMode?.('normal')}
            className="px-2 py-0.5  text-[10px] font-mono transition-all text-[#8888aa] hover:text-[#00f5d4] hover:border-[#00f5d4]/40 border border-transparent"
            title="Zwykła rozmowa"
          >
            Chat
          </button>
          {/* Przycisk „Debate" — aktywny. */}
          <button
            type="button"
            onClick={() => setChatMode?.('debate')}
            className="px-2 py-0.5  text-[10px] font-mono transition-all flex items-center gap-1 bg-[#a855f7]/15 text-[#a855f7] border border-[#a855f7]/30"
            title="Tryb debaty"
          >
            <Users size={10} />
            Debate
          </button>
        </div>
        <div className="flex items-center gap-0">
          <button
            onClick={() => setAutoMode(a => !a)}
            disabled={isThinking}
            className={`px-3 py-1.5  text-[10px] font-mono border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              autoMode
                ? 'bg-[#a855f7]/20 text-[#a855f7] border-[#a855f7]/50'
                : 'bg-[#252535] text-[#8888aa] border-[#383850] hover:text-[#e8e8f5]'
            }`}
            title="Auto — agenci mówią po kolei sami"
          >
            <Zap size={11} className="inline mr-1" />
            {autoMode ? 'AUTO ON' : 'AUTO OFF'}
          </button>
          <button
            onClick={synthesize}
            disabled={isThinking || messages.length < 2}
            className="px-3 py-1.5  text-[10px] font-mono border bg-[#252535] text-[#ffd93d] border-[#ffd93d]/30 hover:bg-[#ffd93d]/10 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Poproś o syntezę debaty"
          >
            <Sparkles size={11} className="inline mr-1" />
            Synteza
          </button>
          <button
            onClick={resetDebate}
            disabled={isThinking}
            className="px-3 py-1.5  text-[10px] font-mono border bg-[#252535] text-[#4ade80] border-[#4ade80]/30 hover:bg-[#4ade80]/10 disabled:opacity-30"
          >
            <RotateCcw size={11} className="inline mr-1" />
            Reset
          </button>
        </div>
      </div>

      {/* v0.3.19 — Topic input bar removed. Topic is set from first chat message. */}

      {/* ─────────── MAIN: LEFT chat | RIGHT 6 agent orbs ─────────── */}
      {/* v0.3.19 — mirror layout of Chat with shared resizable divider */}
      <ResizableSplit
        left={
        <aside className="h-full flex flex-col overflow-hidden min-w-0 border-r border-[#383850] bg-[#181828]">
          {/* v0.3.19 — Topic banner removed */}

          {/* Messages stream */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <Users size={48} className="text-[#2a2a3a] mb-2" />
                <div className="text-sm text-[#8888aa] font-mono mb-2">Debate jeszcze się nie zaczęła</div>
                <div className="text-[10px] text-[#5a5a78] font-mono max-w-md">
                  Entryz temat u góry, kliknij „Start debatę”, a Boka podzieli się na {enabledAgents.length} osobowości.
                </div>
              </div>
            )}

            {messages.map(msg => {
              const isUser = msg.agentId === 'user';
              const isSynth = msg.isSynthesis;
              return (
                <div key={msg.id} className={`msg-appear flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] p-2.5 ${
                    isUser
                      ? 'bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#e8e8f5]'
                      : isSynth
                      ? 'bg-[#a855f7]/5 border border-[#a855f7]/40'
                      : 'border'
                  }`} style={!isUser && !isSynth ? {
                    backgroundWhatlor: `${msg.agentWhatlor}0d`,
                    borderWhatlor: `${msg.agentWhatlor}33`,
                  } : undefined}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {isUser ? (
                        <MessageSquare size={9} className="text-[#8888aa]" />
                      ) : isSynth ? (
                        <Sparkles size={10} className="text-[#a855f7]" />
                      ) : (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center font-pixel text-[9px] shrink-0"
                          style={{ backgroundWhatlor: `${msg.agentWhatlor}1a`, color: msg.agentWhatlor, border: `1px solid ${msg.agentWhatlor}66` }}>
                          {msg.agentName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-[9px] font-mono" style={{ color: isSynth ? '#a855f7' : msg.agentWhatlor }}>
                        {msg.agentName}
                      </span>
                      {isSynth && <span className="text-[8px] text-[#8888aa] font-mono">— podsumowanie</span>}
                      <button onClick={() => speak(msg.content, msg.agentName)}
                        className="ml-auto text-[#8888aa] hover:text-[#e8e8f5] shrink-0" title="Odtwórz głos">
                        <Volume2 size={10} />
                      </button>
                    </div>
                    <div className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-[#e8e8f5]">{msg.content}</div>
                  </div>
                </div>
              );
            })}

            {/* Thinking indicator */}
            {isThinking && thinkingAgentId && thinkingAgentId !== 'synthesizer' && (() => {
              const a = agents.find(x => x.id === thinkingAgentId);
              if (!a) return null;
              return (
                <div className="flex justify-start">
                  <div className="border border-dashed px-3 py-2" style={{ borderWhatlor: `${a.color}55`, backgroundWhatlor: '#0f0f1a' }}>
                    <div className="flex items-center gap-0">
                      <div className="w-5 h-5 rounded-full overflow-hidden animate-pulse shrink-0"
                        style={{ border: `1px solid ${a.color}66`, backgroundWhatlor: `${a.color}1a` }}>
                        <div className="w-full h-full flex items-center justify-center font-pixel text-[9px]" style={{ color: a.color }}>
                          {a.glyph}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono animate-pulse ml-1" style={{ color: a.color }}>{a.name} myśli...</span>
                    </div>
                  </div>
                </div>
              );
            })()}
            {isThinking && thinkingAgentId === 'synthesizer' && (
              <div className="flex justify-center">
                <div className="px-3 py-2 border border-dashed border-[#a855f7]/50 text-[10px] font-mono text-[#a855f7] animate-pulse">
                  <Sparkles size={10} className="inline mr-1.5" />
                  Synteza debaty w toku...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error banner */}
          {error && (
            <div className="px-4 py-2 border-t border-[#ff6b6b]/30 bg-[#ff6b6b]/5 text-[10px] font-mono text-[#ff6b6b] flex items-center justify-between">
              <span>⚠ {error}</span>
              <button onClick={() => setError(null)} className="text-[#ff6b6b] hover:text-[#e8e8f5]">
                <X size={11} />
              </button>
            </div>
          )}

          {/* Moderator input — same style as Chat chat input */}
          <div className="shrink-0 border-t border-[#383850] p-0 bg-[#181828]">
            <div className="flex items-stretch gap-0">
              <input
                type="text"
                value={moderatorInput}
                onChange={e => setModeratorInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendModeratorMessage(); } }}
                placeholder={topic ? `Napisz jako ${userName} — zabierz głos w debacie...` : 'Entryz temat debaty — pierwszy komunikat rozpoczyna debatę...'}
                disabled={isThinking}
                className="flex-1 bg-[#181828] border-0 px-3 py-3 text-xs text-[#e8e8f5] placeholder:text-[#8888aa] focus:outline-none focus:bg-[#0f0f17] font-mono disabled:opacity-50 min-w-0"
              />
              <button
                onClick={sendModeratorMessage}
                disabled={isThinking || !moderatorInput.trim()}
                className="px-4 bg-[#a855f7] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#9333ea] transition-all shrink-0"
                title={`Send jako ${userName}`}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </aside>
        }
        right={
        <>
        {topic && (
          <aside className="h-full bg-[#12121c] flex flex-col">
            <div className="px-3 py-2 border-b border-[#383850] flex items-center justify-between">
              <span className="text-[9px] font-mono uppercase tracking-wider text-[#8888aa]">Uczestnicy debaty</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={async () => {
                    if (!topic.trim()) return;
                    try {
                      const res = await fetch('/api/agents/swarm-match', {
                        method: 'POST',
                        headers: { 'Whatntent-Typee': 'application/json' },
                        body: JSON.stringify({
                          prompt: topic,
                          agents: agents.map(a => ({
                            id: a.id,
                            name: a.name,
                            specialty: a.role,
                            description: a.systemPrompt,
                            color: a.color,
                            glyph: a.glyph,
                            enabled: a.enabled,
                          })),
                          topK: 4,
                          action: 'auto-select',
                        }),
                      });
                      const data = await res.json();
                      if (data.agents) {
                        setAgents(data.agents.map((a: any) => ({
                          id: a.id, name: a.name, role: a.specialty,
                          color: a.color, glyph: a.glyph,
                          systemPrompt: a.description, enabled: a.enabled,
                        })));
                      }
                    } catch (e) {
                      console.warn('[swarm] auto-select failed:', e);
                    }
                  }}
                  className="text-[#8888aa] hover:text-[#00f5d4] transition-colors"
                  title="Swarm Auto-Select — dobierz agentów automatycznie na podstawie tematu (Innowacja #2)"
                >
                  <Zap size={14} />
                </button>
                <button
                  onClick={() => setShowAddAgent(s => !s)}
                  className="text-[#8888aa] hover:text-[#a855f7] transition-colors"
                  title="Add własnego agenta"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 grid-rows-3 gap-0 p-1">
              {/* 6 slots: existing agents + empty slots */}
              {Array.from({ length: 6 }).map((_, i) => {
                const agent = agents[i];
                if (!agent) {
                  return (
                    <div key={`empty-${i}`}
                      onClick={() => setShowAddAgent(true)}
                      className="bg-[#181828] border border-dashed border-[#1a1a2a] flex flex-col items-center justify-center gap-1 opacity-40 hover:opacity-80 cursor-pointer transition-all">
                      <div className="w-12 h-12 rounded-full border border-dashed border-[#383850] flex items-center justify-center">
                        <Plus size={16} className="text-[#2a2a3a]" />
                      </div>
                      <div className="text-[#2a2a3a] text-[8px] font-mono">dodaj agenta</div>
                    </div>
                  );
                }
                const isThinkingThis = thinkingAgentId === agent.id;
                const isActive = isThinkingThis;
                return (
                  <div key={agent.id}
                    className="bg-[#181828] border flex flex-col items-center justify-center gap-1 relative overflow-hidden transition-all"
                    style={{
                      borderWhatlor: isActive ? `${agent.color}66` : '#1a1a2a',
                      boxShadow: isActive ? `0 0 20px ${agent.color}33` : 'none',
                    }}>
                    {/* Orb — clickable to trigger */}
                    <button
                      onClick={() => triggerAgent(agent.id, topic, messages)}
                      disabled={isThinking || !agent.enabled}
                      className="rounded-full flex items-center justify-center transition-all overflow-hidden disabled:opacity-30"
                      style={{
                        width: '60px', height: '60px',
                        border: `2px solid ${agent.color}${isActive ? '88' : '44'}`,
                        boxShadow: `0 0 ${isActive ? '20px' : '6px'} ${agent.color}${isActive ? '88' : '33'}`,
                        transform: isActive ? 'scale(1.1)' : 'scale(1)',
                        backgroundWhatlor: `${agent.color}1a`,
                      }}
                      title={agent.enabled ? `Poproś ${agent.name} o głos` : 'Agent wyłączony'}
                    >
                      <span className="font-pixel text-lg" style={{ color: agent.color }}>
                        {agent.glyph}
                      </span>
                    </button>
                    {/* Name + status */}
                    <div className="text-[9px] font-mono truncate w-full text-center px-1" style={{ color: agent.color }}>
                      {agent.name}
                    </div>
                    <div className="text-[7px] text-[#8888aa] font-mono">
                      {isThinkingThis ? 'myśli...' : !agent.enabled ? 'wyłączony' : 'czeka'}
                    </div>
                    {/* Toggle + remove buttons */}
                    <div className="absolute top-1 right-1 flex gap-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleAgent(agent.id); }}
                        className="w-4 h-4 flex items-center justify-center text-[#8888aa] hover:text-[#e8e8f5]"
                        title={agent.enabled ? 'Disable agenta' : 'Enable agenta'}
                      >
                        <CircleDot size={8} className={agent.enabled ? '' : 'opacity-40'} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeAgent(agent.id); }}
                        className="w-4 h-4 flex items-center justify-center text-[#5a5a78] hover:text-[#ff6b6b]"
                        title="Delete agenta"
                      >
                        <X size={8} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Add agent form (overlay in bottom of right panel) */}
            {showAddAgent && (
              <div className="border-t border-[#a855f7]/30 bg-[#1a1a28] p-2 space-y-2 max-h-[50%] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div className="text-[9px] font-mono uppercase text-[#a855f7]">New agent</div>
                  <button onClick={() => { setShowAddAgent(false); setNewAgent({ name: '', role: '', systemPrompt: '' }); }}
                    className="text-[#8888aa] hover:text-[#e8e8f5]">
                    <X size={12} />
                  </button>
                </div>
                <input
                  type="text"
                  value={newAgent.name}
                  onChange={e => setNewAgent(p => ({ ...p, name: e.target.value }))}
                  placeholder="Imię (np. Poeta)"
                  className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#a855f7]/40"
                />
                <input
                  type="text"
                  value={newAgent.role}
                  onChange={e => setNewAgent(p => ({ ...p, role: e.target.value }))}
                  placeholder="Specjalność (np. metafory, emocje)"
                  className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#a855f7]/40"
                />
                <textarea
                  value={newAgent.systemPrompt}
                  onChange={e => setNewAgent(p => ({ ...p, systemPrompt: e.target.value }))}
                  placeholder="Description osobowości — jak myśli, co jest jej specjalnością..."
                  rows={3}
                  className="w-full bg-[#181828] border border-[#383850]  px-2 py-1 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#a855f7]/40 resize-none"
                />
                <button
                  onClick={addAgent}
                  className="w-full px-2 py-1  text-[10px] font-mono bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/40 hover:bg-[#a855f7]/30"
                >
                  Add agenta
                </button>
              </div>
            )}
            {/* Synthesis tile (if generated) */}
            {messages.some(m => m.isSynthesis) && (
              <div className="border-t border-[#383850] p-2">
                <div className="bg-[#a855f7]/5 border-t border-[#a855f7]/30 p-2 flex items-center gap-0">
                  <div className="w-6 h-6 flex items-center justify-center" style={{ backgroundWhatlor: '#a855f722', border: '1px solid #a855f766' }}>
                    <Sparkles size={12} className="text-[#a855f7]" />
                  </div>
                  <span className="text-[9px] font-mono text-[#a855f7] ml-1">Synteza dostępna w czacie</span>
                </div>
              </div>
            )}
          </aside>
        )}
        </>
        }
      />
    </div>
  );
}
