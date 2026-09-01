'use client';

// ═══════════════════════════════════════════════════════════
// BOKA — Privacy Tab (v0.3.17)
// Audit Log + Forget API + Consent Dashboard
// "Dlaczego to zrobiłam?" — pełna historia decyzji BOKI.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { Shield, Trash2, Eye, Clock, AlertTriangle, CheckCircle, XCircle, Activity, Lock } from 'lucide-react';

const FAMILY_ID = 'boka-family'; // TODO: replace with dynamic family ID

interface AuditEntry {
  id: string;
  agentId: string | null;
  action: string;
  category: string;
  reasoning: string;
  inputSummary: string | null;
  outputSummary: string | null;
  riskLevel: string;
  createdAt: string;
  forgottenAt: string | null;
}

interface ForgetRequest {
  id: string;
  scope: string;
  query: string | null;
  topic: string | null;
  status: string;
  affectedCount: number;
  requestedAt: string;
  hardDeleteAt: string | null;
  softDeletedAt: string | null;
}

interface ConsentRecord {
  memberId: string;
  voiceEnabled: boolean;
  visionEnabled: boolean;
  memoryEnabled: boolean;
  haControlEnabled: boolean;
  proactiveEnabled: boolean;
  restrictedTopics: string;
}

interface Stats {
  stats: {
    total: number;
    forgotten: number;
    byCategory: Record<string, number>;
    byRisk: Record<string, number>;
    days: number;
  };
  forgetRequests: ForgetRequest[];
}

const CATEGORY_LABELS: Record<string, string> = {
  memory: 'Pamięć',
  tool_use: 'Narzędzia',
  vision: 'Wizja',
  home_automation: 'Dom',
  proactivity: 'Proaktywność',
  guardrail: 'Bezpieczeństwo',
  privacy: 'Prywatność',
  communication: 'Komunikacja',
};

const RISK_COLORS: Record<string, string> = {
  info: 'text-cyan-300',
  low: 'text-green-300',
  medium: 'text-yellow-300',
  high: 'text-orange-300',
  critical: 'text-red-300',
};

export function PrivacyTab() {
  const [section, setSection] = useState<'audit' | 'forget' | 'consent'>('audit');
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [forgetRequests, setForgetRequests] = useState<ForgetRequest[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ category: '', risk: '' });
  const [forgetQuery, setForgetQuery] = useState('');
  const [forgetScope, setForgetScope] = useState('topic');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ familyId: FAMILY_ID, limit: '100' });
      if (filter.category) params.set('category', filter.category);
      if (filter.risk) params.set('riskLevel', filter.risk);
      const r = await fetch(`/api/audit?${params}`);
      const data = await r.json();
      setAudit(data.entries ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch(`/api/audit/stats?familyId=${FAMILY_ID}&days=30`);
      const data = await r.json();
      setStats(data);
      setForgetRequests(data.forgetRequests ?? []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadConsents = useCallback(async () => {
    try {
      const r = await fetch(`/api/consent?familyId=${FAMILY_ID}`);
      const data = await r.json();
      setConsents(data.records ?? []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadAudit();
    loadStats();
  }, [loadAudit, loadStats]);

  useEffect(() => {
    if (section === 'consent') loadConsents();
  }, [section, loadConsents]);

  async function submitForget() {
    if (!forgetQuery.trim()) return;
    setLoading(true);
    try {
      const r = await fetch('/api/memory/forget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyId: FAMILY_ID,
          scope: forgetScope,
          query: forgetQuery,
          triggeredBy: 'gui',
        }),
      });
      const data = await r.json();
      if (data.ok) {
 setMessage(` Zapomniano ${data.affectedCount} elementów. Trwałe usunięcie: ${data.hardDeleteAt?.slice(0, 10)}.`);
        setForgetQuery('');
        loadStats();
      } else {
 setMessage(` ${data.error}`);
      }
    } catch (e: any) {
 setMessage(` ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function cancelForget(id: string) {
    if (!confirm('Cofnąć prośbę o zapomnienie? Wspomnienia zostaną przywrócone.')) return;
    try {
      const r = await fetch(`/api/memory/forget?id=${id}&familyId=${FAMILY_ID}`, { method: 'DELETE' });
      const data = await r.json();
      if (data.ok) {
 setMessage(' Wspomnienia przywrócone.');
        loadStats();
      }
    } catch (e: any) {
 setMessage(` ${e.message}`);
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#181828] text-gray-200">
      {/* Header */}
      <header className="px-6 py-4 border-b border-white/5 flex items-center gap-0">
        <Shield size={22} className="text-[#6ec6e7]" />
        <h1 className="text-lg font-semibold">Prywatność & Decyzje</h1>
        <span className="text-xs text-gray-500 ml-2">v0.3.17</span>
      </header>

      {/* Section tabs */}
      <nav className="flex gap-1 px-6 py-3 border-b border-white/5">
        {[
          { id: 'audit', label: 'Dziennik decyzji', icon: Activity },
          { id: 'forget', label: 'Zapomnij', icon: Trash2 },
          { id: 'consent', label: 'Zgody domowników', icon: Lock },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id as any)}
            className={`flex items-center gap-0 px-3 py-1.5 text-xs  transition-colors ${
              section === tab.id ? 'bg-[#6ec6e7]/20 text-[#6ec6e7]' : 'text-gray-400 hover:bg-white/5'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Stats banner */}
      {stats?.stats && (
        <div className="px-6 py-3 grid grid-cols-4 gap-0 text-xs border-b border-white/5">
          <Stat label="Decyzje (30d)" value={stats.stats.total} icon={Activity} color="#6ec6e7" />
          <Stat label="Zapomniane" value={stats.stats.forgotten} icon={Trash2} color="#a855f7" />
          <Stat label="Kategorie" value={Object.keys(stats.stats.byCategory).length} icon={Eye} color="#6ee7b2" />
          <Stat label="Wysokie ryzyko" value={stats.stats.byRisk.high ?? 0 + (stats.stats.byRisk.critical ?? 0)} icon={AlertTriangle} color="#e7d76e" />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {message && (
          <div className="mb-2 p-2  bg-[#6ec6e7]/10 text-[#6ec6e7] text-xs">{message}</div>
        )}

        {section === 'audit' && (
          <div>
            {/* Filters */}
            <div className="flex gap-0 mb-2">
              <select
                value={filter.category}
                onChange={(e) => setFilter({ ...filter, category: e.target.value })}
                className="bg-black/40 text-xs px-2 py-1  border border-white/10"
              >
                <option value="">Wszystkie kategorie</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select
                value={filter.risk}
                onChange={(e) => setFilter({ ...filter, risk: e.target.value })}
                className="bg-black/40 text-xs px-2 py-1  border border-white/10"
              >
                <option value="">Wszystkie ryzyka</option>
                <option value="info">Info</option>
                <option value="low">Niskie</option>
                <option value="medium">Średnie</option>
                <option value="high">Wysokie</option>
                <option value="critical">Krytyczne</option>
              </select>
              <button
                onClick={loadAudit}
                className="ml-auto px-3 py-1 text-xs bg-white/5 hover:bg-white/10 rounded"
              >
                Odśwież
              </button>
            </div>

            {/* Audit entries */}
            <div className="space-y-2">
              {audit.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-500 text-sm">
                  Brak decyzji. BOKA jeszcze nie podjęła żadnej w tym okresie.
                </div>
              )}
              {audit.map((entry) => (
                <div
                  key={entry.id}
                  className={`p-2  border border-white/5 bg-black/30 hover:bg-black/40 transition-colors ${
                    entry.forgottenAt ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-start gap-0">
                    <div className={`text-xs font-mono ${RISK_COLORS[entry.riskLevel] ?? 'text-gray-400'}`}>
                      ●
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-0 text-xs">
                        <span className="text-[#6ec6e7] font-medium">{entry.action}</span>
                        <span className="text-gray-500">·</span>
                        <span className="text-gray-400">{CATEGORY_LABELS[entry.category] ?? entry.category}</span>
                        <span className="text-gray-500">·</span>
                        <span className="text-gray-500">{entry.agentId ?? 'boka'}</span>
                        {entry.forgottenAt && (
                          <span className="text-purple-300 text-[10px]">[zapomniane]</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-300 mt-1">{entry.reasoning}</p>
                      {entry.inputSummary && (
                        <p className="text-[10px] text-gray-500 mt-1">Wejście: {entry.inputSummary}</p>
                      )}
                      {expandedId === entry.id && entry.outputSummary && (
                        <p className="text-[10px] text-gray-500 mt-1">Wynik: {entry.outputSummary}</p>
                      )}
                      <div className="flex items-center gap-0 mt-1 text-[10px] text-gray-500">
                        <span>{new Date(entry.createdAt).toLocaleString('pl-PL')}</span>
                        <button
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          className="text-[#6ec6e7] hover:underline"
                        >
                          {expandedId === entry.id ? 'Mniej' : 'Więcej'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {section === 'forget' && (
          <div>
            <div className="mb-6 p-4  bg-purple-500/10 border border-purple-500/20">
              <h3 className="text-sm font-semibold text-purple-300 mb-2">Zapomnij o czymś</h3>
              <p className="text-xs text-gray-400 mb-2">
                Powiedz BOKA, czego ma zapomnieć. Soft delete nastąpi natychmiast, trwałe usunięcie za 30 dni.
                W tym czasie możesz cofnąć.
              </p>
              <div className="flex gap-0 mb-2">
                <select
                  value={forgetScope}
                  onChange={(e) => setForgetScope(e.target.value)}
                  className="bg-black/40 text-xs px-2 py-2  border border-white/10"
                >
                  <option value="topic">Temat (np. &quot;rozmowa o Ani&quot;)</option>
                  <option value="all">Wszystko (cały czat)</option>
                  <option value="conversation">Konkretna rozmowa</option>
                  <option value="entity">Encja (osoba/miejsce)</option>
                  <option value="time_range">Zakres czasu</option>
                </select>
                <input
                  value={forgetQuery}
                  onChange={(e) => setForgetQuery(e.target.value)}
                  placeholder='np. "rozmowa o Ani" albo "wczoraj wieczorem"'
                  className="flex-1 bg-black/40 text-xs px-3 py-2  border border-white/10"
                  onKeyDown={(e) => e.key === 'Enter' && submitForget()}
                />
                <button
                  onClick={submitForget}
                  disabled={loading || !forgetQuery.trim()}
                  className="px-4 py-2 text-xs bg-purple-500/30 hover:bg-purple-500/50 text-purple-200  disabled:opacity-50"
                >
                  Zapomnij
                </button>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-gray-300 mb-2">Historia próśb o zapomnienie</h3>
            <div className="space-y-2">
              {forgetRequests.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  Brak próśb o zapomnienie.
                </div>
              )}
              {forgetRequests.map((req) => (
                <div key={req.id} className="p-2  border border-white/5 bg-black/30">
                  <div className="flex items-center gap-0 mb-1">
                    <StatusBadge status={req.status} />
                    <span className="text-xs text-gray-300">{req.scope}</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-xs text-gray-400">{req.query ?? req.topic}</span>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {req.affectedCount} elementów · zaplanowano: {new Date(req.requestedAt).toLocaleDateString('pl-PL')} ·
                    {' '}hard delete: {req.hardDeleteAt ? new Date(req.hardDeleteAt).toLocaleDateString('pl-PL') : '—'}
                  </div>
                  {req.status === 'soft_deleted' && (
                    <button
                      onClick={() => cancelForget(req.id)}
                      className="mt-2 text-xs text-purple-300 hover:underline"
                    >
                      Cofnij (przywróć wspomnienia)
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {section === 'consent' && (
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Zgody domowników</h3>
            <p className="text-xs text-gray-500 mb-2">
              Każdy członek rodziny może kontrolować, jakie dane BOKA może przetwarzać o nim.
            </p>
            <div className="space-y-2">
              {consents.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  Brak ustawionych zgód. Domyślne: voice=ON, vision=OFF, memory=ON, HA=OFF, proactive=ON.
                </div>
              )}
              {consents.map((c) => (
                <ConsentCard key={c.memberId} consent={c} onUpdate={loadConsents} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="flex items-center gap-0">
      <Icon size={14} style={{ color }} />
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
        <div className="text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: 'Oczekuje', color: 'text-yellow-300', icon: Clock },
    soft_deleted: { label: 'Zapomniane', color: 'text-purple-300', icon: Trash2 },
    hard_deleted: { label: 'Trwale usunięte', color: 'text-red-300', icon: XCircle },
    cancelled: { label: 'Cofnięte', color: 'text-green-300', icon: CheckCircle },
  };
  const s = map[status] ?? map.pending;
  const Icon = s.icon;
  return (
    <span className={`flex items-center gap-1 text-xs ${s.color}`}>
      <Icon size={11} />
      {s.label}
    </span>
  );
}

function ConsentCard({ consent, onUpdate }: { consent: ConsentRecord; onUpdate: () => void }) {
  const [updating, setUpdating] = useState(false);

  async function toggle(field: keyof ConsentRecord) {
    setUpdating(true);
    try {
      await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyId: FAMILY_ID,
          memberId: consent.memberId,
          [field]: !consent[field],
        }),
      });
      onUpdate();
    } finally {
      setUpdating(false);
    }
  }

  const fields: Array<{ key: keyof ConsentRecord; label: string }> = [
    { key: 'voiceEnabled', label: 'Voice / ASR' },
    { key: 'visionEnabled', label: 'Vision / Kamera' },
    { key: 'memoryEnabled', label: 'Pamięć' },
    { key: 'haControlEnabled', label: 'Sterowanie domem' },
    { key: 'proactiveEnabled', label: 'Proaktywność' },
  ];

  return (
    <div className="p-2  border border-white/5 bg-black/30">
      <div className="text-sm font-medium text-gray-200 mb-2">{consent.memberId}</div>
      <div className="grid grid-cols-5 gap-0">
        {fields.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            disabled={updating}
            className={`p-2  text-xs text-center transition-colors ${
              consent[key] ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
            }`}
          >
            {label}
            <div className="text-[10px] mt-1">{consent[key] ? 'ON' : 'OFF'}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
