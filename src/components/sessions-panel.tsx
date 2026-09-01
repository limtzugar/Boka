'use client';

// BOKA OS — Sessions Panel (v0.3.19)
// Slide-out panel from left side showing grouped chat sessions.
// Sessions stored in localStorage for now (future: Prisma model).

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Plus, Trash2, ChevronLeft, Folder, Clock } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  group: string; // 'today' | 'yesterday' | 'week' | 'older'
  messageCount: number;
}

const LS_KEY = 'boka.sessions.v1';

function loadSessions(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function saveSessions(sessions: ChatSession[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(sessions)); } catch {}
}

function getGroup(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const diffMs = now.getTime() - ts;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return 'week';
  return 'older';
}

const GROUP_LABELS: Record<string, string> = {
  today: 'Dziś',
  yesterday: 'Wczoraj',
  week: 'Ten tydzień',
  older: 'Starsze',
};

const GROUP_ORDER = ['today', 'yesterday', 'week', 'older'];

interface Props {
  visible: boolean;
  onClose: () => void;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export function SessionsPanel({ visible, onClose, activeSessionId, onSelectSession, onNewSession }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => { setSessions(loadSessions()); }, []);

  const handleDelete = useCallback((id: string) => {
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    saveSessions(updated);
  }, [sessions]);

  const handleNew = useCallback(() => {
    const now = Date.now();
    const newSession: ChatSession = {
      id: `sess_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: 'Nowa rozmowa',
      createdAt: now,
      updatedAt: now,
      group: getGroup(now),
      messageCount: 0,
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    onSelectSession(newSession.id);
    onNewSession();
  }, [sessions, onSelectSession, onNewSession]);

  // Group sessions
  const grouped: Record<string, ChatSession[]> = {};
  for (const s of sessions) {
    const g = getGroup(s.updatedAt);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(s);
  }
  // Sort each group by updatedAt desc
  for (const g of Object.keys(grouped)) {
    grouped[g].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return (
    <>
      {/* Backdrop (click to close) — only when visible */}
      {visible && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      {/* Slide-out panel — full left-0, above sidebar, pointer-events none when hidden */}
      <div
        className={`fixed top-0 left-0 h-full w-72 bg-[#12121c] border-r border-[#383850] z-50 flex flex-col transition-transform duration-200 ${
          visible ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'
        }`}
        style={{ boxShadow: visible ? '4px 0 20px rgba(0,0,0,0.5)' : 'none' }}
      >
        {/* Header */}
        <div className="px-3 py-3 border-b border-[#383850] flex items-center justify-between">
          <div className="flex items-center gap-0">
            <Folder size={16} className="text-[#6ec6e7]" />
            <h2 className="font-pixel text-[10px] text-[#6ec6e7] ml-1">SESSJE</h2>
          </div>
          <div className="flex items-center gap-0">
            <button
              onClick={handleNew}
              className="w-6 h-6 flex items-center justify-center bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4] hover:bg-[#00f5d4]/20"
              title="Nowa sesja"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center text-[#8888aa] hover:text-[#e8e8f5]"
              title="Zamknij"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MessageSquare size={32} className="text-[#2a2a3a] mx-auto mb-2" />
              <div className="text-xs text-[#8888aa] font-mono">Brak sesji</div>
              <div className="text-[10px] text-[#5a5a78] font-mono mt-1">
                Kliknij + aby rozpocząć nową rozmowę
              </div>
            </div>
          ) : (
            GROUP_ORDER.map(groupKey => {
              const items = grouped[groupKey];
              if (!items || items.length === 0) return null;
              return (
                <div key={groupKey} className="border-b border-[#1a1a2a]">
                  <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-[#8888aa] flex items-center gap-1">
                    <Clock size={9} />
                    {GROUP_LABELS[groupKey]} ({items.length})
                  </div>
                  {items.map(s => (
                    <div
                      key={s.id}
                      className={`group relative px-3 py-2 cursor-pointer transition-all border-l-2 ${
                        activeSessionId === s.id
                          ? 'bg-[#00f5d4]/10 border-l-[#00f5d4]'
                          : 'border-l-transparent hover:bg-[#1a1a28]'
                      }`}
                      onClick={() => onSelectSession(s.id)}
                    >
                      <div className="text-xs text-[#e8e8f5] font-mono truncate pr-5">
                        {s.title}
                      </div>
                      <div className="text-[9px] text-[#8888aa] font-mono mt-0.5">
                        {new Date(s.updatedAt).toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        {s.messageCount > 0 && ` · ${s.messageCount} wiadomości`}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                        className="absolute top-1/2 right-1.5 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-[#5a5a78] hover:text-[#ff6b6b] opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Usuń sesję"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-[#383850] text-[9px] text-[#5a5a78] font-mono">
          {sessions.length} sesji · zapisywane lokalnie
        </div>
      </div>
    </>
  );
}
