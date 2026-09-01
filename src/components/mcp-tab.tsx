'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Server, Play, Trash2, Plus, Terminal, Settings, RefreshCw,
  Video, FileText, Cpu, Activity, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, Sparkles, Send, Loader2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// BOKA — MCP & CLI Tab (v0.3.16)
// Connect to external MCP servers  + CLI bridge
// ═══════════════════════════════════════════════════════════

interface McpServer {
  id: string;
  name: string;
  description: string | null;
  serverType: 'stdio' | 'sse' | 'http' | 'builtin';
  builtinKey: string | null;
  command: string | null;
  args: string | null;
  url: string | null;
  isActive: boolean;
  toolsJson: string | null;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface McpInvocation {
  id: string;
  serverId: string;
  toolName: string;
  argumentsJson: string;
  resultJson: string | null;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
  server?: { name: string; builtinKey: string | null };
}

interface CliSession {
  id: string;
  name: string | null;
  shell: string;
  createdAt: string;
  _count?: { commands: number };
}

interface CliCommand {
  id: string;
  command: string;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  durationMs: number | null;
  aiInterpretation: string | null;
  createdAt: string;
}

const BUILTIN_ICONS: Record<string, React.ReactNode> = {
  'boka-tools': <Sparkles size={14} />,
  filesystem: <FileText size={14} />,
};

const BUILTIN_COLORS: Record<string, string> = {
  'boka-tools': '#6ec6e7',
  filesystem: '#6ee77c',
};

type Tab = 'servers' | 'tools' | 'cli' | 'history';

export function McpTab() {
  const [tab, setTab] = useState<Tab>('servers');
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/mcp/servers');
      const data = await res.json();
      setServers(data.servers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="flex h-full w-full bg-[#12121c] text-[#e8e8f5]">
      {/* ── LEFT NAV ── */}
      <aside className="w-44 border-r border-[#383850] bg-[#181828] flex flex-col">
        <div className="px-3 py-3 border-b border-[#383850]">
          <h2 className="text-xs font-mono tracking-wider" style={{ color: '#6ec6e7' }}>MCP & CLI</h2>
          <p className="text-[9px] text-[#8888aa] mt-1 font-mono">v0.3.16</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {([
            ['servers', 'Serwery', <Server size={12} key="s" />],
            ['tools', 'Narzędzia', <Cpu size={12} key="t" />],
            ['cli', 'Terminal', <Terminal size={12} key="c" />],
            ['history', 'Historia', <Activity size={12} key="h" />],
          ] as const).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`w-full flex items-center gap-0 px-2 py-1.5  text-[11px] font-mono transition-colors ${
                tab === key
                  ? 'bg-[#6ec6e7]/10 text-[#6ec6e7] border border-[#6ec6e7]/30'
                  : 'text-[#8888aa] hover:text-[#e8e8f5] hover:bg-[#252535]'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>
        <div className="p-2 border-t border-[#383850]">
          <button
            onClick={reload}
            className="w-full flex items-center justify-center gap-1 px-2 py-1.5  text-[10px] font-mono text-[#8888aa] hover:text-[#e8e8f5] hover:bg-[#252535] transition-colors"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            Odśwież
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {error && (
          <div className="m-3 p-2  bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[#ff6b6b] text-[11px] font-mono flex items-center gap-0">
            <AlertCircle size={12} />
            {error}
          </div>
        )}
        {tab === 'servers' && <ServersPanel servers={servers} onChange={reload} />}
        {tab === 'tools' && <ToolsPanel servers={servers} />}
        {tab === 'cli' && <CliPanel />}
        {tab === 'history' && <HistoryPanel />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PANEL: SERVERS — list, add, delete MCP servers
// ═══════════════════════════════════════════════════════════

function ServersPanel({ servers, onChange }: { servers: McpServer[]; onChange: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono text-[#6ec6e7]">Serwery MCP</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 px-3 py-1.5  bg-[#6ec6e7]/10 border border-[#6ec6e7]/30 text-[#6ec6e7] text-[11px] font-mono hover:bg-[#6ec6e7]/20 transition-colors"
        >
          <Plus size={12} />
          Dodaj serwer
        </button>
      </div>

      {showAdd && <AddServerForm onDone={() => { setShowAdd(false); onChange(); }} />}

      <div className="space-y-2">
        {servers.map((s) => {
          const isOpen = expanded === s.id;
          const color = s.builtinKey ? BUILTIN_COLORS[s.builtinKey] || '#6b6b8d' : '#6b6b8d';
          const tools: McpTool[] = s.toolsJson ? JSON.parse(s.toolsJson) : [];
          return (
            <div key={s.id} className=" border border-[#383850] bg-[#181828]">
              <button
                onClick={() => setExpanded(isOpen ? null : s.id)}
                className="w-full flex items-center gap-0 px-3 py-2.5 text-left hover:bg-[#252535] transition-colors"
              >
                <div className="shrink-0" style={{ color }}>
                  {s.builtinKey ? BUILTIN_ICONS[s.builtinKey] : <Server size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-0">
                    <span className="text-[12px] font-mono text-[#e8e8f5]">{s.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5  bg-[#252535] text-[#8888aa] font-mono">
                      {s.serverType}
                    </span>
                    {s.isActive ? (
                      <CheckCircle2 size={10} className="text-[#4ade80]" />
                    ) : (
                      <AlertCircle size={10} className="text-[#8888aa]" />
                    )}
                  </div>
                  {s.description && (
                    <div className="text-[10px] text-[#8888aa] font-mono truncate">{s.description}</div>
                  )}
                </div>
                <div className="text-[9px] text-[#8888aa] font-mono shrink-0">
                  {tools.length} tools
                </div>
                {isOpen ? <ChevronDown size={12} className="text-[#8888aa]" /> : <ChevronRight size={12} className="text-[#8888aa]" />}
              </button>
              {isOpen && (
                <div className="border-t border-[#383850] p-2 space-y-2 bg-[#12121c]">
                  {s.builtinKey && (
                    <div className="text-[10px] text-[#8888aa] font-mono">
                      Built-in: <span style={{ color }}>{s.builtinKey}</span>
                    </div>
                  )}
                  {s.url && (
                    <div className="text-[10px] text-[#8888aa] font-mono break-all">
                      URL: <span className="text-[#e8e8f5]">{s.url}</span>
                    </div>
                  )}
                  {s.command && (
                    <div className="text-[10px] text-[#8888aa] font-mono">
                      Command: <span className="text-[#e8e8f5]">{s.command} {s.args || ''}</span>
                    </div>
                  )}
                  {tools.length > 0 && (
                    <div className="space-y-1 mt-2">
                      <div className="text-[10px] text-[#8888aa] font-mono">Tools:</div>
                      {tools.map((t) => (
                        <div key={t.name} className="text-[10px] text-[#e8e8f5] font-mono pl-3">
                          • <span style={{ color }}>{t.name}</span> — {t.description.slice(0, 80)}
                        </div>
                      ))}
                    </div>
                  )}
                  {!s.builtinKey && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Usunąć serwer "${s.name}"?`)) return;
                        await fetch(`/api/mcp/servers?id=${s.id}`, { method: 'DELETE' });
                        onChange();
                      }}
                      className="mt-2 flex items-center gap-1 px-2 py-1  text-[10px] font-mono text-[#ff6b6b] hover:bg-[#ff6b6b]/10 transition-colors"
                    >
                      <Trash2 size={10} />
                      Usuń
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {servers.length === 0 && (
          <div className="text-center py-12 text-[#8888aa] text-[11px] font-mono">
            Brak serwerów. Kliknij "Dodaj serwer" aby zacząć.
          </div>
        )}
      </div>
    </div>
  );
}

function AddServerForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [serverType, setServerType] = useState<'stdio' | 'http' | 'sse'>('http');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [envJson, setEnvJson] = useState('');
  const [headersJson, setHeadersJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        serverType,
      };
      if (serverType === 'stdio') {
        body.command = command.trim();
        if (args.trim()) body.args = JSON.parse(args);
        if (envJson.trim()) body.env = JSON.parse(envJson);
      } else {
        body.url = url.trim();
        if (headersJson.trim()) body.headers = JSON.parse(headersJson);
      }
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className=" border border-[#6ec6e7]/30 bg-[#181828] p-2 space-y-2">
      <div className="text-[11px] font-mono text-[#6ec6e7]">Nowy serwer MCP</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nazwa (np. My Custom MCP)"
        className="w-full bg-[#252535] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] font-mono"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Opis (opcjonalnie)"
        className="w-full bg-[#252535] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] font-mono"
      />
      <div className="flex gap-0">
        {(['http', 'sse', 'stdio'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setServerType(t)}
            className={`px-2 py-1  text-[10px] font-mono ${
              serverType === t ? 'bg-[#6ec6e7]/10 text-[#6ec6e7] border border-[#6ec6e7]/30' : 'text-[#8888aa] border border-[#383850]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {serverType === 'stdio' ? (
        <>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Command (np. npx, python, node)"
            className="w-full bg-[#252535] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] font-mono"
          />
          <input
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder='Args JSON (np. ["-y", "@modelcontextprotocol/server-filesystem"])'
            className="w-full bg-[#252535] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] font-mono"
          />
          <input
            value={envJson}
            onChange={(e) => setEnvJson(e.target.value)}
            placeholder='Env JSON (np. {"API_KEY":"..."})'
            className="w-full bg-[#252535] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] font-mono"
          />
        </>
      ) : (
        <>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="URL serwera (np. http://localhost:3001/mcp)"
            className="w-full bg-[#252535] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] font-mono"
          />
          <input
            value={headersJson}
            onChange={(e) => setHeadersJson(e.target.value)}
            placeholder='Headers JSON (np. {"Authorization":"Bearer ..."})'
            className="w-full bg-[#252535] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] font-mono"
          />
        </>
      )}
      {err && <div className="text-[10px] text-[#ff6b6b] font-mono">{err}</div>}
      <div className="flex gap-0">
        <button
          onClick={submit}
          disabled={saving || !name.trim()}
          className="flex items-center gap-1 px-3 py-1.5  bg-[#6ec6e7]/20 text-[#6ec6e7] text-[11px] font-mono hover:bg-[#6ec6e7]/30 disabled:opacity-30 transition-colors"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Zapisz
        </button>
        <button
          onClick={onDone}
          className="px-3 py-1.5  text-[#8888aa] text-[11px] font-mono hover:text-[#e8e8f5] transition-colors"
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PANEL: TOOLS — list all tools, test them
// ═══════════════════════════════════════════════════════════

function ToolsPanel({ servers }: { servers: McpServer[] }) {
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  // Auto-select first server with tools
  useEffect(() => {
    if (!activeServerId && servers.length > 0) {
      const firstWithTools = servers.find((s) => s.toolsJson && JSON.parse(s.toolsJson!).length > 0);
      if (firstWithTools) setActiveServerId(firstWithTools.id);
    }
  }, [servers, activeServerId]);

  const activeServer = servers.find((s) => s.id === activeServerId);
  const tools: McpTool[] = activeServer?.toolsJson ? JSON.parse(activeServer.toolsJson) : [];

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Server picker */}
      <aside className="w-48 border-r border-[#383850] bg-[#181828] overflow-y-auto">
        <div className="px-3 py-2 border-b border-[#383850] text-[10px] font-mono text-[#8888aa]">
          Wybierz serwer
        </div>
        {servers.map((s) => {
          const color = s.builtinKey ? BUILTIN_COLORS[s.builtinKey] || '#6b6b8d' : '#6b6b8d';
          const toolCount = s.toolsJson ? JSON.parse(s.toolsJson).length : 0;
          return (
            <button
              key={s.id}
              onClick={() => setActiveServerId(s.id)}
              className={`w-full flex items-center gap-0 px-3 py-2 text-left hover:bg-[#252535] transition-colors ${
                activeServerId === s.id ? 'bg-[#252535]' : ''
              }`}
            >
              <span style={{ color }}>{s.builtinKey ? BUILTIN_ICONS[s.builtinKey] : <Server size={12} />}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-mono text-[#e8e8f5] truncate">{s.name}</div>
                <div className="text-[9px] text-[#8888aa] font-mono">{toolCount} tools</div>
              </div>
            </button>
          );
        })}
      </aside>

      {/* Tools list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {!activeServer ? (
          <div className="text-center py-12 text-[#8888aa] text-[11px] font-mono">
            Wybierz serwer z listy
          </div>
        ) : tools.length === 0 ? (
          <div className="text-center py-12 text-[#8888aa] text-[11px] font-mono">
            Ten serwer nie oferuje narzędzi (lub jest niedostępny)
          </div>
        ) : (
          tools.map((t) => (
            <ToolCard key={t.name} server={activeServer} tool={t} />
          ))
        )}
      </div>
    </div>
  );
}

function ToolCard({ server, tool }: { server: McpServer; tool: McpTool }) {
  const [expanded, setExpanded] = useState(false);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; result?: unknown; error?: string; durationMs?: number } | null>(null);

  const props = (tool.inputSchema.properties || {}) as Record<string, { type?: string; description?: string }>;
  const required = tool.inputSchema.required || [];
  const color = server.builtinKey ? BUILTIN_COLORS[server.builtinKey] || '#6b6b8d' : '#6b6b8d';

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      // Convert string args to typed
      const typedArgs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v === '') continue;
        const prop = props[k];
        if (prop?.type === 'number') typedArgs[k] = Number(v);
        else if (prop?.type === 'array') {
          try { typedArgs[k] = JSON.parse(v); } catch { typedArgs[k] = v.split(',').map(s => s.trim()); }
        } else {
          // Try parse as JSON, fallback to string
          try { typedArgs[k] = JSON.parse(v); } catch { typedArgs[k] = v; }
        }
      }
      const res = await fetch('/api/mcp/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: server.id, toolName: tool.name, arguments: typedArgs, triggeredBy: 'mcp-tab' }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className=" border border-[#383850] bg-[#181828]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-0 px-3 py-2.5 text-left hover:bg-[#252535] transition-colors"
      >
        <Play size={12} className="shrink-0 mt-0.5" style={{ color }} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-mono" style={{ color }}>{tool.name}</div>
          <div className="text-[10px] text-[#8888aa] font-mono mt-0.5">{tool.description}</div>
        </div>
        {expanded ? <ChevronDown size={12} className="text-[#8888aa] mt-1" /> : <ChevronRight size={12} className="text-[#8888aa] mt-1" />}
      </button>
      {expanded && (
        <div className="border-t border-[#383850] p-2 space-y-2 bg-[#12121c]">
          {Object.keys(props).length === 0 ? (
            <div className="text-[10px] text-[#8888aa] font-mono">Brak argumentów</div>
          ) : (
            Object.entries(props).map(([k, v]) => (
              <div key={k}>
                <label className="text-[10px] font-mono text-[#8888aa] block mb-1">
                  {k} {required.includes(k) && <span className="text-[#ff6b6b]">*</span>}
                  <span className="text-[#5a5a78]"> ({v.type || 'any'})</span>
                </label>
                {v.description && (
                  <div className="text-[9px] text-[#5a5a78] font-mono mb-1">{v.description}</div>
                )}
                <input
                  value={args[k] || ''}
                  onChange={(e) => setArgs({ ...args, [k]: e.target.value })}
                  placeholder={k}
                  className="w-full bg-[#252535] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] font-mono"
                />
              </div>
            ))
          )}
          <button
            onClick={run}
            disabled={running}
            className="flex items-center gap-1 px-3 py-1.5  bg-[#6ec6e7]/20 text-[#6ec6e7] text-[11px] font-mono hover:bg-[#6ec6e7]/30 disabled:opacity-30 transition-colors"
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Wykonaj
          </button>
          {result && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-0 text-[10px] font-mono">
                {result.ok ? (
                  <CheckCircle2 size={10} className="text-[#4ade80]" />
                ) : (
                  <AlertCircle size={10} className="text-[#ff6b6b]" />
                )}
                <span className={result.ok ? 'text-[#4ade80]' : 'text-[#ff6b6b]'}>
                  {result.ok ? 'OK' : 'BŁĄD'} {result.durationMs ? `(${result.durationMs}ms)` : ''}
                </span>
              </div>
              <pre className="text-[10px] font-mono text-[#e8e8f5] bg-[#252535] p-2  overflow-x-auto max-h-64 overflow-y-auto">
                {result.error ? result.error : JSON.stringify(result.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PANEL: CLI — terminal
// ═══════════════════════════════════════════════════════════

function CliPanel() {
  const [commands, setCommands] = useState<CliCommand[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [interpret, setInterpret] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll on new commands
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [commands]);

  const exec = async () => {
    if (!input.trim() || running) return;
    const cmd = input.trim();
    setInput('');
    setRunning(true);
    try {
      const res = await fetch('/api/mcp/cli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, interpret, sessionId }),
      });
      const data = await res.json();
      if (data.sessionId && !sessionId) setSessionId(data.sessionId);
      setCommands((prev) => [
        ...prev,
        {
          id: data.commandId || `cmd-${Date.now()}`,
          command: cmd,
          exitCode: data.exitCode,
          stdout: data.stdout,
          stderr: data.stderr,
          durationMs: data.durationMs,
          aiInterpretation: data.aiInterpretation || null,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setCommands((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          command: cmd,
          exitCode: -1,
          stdout: '',
          stderr: e instanceof Error ? e.message : String(e),
          durationMs: 0,
          aiInterpretation: null,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#12121c]">
      <div className="px-3 py-2 border-b border-[#383850] flex items-center justify-between">
        <div className="text-[11px] font-mono text-[#6ec6e7] flex items-center gap-0">
          <Terminal size={12} />
          Terminal BOKA
        </div>
        <label className="flex items-center gap-1 text-[10px] font-mono text-[#8888aa] cursor-pointer">
          <input
            type="checkbox"
            checked={interpret}
            onChange={(e) => setInterpret(e.target.checked)}
            className="accent-[#a855f7]"
          />
          Interpretacja AI
        </label>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-2">
        {commands.length === 0 && (
          <div className="text-[#5a5a78]">
            $ BOKA CLI — wykonuj komendy shell. Pamięć sesji: /home/z/boka-memory/sandbox/
            <br />
            $ Przykłady: ls, pwd, echo hello, cat file.txt, whoami, date
          </div>
        )}
        {commands.map((c) => (
          <div key={c.id}>
            <div className="text-[#6ec6e7]">$ {c.command}</div>
            {c.stdout && (
              <pre className="text-[#e8e8f5] whitespace-pre-wrap mt-1">{c.stdout}</pre>
            )}
            {c.stderr && (
              <pre className="text-[#ff6b6b] whitespace-pre-wrap mt-1">{c.stderr}</pre>
            )}
            <div className="text-[#5a5a78] text-[9px] mt-1">
              exit {c.exitCode} · {c.durationMs}ms
            </div>
            {c.aiInterpretation && (
              <div className="mt-2 p-2  bg-[#a855f7]/5 border border-[#a855f7]/20">
                <div className="text-[9px] text-[#a855f7] font-mono mb-1 flex items-center gap-1">
                  <Sparkles size={9} /> BOKA interpretuje:
                </div>
                <div className="text-[10px] text-[#e8e8f5] whitespace-pre-wrap">{c.aiInterpretation}</div>
              </div>
            )}
          </div>
        ))}
        {running && (
          <div className="text-[#6ec6e7] flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" />
            wykonywanie...
          </div>
        )}
      </div>

      <div className="border-t border-[#383850] p-2 flex items-center gap-0">
        <span className="text-[#6ec6e7] font-mono text-[11px]">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') exec(); }}
          placeholder="Wpisz komendę..."
          className="flex-1 bg-transparent text-[#e8e8f5] text-[11px] font-mono focus:outline-none"
          disabled={running}
        />
        <button
          onClick={exec}
          disabled={running || !input.trim()}
          className="p-1.5  bg-[#6ec6e7]/20 text-[#6ec6e7] disabled:opacity-30 hover:bg-[#6ec6e7]/30 transition-colors"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PANEL: HISTORY — recent MCP invocations
// ═══════════════════════════════════════════════════════════

function HistoryPanel() {
  const [invocations, setInvocations] = useState<McpInvocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/mcp/invocations?limit=100')
      .then((r) => r.json())
      .then((d) => setInvocations(d.invocations || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[#8888aa] text-[11px] font-mono">Ładowanie...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      <h3 className="text-sm font-mono text-[#6ec6e7] mb-2">Historia wywołań</h3>
      {invocations.length === 0 ? (
        <div className="text-center py-12 text-[#8888aa] text-[11px] font-mono">
          Brak wywołań. Przejdź do "Narzędzia" aby wywołać tool.
        </div>
      ) : (
        invocations.map((inv) => {
          const isOpen = expanded === inv.id;
          const color = inv.server?.builtinKey ? BUILTIN_COLORS[inv.server.builtinKey] || '#6b6b8d' : '#6b6b8d';
          return (
            <div key={inv.id} className=" border border-[#383850] bg-[#181828]">
              <button
                onClick={() => setExpanded(isOpen ? null : inv.id)}
                className="w-full flex items-center gap-0 px-3 py-2 text-left hover:bg-[#252535] transition-colors"
              >
                {inv.error ? (
                  <AlertCircle size={12} className="text-[#ff6b6b] shrink-0" />
                ) : (
                  <CheckCircle2 size={12} className="text-[#4ade80] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono">
                    <span style={{ color }}>{inv.server?.name || 'unknown'}</span>
                    {' → '}
                    <span className="text-[#e8e8f5]">{inv.toolName}</span>
                  </div>
                  <div className="text-[9px] text-[#8888aa] font-mono">
                    {new Date(inv.createdAt).toLocaleString('pl-PL')} · {inv.durationMs}ms
                  </div>
                </div>
                {isOpen ? <ChevronDown size={12} className="text-[#8888aa]" /> : <ChevronRight size={12} className="text-[#8888aa]" />}
              </button>
              {isOpen && (
                <div className="border-t border-[#383850] p-2 space-y-2 bg-[#12121c]">
                  <div>
                    <div className="text-[9px] text-[#8888aa] font-mono mb-1">ARGUMENTS:</div>
                    <pre className="text-[10px] font-mono text-[#e8e8f5] bg-[#252535] p-2  overflow-x-auto">
                      {inv.argumentsJson}
                    </pre>
                  </div>
                  {inv.error ? (
                    <div>
                      <div className="text-[9px] text-[#ff6b6b] font-mono mb-1">ERROR:</div>
                      <pre className="text-[10px] font-mono text-[#ff6b6b] bg-[#252535] p-2  overflow-x-auto">
                        {inv.error}
                      </pre>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[9px] text-[#4ade80] font-mono mb-1">RESULT:</div>
                      <pre className="text-[10px] font-mono text-[#e8e8f5] bg-[#252535] p-2  overflow-x-auto max-h-64 overflow-y-auto">
                        {inv.resultJson}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
