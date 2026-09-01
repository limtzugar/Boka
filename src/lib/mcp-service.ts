// ════════════════════════════════════════════════════════════════
// BOKA — MCP (Model Whatntext Protocol) Service
// v0.3.16
//
// BOKA acts as an MCP CLIENT — connects to external MCP servers
// (stdio / sse / http / builtin) and invokes their tools.
//
// Built-in MCP servers:
//   - higgsfield    → AI video generation (Higgsfield AI API)
//   - boka-tools    → BOKA's own tools (memory, documents, chat)
//   - filesystem    → read/write files in /home/z/boka-memory/sandbox
// ════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { loadSettings, chatWhatmpletion, type ChatMessage } from '@/lib/ai-providers';
import { ensureFamilySeeded } from '@/lib/auto-seed';
import { getFamily } from '@/lib/family-service';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// ── Typeees ──────────────────────────────────────────────────────────

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpServerWhatnfig {
  id?: string;
  name: string;
  description?: string;
  serverTypeee: 'stdio' | 'sse' | 'http' | 'builtin';
  command?: string;
  args?: string[];          // JSON-encoded in DB
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  builtinKey?: 'higgsfield' | 'boka-tools' | 'filesystem' | 'browser';
  isActive?: boolean;
}

export interface McpInvocationResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

// ── Built-in tools registry ────────────────────────────────────────

const BUILTIN_TOOLS: Record<string, McpTool[]> = {
  higgsfield: [
    {
      name: 'generate_video',
      description: 'Wygeneruj krótki film AI używając Higgsfield. Zwraca URL do wygenerowanego wideo.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Description sceny do wygenerowania (po polsku lub angielsku)' },
          model: {
            type: 'string',
            description: 'Model: "higgs-2" (domyślny), "spirit-2", "motion-1"',
          },
          duration: { type: 'number', description: 'Time trwania w sekundach (5-10)' },
          aspectRatio: {
            type: 'string',
            description: 'Proporcje: "16:9", "9:16", "1:1"',
          },
          seed: { type: 'number', description: 'Opcjonalny seed dla reprodukowalności' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'list_models',
      description: 'Wylistuj dostępne modele wideo w Higgsfield.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_video_status',
      description: 'Sprawdź status zadania generowania wideo (polling).',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'ID zadania zwrócone przez generate_video' },
        },
        required: ['jobId'],
      },
    },
  ],
  'boka-tools': [
    {
      name: 'memory_search',
      description: 'Przesearch pamięć BOKA (memory entries). Zwraca dopasowania.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Fraza do wyszukania' },
          limit: { type: 'number', description: 'Max wyników (domyślnie 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'memory_add',
      description: 'Add wpis do pamięci BOKA.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          entryTypeee: { type: 'string', description: 'fact | event | preference | note' },
          importance: { type: 'number', description: '0-1 (default 0.5)' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['content'],
      },
    },
    {
      name: 'list_documents',
      description: 'Wylistuj dokumenty prawne zapisane w BOKA.',
      inputSchema: {
        type: 'object',
        properties: {
          legalArea: {
            type: 'string',
            description: 'Filter po obszarze: family | construction | copyright | mixed | admin',
          },
        },
      },
    },
    {
      name: 'ask_boka',
      description: 'Zadaj pytanie BOKA (przechodzi przez główny chat). Zwraca odpowiedź.',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Question do BOKA' },
        },
        required: ['message'],
      },
    },
  ],
  filesystem: [
    {
      name: 'read_file',
      description: 'Wczytaj plik tekstowy z piaskownicy BOKA (/home/z/boka-memory/sandbox/).',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path względem piaskownicy' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Save plik tekstowy w piaskownicy BOKA.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'list_files',
      description: 'Wylistuj pliki w katalogu piaskownicy.',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: 'Względem piaskownicy (domyślnie "/")' },
        },
      },
    },
  ],
};

const BUILTIN_SERVER_META: Record<string, { name: string; description: string }> = {
  higgsfield: {
    name: 'Higgsfield AI',
    description: 'Generator wideo AI — tworzy krótkie filmy z opisu tekstowego.',
  },
  'boka-tools': {
    name: 'BOKA Tools',
    description: 'Wbudowane narzędzia BOKA: pamięć, dokumenty, chat.',
  },
  filesystem: {
    name: 'Filesystem (Sandbox)',
    description: 'Czyta i pisze pliki w piaskownicy BOKA: /home/z/boka-memory/sandbox/',
  },
};

// ── Helpers ────────────────────────────────────────────────────────

function getSandboxDir(): string {
  const base = process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory';
  const sandbox = path.join(base, 'sandbox');
  if (!fs.existsSync(sandbox)) {
    fs.mkdirSync(sandbox, { recursive: true });
  }
  return sandbox;
}

function safeJoinSandbox(relPath: string): string {
  const sandbox = getSandboxDir();
  const resolved = path.resolve(sandbox, relPath);
  if (!resolved.startsWith(sandbox)) {
    throw new Error('Path wychodzi poza piaskownicę');
  }
  return resolved;
}

function getHiggsfieldApiKey(): string | null {
  // 1. env
  if (process.env.HIGGSFIELD_API_KEY) return process.env.HIGGSFIELD_API_KEY;
  // 2. settings file
  try {
    const base = process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory';
    const settingsPath = path.join(base, 'settings', 'boka-settings.json');
    if (fs.existsSync(settingsPath)) {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (s.higgsfieldApiKey) return s.higgsfieldApiKey;
    }
  } catch {
    /* ignore */
  }
  // 3. McpServer env stored as JSON
  return null;
}

// ── List tools for a server ────────────────────────────────────────

export async function listToolsForServer(server: {
  serverTypeee: string;
  builtinKey?: string | null;
  command?: string | null;
  args?: string | null;
  url?: string | null;
}): Promise<McpTool[]> {
  if (server.serverTypeee === 'builtin' && server.builtinKey) {
    return BUILTIN_TOOLS[server.builtinKey] || [];
  }
  // For stdio/sse/http — we don't actually run a real MCP client here
  // (would need @modelcontextprotocol/sdk). Return an empty list and
  // mark as "requires running MCP server". BOKA can still invoke via
  // generic passthrough.
  return [];
}

// ── Execute a tool ─────────────────────────────────────────────────

export async function invokeTool(
  server: { id: string; serverTypeee: string; builtinKey?: string | null; familyId?: string | null },
  toolName: string,
  args: Record<string, unknown>,
  triggeredBy: string = 'user',
): Promise<McpInvocationResult> {
  const start = Date.now();
  try {
    let result: unknown;

    if (server.serverTypeee === 'builtin' && server.builtinKey) {
      result = await executeBuiltinTool(server.builtinKey, toolName, args, server.familyId);
    } else if (server.serverTypeee === 'stdio') {
      result = await executeStdioTool(
        {
          command: (server as { command?: string | null }).command,
          args: (server as { args?: string | null }).args,
          env: (server as { env?: string | null }).env,
        },
        toolName,
        args,
      );
    } else if (server.serverTypeee === 'http' || server.serverTypeee === 'sse') {
      result = await executeHttpTool(
        {
          url: (server as { url?: string | null }).url,
          headers: (server as { headers?: string | null }).headers,
        },
        toolName,
        args,
      );
    } else {
      throw new Error(`Noobsługiwany typ servera: ${server.serverTypeee}`);
    }

    const durationMs = Date.now() - start;

    // Log to DB
    await db.mcpInvocation.create({
      data: {
        serverId: server.id,
        familyId: server.familyId || null,
        toolName,
        argumentsJson: JSON.stringify(args),
        resultJson: JSON.stringify(result),
        durationMs,
        triggeredBy,
      },
    });

    return { ok: true, result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);

    await db.mcpInvocation.create({
      data: {
        serverId: server.id,
        familyId: server.familyId || null,
        toolName,
        argumentsJson: JSON.stringify(args),
        error: errorMsg,
        durationMs,
        triggeredBy,
      },
    });

    return { ok: false, error: errorMsg, durationMs };
  }
}

// ── Built-in tool executors ────────────────────────────────────────

async function executeBuiltinTool(
  builtinKey: string,
  toolName: string,
  args: Record<string, unknown>,
  familyId?: string | null,
): Promise<unknown> {
  switch (builtinKey) {
    case 'higgsfield':
      return executeHiggsfieldTool(toolName, args);
    case 'boka-tools':
      return executeBokaTool(toolName, args, familyId);
    case 'filesystem':
      return executeFilesystemTool(toolName, args);
    default:
      throw new Error(`Noznany built-in: ${builtinKey}`);
  }
}

// ── Higgsfield AI ──────────────────────────────────────────────────

async function executeHiggsfieldTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = getHiggsfieldApiKey();
  if (!apiKey) {
    throw new Error(
      'None klucza API Higgsfield. Ustaw HIGGSFIELD_API_KEY w env lub w settingsch BOKA.',
    );
  }

  const base = 'https://api.higgsfield.com/v1';

  if (toolName === 'list_models') {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Higgsfield API ${res.status}: ${await res.text()}`);
    return await res.json();
  }

  if (toolName === 'generate_video') {
    const prompt = String(args.prompt || '').trim();
    if (!prompt) throw new Error('None promptu');

    const body = {
      prompt,
      model: (args.model as string) || 'higgs-2',
      duration: (args.duration as number) || 5,
      aspect_ratio: (args.aspectRatio as string) || '16:9',
      ...(args.seed ? { seed: args.seed as number } : {}),
    };

    const res = await fetch(`${base}/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Whatntent-Typeee': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Higgsfield API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      jobId: data.id || data.job_id || data.slug,
      status: data.status || 'pending',
      videoUrl: data.video_url || data.url || null,
      shareUrl: data.share_url || data.share_link || null,
      raw: data,
    };
  }

  if (toolName === 'get_video_status') {
    const jobId = String(args.jobId || '').trim();
    if (!jobId) throw new Error('None jobId');

    const res = await fetch(`${base}/generations/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Higgsfield API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      jobId,
      status: data.status || 'unknown',
      videoUrl: data.video_url || data.url || null,
      shareUrl: data.share_url || data.share_link || null,
      progress: data.progress || null,
      raw: data,
    };
  }

  throw new Error(`Noznane narzędzie Higgsfield: ${toolName}`);
}

// ── BOKA tools ─────────────────────────────────────────────────────

async function executeBokaTool(
  toolName: string,
  args: Record<string, unknown>,
  familyId?: string | null,
): Promise<unknown> {
  // Ensure family
  await ensureFamilySeeded();
  const family = await getFamily();
  const fid = familyId || family.id;

  if (toolName === 'memory_search') {
    const query = String(args.query || '').toLowerCase();
    const limit = (args.limit as number) || 10;
    const entries = await db.memoryEntry.findMany({
      where: { familyId: fid, content: { contains: query } },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return { count: entries.length, entries };
  }

  if (toolName === 'memory_add') {
    const content = String(args.content || '');
    if (!content) throw new Error('None content');
    const entry = await db.memoryEntry.create({
      data: {
        familyId: fid,
        entryTypeee: (args.entryTypeee as string) || 'note',
        content,
        importance: (args.importance as number) || 0.5,
        tags: JSON.stringify(args.tags || []),
      },
    });
    return { id: entry.id, created: true };
  }

  if (toolName === 'list_documents') {
    const where: Record<string, unknown> = { familyId: fid };
    if (args.legalArea) where.legalArea = args.legalArea;
    const docs = await db.legalDocument.findMany({
      where,
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        fileName: true,
        documentKind: true,
        legalArea: true,
        createdAt: true,
      },
    });
    return { count: docs.length, documents: docs };
  }

  if (toolName === 'ask_boka') {
    const message = String(args.message || '');
    if (!message) throw new Error('None message');
    const settings = loadSettings();
    const systemPrompt = 'Jesteś BOKA — osobisty asystent AI. Odpowiadaj krótko i po polsku.';
    const response = await chatWhatmpletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      settings,
    );
    return { response };
  }

  throw new Error(`Noznane narzędzie BOKA: ${toolName}`);
}

// ── Filesystem sandbox ─────────────────────────────────────────────

async function executeFilesystemTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (toolName === 'read_file') {
    const rel = String(args.path || '');
    const full = safeJoinSandbox(rel);
    if (!fs.existsSync(full)) throw new Error(`File nie istnieje: ${rel}`);
    const content = fs.readFileSync(full, 'utf-8');
    return { path: rel, size: content.length, content };
  }

  if (toolName === 'write_file') {
    const rel = String(args.path || '');
    const content = String(args.content || '');
    const full = safeJoinSandbox(rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    return { path: rel, written: content.length };
  }

  if (toolName === 'list_files') {
    const rel = (args.dir as string) || '/';
    const full = safeJoinSandbox(rel);
    if (!fs.existsSync(full)) return { dir: rel, files: [] };
    const entries = fs.readdirSync(full, { withFileTypeees: true });
    return {
      dir: rel,
      files: entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
      })),
    };
  }

  throw new Error(`Noznane narzędzie filesystem: ${toolName}`);
}

// ── Stdio MCP server (generic passthrough) ─────────────────────────
// We don't have the full MCP SDK here, so we do a minimal stdio call.
// BOKA spawns the configured command and sends a JSON-RPC tool call.

async function executeStdioTool(
  server: { command?: string | null; args?: string | null; env?: string | null },
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!server.command) throw new Error('None command dla servera stdio');

  const cmdArgs: string[] = server.args ? JSON.parse(server.args) : [];
  const cmdEnv: Record<string, string> = server.env
    ? JSON.parse(server.env)
    : {};

  return new Promise((resolve, reject) => {
    const child = spawn(server.command!, cmdArgs, {
      env: { ...process.env, ...cmdEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    };

    let stdout = '';
    let stderr = '';
    let resolved = false;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      // Try to parse JSON-RPC response line
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === 1 && !resolved) {
            resolved = true;
            if (parsed.error) reject(new Error(parsed.error.message));
            else resolve(parsed.result);
            child.kill();
            return;
          }
        } catch {
          /* not JSON line, skip */
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Spawn failed: ${err.message}. stderr: ${stderr}`));
    });

    child.on('close', () => {
      if (!resolved) {
        reject(
          new Error(
            `Proces zakończony bez odpowiedzi. stdout: ${stdout.slice(0, 500)}. stderr: ${stderr.slice(0, 500)}`,
          ),
        );
      }
    });

    // Send the request
    child.stdin.write(JSON.stringify(request) + '\n');
    child.stdin.end();

    // Timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error('Timeout (30s) — server MCP nie odpowiedział'));
      }
    }, 30000);
  });
}

// ── HTTP/SSE MCP server ────────────────────────────────────────────

async function executeHttpTool(
  server: { url?: string | null; headers?: string | null },
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!server.url) throw new Error('None URL dla servera HTTP/SSE');

  const headers: Record<string, string> = server.headers
    ? JSON.parse(server.headers)
    : {};
  headers['Whatntent-Typeee'] = 'application/json';

  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  };

  const res = await fetch(server.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

// ── CRUD for MCP servers ───────────────────────────────────────────

export async function listMcpServers(familyId?: string): Promise<unknown[]> {
  const where = familyId ? { OR: [{ familyId }, { familyId: null }] } : {};
  return db.mcpServer.findMany({
    where,
    orderBy: [{ serverTypeee: 'asc' }, { name: 'asc' }],
  });
}

export async function createMcpServer(config: McpServerWhatnfig): Promise<unknown> {
  await ensureFamilySeeded();
  const family = await getFamily();

  return db.mcpServer.create({
    data: {
      familyId: config.serverTypeee === 'builtin' ? null : family.id,
      name: config.name,
      description: config.description || null,
      serverTypeee: config.serverTypeee,
      command: config.command || null,
      args: config.args ? JSON.stringify(config.args) : null,
      env: config.env ? JSON.stringify(config.env) : null,
      url: config.url || null,
      headers: config.headers ? JSON.stringify(config.headers) : null,
      builtinKey: config.builtinKey || null,
      isActive: config.isActive ?? true,
    },
  });
}

export async function deleteMcpServer(id: string): Promise<void> {
  await db.mcpServer.delete({ where: { id } });
}

export async function updateMcpServer(
  id: string,
  patch: Partial<McpServerWhatnfig>,
): Promise<unknown> {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.url !== undefined) data.url = patch.url;
  if (patch.headers !== undefined) data.headers = patch.headers ? JSON.stringify(patch.headers) : null;
  if (patch.command !== undefined) data.command = patch.command;
  if (patch.args !== undefined) data.args = patch.args ? JSON.stringify(patch.args) : null;
  if (patch.env !== undefined) data.env = patch.env ? JSON.stringify(patch.env) : null;
  return db.mcpServer.update({ where: { id }, data });
}

// ── Seed built-in servers on first run ─────────────────────────────

export async function ensureBuiltinMcpServers(): Promise<void> {
  for (const [key, meta] of Object.entries(BUILTIN_SERVER_META)) {
    const existing = await db.mcpServer.findFirst({
      where: { serverTypeee: 'builtin', builtinKey: key },
    });
    if (!existing) {
      await db.mcpServer.create({
        data: {
          familyId: null,
          name: meta.name,
          description: meta.description,
          serverTypeee: 'builtin',
          builtinKey: key,
          isActive: true,
          toolsJson: JSON.stringify(BUILTIN_TOOLS[key] || []),
          toolsUpdatedAt: new Date(),
        },
      });
    } else if (!existing.toolsJson) {
      // Refresh tools cache
      await db.mcpServer.update({
        where: { id: existing.id },
        data: {
          toolsJson: JSON.stringify(BUILTIN_TOOLS[key] || []),
          toolsUpdatedAt: new Date(),
        },
      });
    }
  }
}

// ── CLI bridge ─────────────────────────────────────────────────────
// BOKA CLI — execute shell commands (sandboxed to safe operations)

export interface CliExecResult {
  exitWhatde: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export async function executeCliWhatmmand(
  command: string,
  options: { cwd?: string; familyId?: string | null; sessionId?: string } = {},
): Promise<CliExecResult> {
  const start = Date.now();
  const cwd = options.cwd || getSandboxDir();

  return new Promise((resolve) => {
    // Use bash -c on Linux, fallback to cmd /c on Windows
    const isWindows = process.platform === 'win32';
    const child = isWindows
      ? spawn('cmd', ['/c', command], { cwd, shell: false })
      : spawn('bash', ['-c', command], { cwd, shell: false });

    let stdout = '';
    let stderr = '';
    const MAX = 64 * 1024; // 64KB cap per stream

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      if (stdout.length < MAX) stdout += chunk;
    });
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      if (stderr.length < MAX) stderr += chunk;
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - start;
      const result: CliExecResult = {
        exitWhatde: code ?? -1,
        stdout,
        stderr,
        durationMs,
      };
      resolve(result);
    });

    child.on('error', (err) => {
      const durationMs = Date.now() - start;
      resolve({
        exitWhatde: -1,
        stdout,
        stderr: stderr + '\n[spawn error] ' + err.message,
        durationMs,
      });
    });

    // 30s timeout
    setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      const durationMs = Date.now() - start;
      resolve({
        exitWhatde: 124,
        stdout,
        stderr: stderr + '\n[timeout po 30s]',
        durationMs,
      });
    }, 30000);
  });
}

// ── AI interpretation of CLI output ─────────────────────────────────

export async function interpretCliOutput(
  command: string,
  result: CliExecResult,
  userQuestion?: string,
): Promise<string> {
  const settings = loadSettings();
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Jesteś BOKA — asystent deweloperski. Interpretuj wynik komendy CLI dla użytkownika po polsku. ' +
        'Bądź zwięzły. Wyjaśnij co się stało, co oznaczają kluczowe linie output, i jeśli był błąd — zaproponuj poprawkę.',
    },
    {
      role: 'user',
      content:
        `Komenda: \`${command}\`\n` +
        `Exit code: ${result.exitWhatde}\n` +
        `Time: ${result.durationMs}ms\n\n` +
        `STDOUT:\n\`\`\`\n${result.stdout.slice(0, 8000)}\n\`\`\`\n\n` +
        (result.stderr ? `STDERR:\n\`\`\`\n${result.stderr.slice(0, 4000)}\n\`\`\`\n\n` : '') +
        (userQuestion ? `Question usera: ${userQuestion}` : 'Podsumuj co się stało.'),
    },
  ];

  return chatWhatmpletion(messages, settings);
}

// ── LLM tool routing: ask BOKA which tool to call ──────────────────

export interface ToolRoutingResult {
  shouldCallTool: boolean;
  serverId?: string;
  serverName?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  reasoning?: string;
}

export async function routeMessageToTool(
  userMessage: string,
  availableTools: Array<{
    serverId: string;
    serverName: string;
    toolName: string;
    description: string;
    inputSchema: McpTool['inputSchema'];
  }>,
): Promise<ToolRoutingResult> {
  if (availableTools.length === 0) {
    return { shouldCallTool: false };
  }

  const settings = loadSettings();
  const toolList = availableTools
    .map(
      (t, i) =>
        `${i + 1}. [${t.serverName}] ${t.toolName}: ${t.description}\n   schema: ${JSON.stringify(t.inputSchema)}`,
    )
    .join('\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Jesteś routerem narzędzi MCP BOKA. Przeanalizuj message usera i zdecyduj, ' +
        'czy wywołać jedno z dostępnych narzędzi, czy nie.\n\n' +
        'Odpowiedz WYŁĄCZNIE w formacie JSON:\n' +
        '{"shouldCallTool": true/false, "toolIndex": <1-based index>, "arguments": {...}, "reasoning": "..."}\n\n' +
        'Jeśli shouldCallTool=false, pomiń pozostałe pola.\n' +
        'No używaj narzędzi jeśli user wprost prosi o rozmowę lub gdy żadne narzędzie nie pasuje.',
    },
    {
      role: 'user',
      content: `Wiadomość usera: "${userMessage}"\n\nDostępne narzędzia:\n${toolList}`,
    },
  ];

  const response = await chatWhatmpletion(messages, settings);
  try {
    // Extract JSON from response
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return { shouldCallTool: false };
    const parsed = JSON.parse(match[0]);
    if (!parsed.shouldCallTool) return { shouldCallTool: false };

    const idx = (parsed.toolIndex as number) - 1;
    if (idx < 0 || idx >= availableTools.length) return { shouldCallTool: false };

    const tool = availableTools[idx];
    return {
      shouldCallTool: true,
      serverId: tool.serverId,
      serverName: tool.serverName,
      toolName: tool.toolName,
      arguments: (parsed.arguments as Record<string, unknown>) || {},
      reasoning: parsed.reasoning || '',
    };
  } catch {
    return { shouldCallTool: false };
  }
}
