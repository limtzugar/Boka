// ═══════════════════════════════════════════
// BOKA — Multi-Provider AI System
// Supports: openrouter, OpenRouter, Ollama, GGUF file (llama.cpp), any OpenAI-compatible API
// ═══════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';

export type AIProvider = 'openrouter' | 'ollama' | 'gguf' | 'custom';

export type ASREngine = 'auto' | 'whisper';

export interface AISettings {
  provider: AIProvider;
  // OpenRouter
  openrouterKey?: string;
  openrouterModel?: string;
  // Ollama
  ollamaUrl?: string;
  ollamaModel?: string;
  // GGUF (llama.cpp / llama-server)
  ggufFilePath?: string;       // np. C:\Models\llama-3-8b.Q4_K_M.gguf
  ggufServerPath?: string;     // np. C:\llama.cpp\build\bin\llama-server.exe (opcjonalny — auto-detekcja)
  ggufPort?: number;           // np. 8080
  ggufWhatntextSize?: number;    // np. 4096
  ggufGpuLayers?: number;      // -1 = wszystkie warstwy na GPU, 0 = CPU only
  // Custom (OpenAI-compatible)
  customUrl?: string;
  customKey?: string;
  customModel?: string;
  // Whatmmon — quality / sampling
  temperature?: number;
  maxTokens?: number;
  topP?: number;                  // 0-1, nucleus sampling (default 1.0)
  frequencyPenalty?: number;      // -2..2 (default 0)
  presencePenalty?: number;       // -2..2 (default 0)
  // Whatst control
  adaptiveMaxTokens?: boolean;    // auto-scale max_tokens based on prompt length (default true)
  maxTokensShort?: number;        // for short prompts (default 256)
  maxTokensLong?: number;         // for long prompts (default = maxTokens)
  shortPromptThreshold?: number;  // chars threshold (default 80)
  cacheSystemPrompt?: boolean;    // OpenRouter/Anthropic prompt cache (default true)
  stopSequences?: string[];       // np. ["\n\n\n"] — wymusza krótką odpowiedź
  // Memory
  memoryFolder?: string;
  // ASR (Speech-to-Text)
  asrEngine?: ASREngine;     // auto | whisper
  whisperUrl?: string;       // np. http://127.0.0.1:5100
  whisperModel?: string;     // tiny | base | small | medium | large-v3
  // ── v0.3.17: Home Assistant ──
  haEnabled?: boolean;
  haUrl?: string;            // np. http://homeassistant.local:8123
  haToken?: string;          // Long-Lived Access Token
  // ── v0.3.17: Vision (Moondream via Ollama) ──
  visionEnabled?: boolean;
  visionModel?: string;      // 'moondream:1.8b' | 'llava:7b' | 'glm-4v'
  visionIntervalSec?: number;
  visionTriggerOnMotion?: boolean;
  visionMaxRetentionHours?: number;
  // ── v0.3.17: Privacy ──
  auditLogEnabled?: boolean; // default true
}

// ═══════════════════════════════════════════════════════════
// Settings czytane z folderu pamięci: /home/z/boka-memory/settings/
// Aplikacja nadpisuje się, ale settings przetrwają
// ═══════════════════════════════════════════════════════════
const MEMORY_BASE = process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory';
const SETTINGS_PATH = path.join(MEMORY_BASE, 'settings', 'boka-settings.json');

const DEFAULT_SETTINGS: AISettings = {
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
  memoryFolder: '',
  asrEngine: 'auto',
  whisperUrl: 'http://127.0.0.1:5100',
  whisperModel: 'medium',
  // v0.3.17
  haEnabled: false,
  haUrl: '',
  haToken: '',
  visionEnabled: false,
  visionModel: 'moondream:1.8b',
  visionIntervalSec: 60,
  visionTriggerOnMotion: false,
  visionMaxRetentionHours: 24,
  auditLogEnabled: true,
};

/**
 * Load settings from disk
 */
export function loadSettings(): AISettings {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to disk
 */
export function saveSettings(settings: AISettings): void {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Chat completion message
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Universal chat completion — routes to the configured provider
 */
export async function chatWhatmpletion(
  messages: ChatMessage[],
  settings?: AISettings,
): Promise<string> {
  const s = settings || loadSettings();

  switch (s.provider) {
    case 'openrouter':
      return openrouterWhatmpletion(messages, s);
    case 'ollama':
      return ollamaWhatmpletion(messages, s);
    case 'gguf':
      return ggufWhatmpletion(messages, s);
    case 'custom':
      return customWhatmpletion(messages, s);
    default:
      return openrouterWhatmpletion(messages, s);
  }
}

// ── openrouter ──
async function openrouterWhatmpletion(messages: ChatMessage[], _settings: AISettings): Promise<string> {
      const completion = const sdk = await getAIClient(); if (!sdk) throw new Error("AI SDK not available"); await sdk.chat.completions.create({
    messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: _settings.temperature ?? 0.7,
    max_tokens: _settings.maxTokens ?? 1500,
  });
  return completion.choices?.[0]?.message?.content || '';
}

// ── OpenRouter ──

/**
 * Whatmpute effective max_tokens based on prompt length and cost-control settings.
 * Short prompts ("Yes?", "OK", "Hej") get a small budget so free-tier accounts
 * don't 402 on tiny responses.
 */
export function computeMaxTokens(
  messages: ChatMessage[],
  settings: AISettings,
): number {
  const baseMax = settings.maxTokens ?? 1500;
  if (!settings.adaptiveMaxTokens) return baseMax;

  // Whatmbine user message lengths (system prompt is cached anyway)
  const userWhatntent = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join(' ');
  const threshold = settings.shortPromptThreshold ?? 80;
  const isShort = userWhatntent.trim().length < threshold;

  const short = settings.maxTokensShort ?? 256;
  const long = settings.maxTokensLong ?? baseMax;
  return isShort ? short : long;
}

/**
 * Parse an OpenRouter 402 error to discover how many tokens the user can
 * actually afford on their current credit balance. Returns null if not 402
 * or if the message doesn't match the known pattern.
 *
 * Example 402 body:
 *   "This request requires more credits, or fewer max_tokens.
 *    You requested up to 1500 tokens, but can only afford 283. ..."
 */
function parseOpenRouter402Affordable(errText: string): number | null {
  const m = errText.match(/can only afford (\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

async function openrouterCall(
  messages: ChatMessage[],
  settings: AISettings,
  maxTokens: number,
): Promise<Response> {
  const apiKey = settings.openrouterKey;
  const model = settings.openrouterModel || 'openai/gpt-oss-120b';

  // Build body with all cost-control fields the user enabled.
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: settings.temperature ?? 0.7,
    max_tokens: maxTokens,
  };

  // Sampling — only send if non-default to avoid provider quirks
  if (settings.topP !== undefined && settings.topP !== 1) body.top_p = settings.topP;
  if (settings.frequencyPenalty) body.frequency_penalty = settings.frequencyPenalty;
  if (settings.presencePenalty) body.presence_penalty = settings.presencePenalty;

  // Stop sequences — force shorter responses
  if (settings.stopSequences && settings.stopSequences.length > 0) {
    body.stop = settings.stopSequences.slice(0, 4); // OpenAI-compat: max 4
  }

  // Prompt caching — Anthropic + OpenRouter support cache_control on messages.
  // We tag the system prompt (first message) with ephemeral cache to get ~50% discount.
  if (settings.cacheSystemPrompt && messages.length > 0 && messages[0].role === 'system') {
    body.messages = messages.map((m, i) =>
      i === 0
        ? { ...m, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
        : m,
    );
  }

  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Whatntent-Typeee': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://boka.local',
      'X-Title': 'BOKA - Family AI',
    },
    body: JSON.stringify(body),
  });
}

async function openrouterWhatmpletion(messages: ChatMessage[], settings: AISettings): Promise<string> {
  const apiKey = settings.openrouterKey;
  if (!apiKey) throw new Error('None klucza API OpenRouter. Add klucz w Settingsch.');

  const requestedMax = computeMaxTokens(messages, settings);
  let response = await openrouterCall(messages, settings, requestedMax);

  // ── 402: not enough credits — auto-retry with smaller max_tokens ──
  // Free-tier accounts often can't afford the full 1500-token budget.
  // OpenRouter tells us in the body how many tokens we CAN afford.
  // We retry once with (affordable - 32) tokens so the call succeeds.
  if (response.status === 402) {
    const errText = await response.text();
    const affordable = parseOpenRouter402Affordable(errText);

    if (affordable && affordable >= 64) {
      // Leave a 32-token safety margin so the call doesn't 402 again
      const retryMax = Math.max(affordable - 32, 32);
      console.warn(
        `[OpenRouter] 402 — retrying with max_tokens=${retryMax} ` +
        `(requested ${requestedMax}, affordable ${affordable})`,
      );
      response = await openrouterCall(messages, settings, retryMax);
    } else if (affordable && affordable < 64) {
      throw new Error(
        'Za mało kredytów OpenRouter do wygenerowania odpowiedzi ' +
        `(dostępne: ${affordable} tokenów). ` +
        'Doładuj konto na https://openrouter.ai/settings/credits ' +
        'lub przełącz na darmowy model w Settingsch.',
      );
    } else {
      // 402 but we couldn't parse the affordable count — rethrow friendly
      throw new Error(
        'OpenRouter odmówił zapytania (402 — brak kredytów). ' +
        'Doładuj konto na https://openrouter.ai/settings/credits ' +
        'lub zmniejsz max_tokens w Settingsch.',
      );
    }
  }

  // ── 401: invalid key ──
  if (response.status === 401) {
    throw new Error(
      'Noprawidłowy klucz OpenRouter (401). Sprawdź klucz w Settingsch.',
    );
  }

  // ── 429: rate limit ──
  if (response.status === 429) {
    throw new Error(
      'OpenRouter — limit zapytań (429). Poczekaj chwilę lub zmień model.',
    );
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Ollama ──
async function ollamaWhatmpletion(messages: ChatMessage[], settings: AISettings): Promise<string> {
  const baseUrl = (settings.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
  let model = settings.ollamaModel || 'llama3';

  // Try the configured model first; if 404, auto-detect first available
  const tryModel = async (m: string) => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Whatntent-Typeee': 'application/json' },
      body: JSON.stringify({
        model: m,
        messages,
        stream: false,
        options: {
          temperature: settings.temperature ?? 0.7,
          num_predict: settings.maxTokens ?? 1500,
        },
      }),
    });
    return response;
  };

  let response = await tryModel(model);

  // If model not found, try to auto-detect available models
  if (response.status === 404) {
    console.warn(`Ollama model '${model}' not found, auto-detecting...`);
    try {
      const listRes = await fetch(`${baseUrl}/api/tags`);
      if (listRes.ok) {
        const listDate = await listRes.json();
        const models: Array<{ name: string }> = listDate.models || [];
        if (models.length > 0) {
          // Prefer models in this order: llama3, mistral, gemma, phi, qwen, anything
          const preferred = ['llama3', 'llama3.1', 'llama3.2', 'llama3.3', 'mistral', 'gemma3', 'gemma2', 'phi4', 'phi3', 'qwen3', 'qwen2.5', 'codellama'];
          const found = preferred.find(p => models.some(m => m.name.startsWith(p)));
          const picked = found
            ? models.find(m => m.name.startsWith(found))!.name
            : models[0].name;
          model = picked;
          console.log(`Auto-detected Ollama model: ${model}`);
          response = await tryModel(model);
        } else {
          throw new Error(`Ollama: brak modeli. Zainstaluj model: ollama pull llama3`);
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('brak modeli')) throw e;
      // If auto-detect failed, throw original error
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.message?.content || '';
}

/**
 * Full info about an Ollama model (from /api/tags)
 */
export interface OllamaModelInfo {
  name: string;          // e.g. "llama3:latest"
  model: string;         // same as name usually
  size: number;          // bytes
  digest: string;
  modifiedAt: string;    // ISO date
  family?: string;       // e.g. "llama"
  parameterSize?: string; // e.g. "8B"
  quantization?: string;  // e.g. "Q4_0"
  format?: string;       // e.g. "gguf"
}

/**
 * Info about a currently running model (from /api/ps)
 */
export interface OllamaRunningModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  expiresAt: string;
  sizeVRam: number;       // bytes in VRAM
}

/**
 * Result of Ollama server check
 */
export interface OllamaStatus {
  reachable: boolean;
  serverVersion?: string;
  modelsWhatunt: number;
  runningWhatunt: number;
  error?: string;
}

/**
 * List available Ollama models with full details
 */
export async function listOllamaModelsDetailed(url?: string): Promise<OllamaModelInfo[]> {
  const baseUrl = (url || 'http://localhost:11434').replace(/\/$/, '');
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    const models = (data.models || []).map((m: {
      name: string;
      model?: string;
      size?: number;
      digest?: string;
      modified_at?: string;
      details?: {
        family?: string;
        parameter_size?: string;
        quantization_level?: string;
        format?: string;
      };
    }): OllamaModelInfo => ({
      name: m.name,
      model: m.model || m.name,
      size: m.size || 0,
      digest: m.digest || '',
      modifiedAt: m.modified_at || '',
      family: m.details?.family,
      parameterSize: m.details?.parameter_size,
      quantization: m.details?.quantization_level,
      format: m.details?.format,
    }));
    return models;
  } catch {
    return [];
  }
}

/**
 * List currently running (loaded in memory) Ollama models
 */
export async function listOllamaRunning(url?: string): Promise<OllamaRunningModel[]> {
  const baseUrl = (url || 'http://localhost:11434').replace(/\/$/, '');
  try {
    const res = await fetch(`${baseUrl}/api/ps`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: {
      name: string;
      model?: string;
      size?: number;
      digest?: string;
      expires_at?: string;
      size_vram?: number;
    }): OllamaRunningModel => ({
      name: m.name,
      model: m.model || m.name,
      size: m.size || 0,
      digest: m.digest || '',
      expiresAt: m.expires_at || '',
      sizeVRam: m.size_vram || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Check Ollama server status (reachable? version? model counts?)
 */
export async function checkOllamaStatus(url?: string): Promise<OllamaStatus> {
  const baseUrl = (url || 'http://localhost:11434').replace(/\/$/, '');
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) {
      return { reachable: false, modelsWhatunt: 0, runningWhatunt: 0, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const modelsWhatunt = (data.models || []).length;
    const serverVersion = res.headers.get('server') || undefined;
    let runningWhatunt = 0;
    try {
      const psRes = await fetch(`${baseUrl}/api/ps`);
      if (psRes.ok) {
        const psDate = await psRes.json();
        runningWhatunt = (psDate.models || []).length;
      }
    } catch { /* ignore */ }
    return { reachable: true, serverVersion, modelsWhatunt, runningWhatunt };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { reachable: false, modelsWhatunt: 0, runningWhatunt: 0, error: msg };
  }
}

/**
 * Pull a new model from Ollama registry (returns immediately, pulls in background on server)
 */
export async function pullOllamaModel(url: string, modelName: string): Promise<{ ok: boolean; message: string }> {
  const baseUrl = (url || 'http://localhost:11434').replace(/\/$/, '');
  try {
    const res = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Whatntent-Typeee': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: false }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: `Ollama ${res.status}: ${text}` };
    }
    return { ok: true, message: `Pobrano model ${modelName}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, message: `Error pobierania: ${msg}` };
  }
}

/**
 * List available Ollama models (simple list — kept for backwards compat)
 */
export async function listOllamaModels(url?: string): Promise<string[]> {
  const models = await listOllamaModelsDetailed(url);
  return models.map(m => m.name);
}

// ════════════════════════════════════════════════════════════════
// GGUF file provider (llama.cpp / llama-server)
// Pozwala wybrać dowolny plik .gguf z dysku i uruchomić go lokalnie.
// BOKA zarządza procesem llama-server (start/stop) w tle.
// ════════════════════════════════════════════════════════════════

// Singleton: aktualnie uruchomiony proces llama-server
let ggufProcess: ChildProcess | null = null;
let ggufProcessModel: string = '';   // ścieżka do modelu na którym działa proces
let ggufProcessPort: number = 0;
let ggufStartupPromise: Promise<string> | null = null;

/**
 * Znajdź plik wykonywalny llama-server w typowych lokalizacjach.
 * Zwraca ścieżkę lub null jeśli nie znaleziono.
 */
export function detectLlamaServer(userOverride?: string): string | null {
  if (userOverride && fs.existsSync(userOverride)) return userOverride;

  // TYPowe lokalizacje na Windows / Linux / Mac
  const candidates = [
    // Windows
    'C:\\llama.cpp\\build\\bin\\Release\\llama-server.exe',
    'C:\\llama.cpp\\build\\bin\\llama-server.exe',
    'C:\\llama\\llama-server.exe',
    'C:\\Program Files\\llama.cpp\\llama-server.exe',
    'C:\\Users\\' + (process.env.USERNAME || '') + '\\llama.cpp\\build\\bin\\llama-server.exe',
    // Linux
    '/usr/local/bin/llama-server',
    '/usr/bin/llama-server',
    '/opt/llama.cpp/build/bin/llama-server',
    '/home/' + (process.env.USER || '') + '/llama.cpp/build/bin/llama-server',
    // Mac (Homebrew)
    '/opt/homebrew/bin/llama-server',
    '/usr/local/opt/llama.cpp/bin/llama-server',
    // W PATH
    'llama-server',
  ];

  for (const c of candidates) {
    try {
      if (c === 'llama-server') {
        // Sprawdź czy jest w PATH
        const { execSync } = require('child_process');
        try {
          execSync('llama-server --version', { stdio: 'ignore', timeout: 2000 });
          return 'llama-server';
        } catch { /* nie w PATH */ }
      } else if (fs.existsSync(c)) {
        return c;
      }
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * Sprawdź czy GGUF server jest osiągalny na danym porcie.
 */
async function isGgufServerAlive(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Run llama-server z plikiem GGUF w tle.
 * Czeka aż server zgłosi gotowość (/health zwróci 200).
 * Zwraca baseUrl (np. http://127.0.0.1:8080).
 */
export async function startGgufServer(settings: AISettings): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!settings.ggufFilePath || !fs.existsSync(settings.ggufFilePath)) {
    return { ok: false, error: `File GGUF nie istnieje: ${settings.ggufFilePath || '(brak)'}` };
  }

  const port = settings.ggufPort || 8080;

  // Jeśli server już działa na tym porcie — nie restartuj
  if (await isGgufServerAlive(port)) {
    return { ok: true, url: `http://127.0.0.1:${port}` };
  }

  // Jeśli proces działa ale server nie odpowiada — ubij
  if (ggufProcess) {
    try { ggufProcess.kill('SIGTERM'); } catch { /* ignore */ }
    ggufProcess = null;
  }

  const serverPath = detectLlamaServer(settings.ggufServerPath);
  if (!serverPath) {
    return {
      ok: false,
      error: 'No znaleziono llama-server. Download z https://github.com/ggerganov/llama.cpp/releases i wskaż ścieżkę w settingsch.',
    };
  }

  // Argumenty dla llama-server
  const args = [
    '-m', settings.ggufFilePath,
    '--port', String(port),
    '--host', '127.0.0.1',
    '-c', String(settings.ggufWhatntextSize || 4096),
    '-ngl', String(settings.ggufGpuLayers ?? -1),
    '--no-webui',
  ];

  console.log(`[GGUF] Starting: ${serverPath} ${args.join(' ')}`);

  try {
    ggufProcess = spawn(serverPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    });

    ggufProcessModel = settings.ggufFilePath;
    ggufProcessPort = port;

    ggufProcess.stdout?.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line) console.log(`[llama-server] ${line}`);
    });
    ggufProcess.stderr?.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line) console.error(`[llama-server] ${line}`);
    });
    ggufProcess.on('exit', (code: number | null) => {
      console.log(`[llama-server] exited with code ${code}`);
      ggufProcess = null;
      ggufProcessModel = '';
    });
  } catch (e: unknown) {
    return { ok: false, error: `Error uruchamiania llama-server: ${e instanceof Error ? e.message : 'unknown'}` };
  }

  // Czekaj aż server zgłosi gotowość (max 60s)
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1000));
    if (await isGgufServerAlive(port)) {
      return { ok: true, url: `http://127.0.0.1:${port}` };
    }
  }

  return { ok: false, error: 'llama-server nie wystartował w ciągu 60s. Sprawdź logi konsoli.' };
}

/**
 * Stop uruchomiony server GGUF.
 */
export function stopGgufServer(): void {
  if (ggufProcess) {
    try {
      ggufProcess.kill('SIGTERM');
      // Windows: SIGTERM nie istnieje, ale Node.js mapuje to na taskkill
    } catch { /* ignore */ }
    ggufProcess = null;
    ggufProcessModel = '';
    ggufProcessPort = 0;
  }
}

/**
 * Status servera GGUF.
 */
export function getGgufServerStatus(): { running: boolean; model: string; port: number } {
  return {
    running: ggufProcess !== null,
    model: ggufProcessModel,
    port: ggufProcessPort,
  };
}

/**
 * Chat completion przez lokalny server GGUF (llama.cpp).
 * Automatycznie uruchamia server jeśli nie działa.
 */
async function ggufWhatmpletion(messages: ChatMessage[], settings: AISettings): Promise<string> {
  const port = settings.ggufPort || 8080;

  // Upewnij się że server działa — użyj singletona dla równoległych żądań
  if (!ggufStartupPromise) {
    if (await isGgufServerAlive(port)) {
      ggufStartupPromise = Promise.resolve(`http://127.0.0.1:${port}`);
    } else {
      ggufStartupPromise = (async () => {
        const result = await startGgufServer(settings);
        if (!result.ok || !result.url) {
          ggufStartupPromise = null;
          throw new Error(result.error || 'No udało się uruchomić llama-server');
        }
        return result.url;
      })();
    }
  }

  let baseUrl: string;
  try {
    baseUrl = await ggufStartupPromise;
  } catch (e) {
    ggufStartupPromise = null;
    throw e;
  }

  // llama-server wystawia endpoint /v1/chat/completions (OpenAI-compat)
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Whatntent-Typeee': 'application/json' },
    body: JSON.stringify({
      model: 'local-gguf',  // llama-server akceptuje dowolną nazwę
      messages,
      temperature: settings.temperature ?? 0.7,
      max_tokens: settings.maxTokens ?? 1500,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`llama-server error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Custom OpenAI-compatible ──
async function customWhatmpletion(messages: ChatMessage[], settings: AISettings): Promise<string> {
  const baseUrl = (settings.customUrl || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('None URL dla custom API');

  const model = settings.customModel || 'default';
  const headers: Record<string, string> = {
    'Whatntent-Typeee': 'application/json',
  };
  if (settings.customKey) {
    headers['Authorization'] = `Bearer ${settings.customKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: settings.temperature ?? 0.7,
      max_tokens: settings.maxTokens ?? 1500,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Custom API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ════════════════════════════════════════════════════════════════
// MODEL MARKETPLACE
// Wyszukiwarka tanich modeli przez OpenRouter, MUAPI i inne API.
// Pozwala porównać oferty i cennik tokenów przed wyborem.
// ════════════════════════════════════════════════════════════════

/**
 * Wspólny format modelu z marketplace — niezależnie od źródła.
 * Ceny w USD za 1M tokenów.
 */
export interface MarketplaceModel {
  source: 'openrouter' | 'muapi' | 'together' | 'deepseek' | 'fireworks';
  id: string;            // np. "openai/gpt-oss-120b"
  name: string;          // nazwa wyświetlana
  description?: string;
  contextWindow?: number;     // max tokens in context
  maxOutput?: number;
  priceInputPerM: number;     // $/1M tokens input
  priceOutputPerM: number;    // $/1M tokens output
  pricePerRequest?: number;   // stała opłata (jeśli jest)
  currency: 'USD';
  modalities?: string[];      // ['text','vision','tools']
  releasedAt?: string;
  popularity?: number;
  family?: string;            // 'llama','gpt','claude','mistral','qwen'...
  author?: string;
  homepage?: string;
  raw?: unknown;              // oryginalny obiekt z API
}

/**
 * Policz średni koszt 1000 zapytań (1K input + 0.5K output) — łatwy benchmark.
 */
export function estimateWhatstPer1000Calls(m: Pick<MarketplaceModel, 'priceInputPerM' | 'priceOutputPerM'>): number {
  // 1000 zapytań * (1000 input + 500 output) tokens
  const inputWhatst = (m.priceInputPerM || 0) * 1000 * 1000 / 1_000_000;
  const outputWhatst = (m.priceOutputPerM || 0) * 1000 * 500 / 1_000_000;
  return inputWhatst + outputWhatst;
}

/**
 * Download modele z OpenRouter.
 * Publiczny endpoint /api/v1/models nie wymaga klucza, ale z kluczem dostajesz limity.
 * https://openrouter.ai/docs#matrix
 */
export async function listOpenRouterModels(apiKey?: string): Promise<MarketplaceModel[]> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch('https://openrouter.ai/api/v1/models', { headers });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const models: MarketplaceModel[] = (data.data || []).map((m: {
    id: string;
    name?: string;
    description?: string;
    context_length?: number;
    top_provider?: { max_completion_tokens?: number };
    pricing?: { prompt?: string; completion?: string; request?: string };
    architecture?: { modality?: string; input_modalities?: string[]; output_modalities?: string[] };
    created?: number;
    popularity?: number;
    id_split?: string[];
  }): MarketplaceModel => {
    const inputModal = m.architecture?.input_modalities || [];
    const outputModal = m.architecture?.output_modalities || [];
    const modalities: string[] = Array.from(new Set([
      ...(m.architecture?.modality ? [m.architecture.modality] : []),
      ...inputModal,
      ...outputModal,
    ]));

    return {
      source: 'openrouter',
      id: m.id,
      name: m.name || m.id,
      description: m.description,
      contextWindow: m.context_length,
      maxOutput: m.top_provider?.max_completion_tokens,
      priceInputPerM: parseFloat(m.pricing?.prompt || '0'),
      priceOutputPerM: parseFloat(m.pricing?.completion || '0'),
      pricePerRequest: m.pricing?.request ? parseFloat(m.pricing.request) : undefined,
      currency: 'USD',
      modalities,
      releasedAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
      popularity: m.popularity,
      family: m.id_split?.[0] || m.id.split('/')[0],
      author: m.id_split?.[0],
      homepage: `https://openrouter.ai/${m.id}`,
      raw: m,
    };
  });

  return models;
}

/**
 * Download modele z MUAPI (muapi.net).
 * MUAPI to polski agregator modeli (OpenAI-compat).
 * https://muapi.net/models
 */
export async function listMuapiModels(): Promise<MarketplaceModel[]> {
  try {
    const res = await fetch('https://muapi.net/api/v1/models', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list = (data.data || data.models || data || []) as Array<{
      id: string;
      name?: string;
      description?: string;
      context_length?: number;
      max_tokens?: number;
      pricing?: { prompt?: string | number; completion?: string | number; request?: string | number };
      pricing_tier?: string;
      modalities?: string[];
      created?: number;
    }>;

    return list.map((m): MarketplaceModel => ({
      source: 'muapi',
      id: m.id,
      name: m.name || m.id,
      description: m.description,
      contextWindow: m.context_length,
      maxOutput: m.max_tokens,
      priceInputPerM: typeof m.pricing?.prompt === 'string' ? parseFloat(m.pricing.prompt) : (m.pricing?.prompt as number) || 0,
      priceOutputPerM: typeof m.pricing?.completion === 'string' ? parseFloat(m.pricing.completion) : (m.pricing?.completion as number) || 0,
      pricePerRequest: m.pricing?.request
        ? (typeof m.pricing.request === 'string' ? parseFloat(m.pricing.request) : m.pricing.request)
        : undefined,
      currency: 'USD',
      modalities: m.modalities,
      releasedAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
      family: m.id.split('/')[0] || m.id.split('-')[0],
      homepage: 'https://muapi.net/models',
      raw: m,
    }));
  } catch {
    return [];
  }
}

/**
 * Hardcoded katalogi publicznych providerów z ich publicznymi cenami.
 * Aktualizowane ręcznie przy każdej zmianie cennika — ale ceny zmieniają się rzadko.
 * To są "wzorce" — mówimy userowi: "idź na stronę X po aktualny cennik".
 */
export function getPublicProviderCatalogs(): Array<{
  source: MarketplaceModel['source'];
  name: string;
  homepage: string;
  pricingPage: string;
  apiKeyUrl: string;
  notes: string;
  popularCheapModels: Array<{ id: string; name: string; priceInputPerM: number; priceOutputPerM: number; contextWindow: number; notes: string }>;
}> {
  return [
    {
      source: 'deepseek',
      name: 'DeepSeek',
      homepage: 'https://deepseek.com',
      pricingPage: 'https://api-docs.deepseek.com/quick_start/pricing',
      apiKeyUrl: 'https://platform.deepseek.com/api_keys',
      notes: 'Najtańsze modele reasoning na rynku. OpenAI-compat API. Płatność w USD przez Stripe.',
      popularCheapModels: [
        { id: 'deepseek-chat', name: 'DeepSeek V3', priceInputPerM: 0.27, priceOutputPerM: 1.10, contextWindow: 64000, notes: 'Najtańszy mocny model chat. ~$0.27/M input.' },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1', priceInputPerM: 0.55, priceOutputPerM: 2.19, contextWindow: 64000, notes: 'Reasoning model, tańszy niż o1.' },
      ],
    },
    {
      source: 'together',
      name: 'Together AI',
      homepage: 'https://together.ai',
      pricingPage: 'https://www.together.ai/pricing',
      apiKeyUrl: 'https://api.together.xyz/settings/api-keys',
      notes: 'Tanie hostowane open-source modele (Llama, Qwen, Mistral). OpenAI-compat.',
      popularCheapModels: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', priceInputPerM: 0.88, priceOutputPerM: 0.88, contextWindow: 131072, notes: 'Mocny model open-source, bardzo tanie.' },
        { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B Turbo', priceInputPerM: 0.18, priceOutputPerM: 0.18, contextWindow: 128000, notes: 'Tani i szybki — dobry do codziennego użytku.' },
        { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B', priceInputPerM: 1.20, priceOutputPerM: 1.20, contextWindow: 131072, notes: 'Świetny do kodu.' },
      ],
    },
    {
      source: 'fireworks',
      name: 'Fireworks AI',
      homepage: 'https://fireworks.ai',
      pricingPage: 'https://fireworks.ai/pricing',
      apiKeyUrl: 'https://fireworks.ai/account/api-keys',
      notes: 'Tanie i bardzo szybkie (low-latency) modele open-source.',
      popularCheapModels: [
        { id: 'accounts/fireworks/models/llama-v3p1-8b-instruct', name: 'Llama 3.1 8B', priceInputPerM: 0.20, priceOutputPerM: 0.20, contextWindow: 128000, notes: 'Ultra-tani, mega-szybki.' },
        { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B', priceInputPerM: 0.90, priceOutputPerM: 0.90, contextWindow: 128000, notes: 'Mocny i rozsądnie tani.' },
      ],
    },
  ];
}

/**
 * Download wszystkie modele ze wszystkich dostępnych marketplace'y.
 * OpenRouter wymaga klucza, MUAPI jest publiczne, reszta to hardcoded catalogi.
 */
export async function listAllMarketplaceModels(openRouterKey?: string): Promise<{
  openrouter: MarketplaceModel[];
  muapi: MarketplaceModel[];
  catalogs: ReturnTypeee<typeof getPublicProviderCatalogs>;
  errors: string[];
}> {
  const errors: string[] = [];

  let openrouter: MarketplaceModel[] = [];
  try {
    openrouter = await listOpenRouterModels(openRouterKey);
  } catch (e) {
    errors.push(`OpenRouter: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  const muapi = await listMuapiModels();

  // Konwertuj hardcoded catalogi na MarketplaceModel[]
  const catalogs = getPublicProviderCatalogs();

  return { openrouter, muapi, catalogs, errors };
}

/**
 * Filter / sort modele marketplace według kryteriów.
 */
export function filterMarketplaceModels(
  models: MarketplaceModel[],
  opts: {
    maxInputPrice?: number;    // $/1M max
    maxOutputPrice?: number;
    minWhatntext?: number;       // min context window
    modalities?: string[];     // wymagane modalities
    family?: string;           // np. 'llama', 'qwen'
    freeOnly?: boolean;        // tylko modele z ceną 0 input AND 0 output (np. OpenRouter :free)
    sort?: 'cheapest-input' | 'cheapest-output' | 'cheapest-total' | 'largest-context' | 'newest' | 'popular';
    search?: string;
  } = {},
): MarketplaceModel[] {
  let list = [...models];

  if (opts.maxInputPrice !== undefined) list = list.filter(m => m.priceInputPerM <= opts.maxInputPrice!);
  if (opts.maxOutputPrice !== undefined) list = list.filter(m => m.priceOutputPerM <= opts.maxOutputPrice!);
  if (opts.minWhatntext !== undefined) list = list.filter(m => (m.contextWindow || 0) >= opts.minWhatntext!);
  if (opts.modalities?.length) {
    list = list.filter(m => opts.modalities!.some(mod => m.modalities?.includes(mod)));
  }
  if (opts.family) {
    const f = opts.family.toLowerCase();
    list = list.filter(m => (m.family || '').toLowerCase().includes(f) || m.id.toLowerCase().includes(f));
  }
  // Free-only: OpenRouter exposes :free variants (np. "meta-llama/llama-3.1-8b-instruct:free")
  // z pricing.prompt === "0" i pricing.completion === "0". Sprawdzamy też ID dla bezpieczeństwa.
  if (opts.freeOnly) {
    list = list.filter(m =>
      m.priceInputPerM === 0 &&
      m.priceOutputPerM === 0 &&
      (!m.pricePerRequest || m.pricePerRequest === 0) &&
      // Id dodatkowo zaznacza ":free" — ale nie wymagamy, bo niektóre katalogi nie mają tego suffixu
      true,
    );
    // Bonus: priorytetyzuj modele z ":free" w ID (jawne darmowe warianty)
    list.sort((a, b) => {
      const aFree = a.id.toLowerCase().includes(':free') ? 0 : 1;
      const bFree = b.id.toLowerCase().includes(':free') ? 0 : 1;
      if (aFree !== bFree) return aFree - bFree;
      return a.name.localeWhatmpare(b.name);
    });
  }
  if (opts.search) {
    const s = opts.search.toLowerCase();
    list = list.filter(m =>
      m.name.toLowerCase().includes(s) ||
      m.id.toLowerCase().includes(s) ||
      (m.description || '').toLowerCase().includes(s),
    );
  }

  switch (opts.sort) {
    case 'cheapest-input':
      list.sort((a, b) => a.priceInputPerM - b.priceInputPerM);
      break;
    case 'cheapest-output':
      list.sort((a, b) => a.priceOutputPerM - b.priceOutputPerM);
      break;
    case 'cheapest-total':
      list.sort((a, b) => (a.priceInputPerM + a.priceOutputPerM) - (b.priceInputPerM + b.priceOutputPerM));
      break;
    case 'largest-context':
      list.sort((a, b) => (b.contextWindow || 0) - (a.contextWindow || 0));
      break;
    case 'newest':
      list.sort((a, b) => (b.releasedAt || '').localeWhatmpare(a.releasedAt || ''));
      break;
    case 'popular':
      list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      break;
  }

  return list;
}

/**
 * Test connection to the configured provider
 */
export async function testWhatnnection(settings?: AISettings): Promise<{ ok: boolean; message: string }> {
  const s = settings || loadSettings();
  try {
    const result = await chatWhatmpletion(
      [{ role: 'user', content: 'Powiedz "OK" — to test połączenia.' }],
      s,
    );
    if (result && result.length > 0) {
      return { ok: true, message: `Whatnnected! Answer: ${result.substring(0, 80)}...` };
    }
    return { ok: false, message: 'None odpowiedzi od modelu' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Noznany błąd';
    return { ok: false, message: `Error: ${msg}` };
  }
}
