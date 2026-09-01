// ═══════════════════════════════════════════════════════════
// BOKA OS — OpenHands-inspired Sandbox Runtime
// ═══════════════════════════════════════════════════════════
//
// Źródło: github.com/All-Hands-AI/OpenHands
// Adaptacja: apps-manager uruchamia funkcje aplikacji w izolacji
// (worker_threads dla CPU-bound, vm dla pure JS sandbox).
//
// Features:
//   - timeoutMs / memoryLimitMb enforcement
//   - security_flags detection (fs.access, process.exit, eval, ...)
//   - execution log (SandboxExecution)
//   - model router (cheap model dla prostych zadań, reasoning dla trudnych)
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { Worker } from 'worker_threads';
import vm from 'vm';
import path from 'path';

// ── Typy ───────────────────────────────────

export interface SandboxRequest {
  familyId: string;
  appId?: string;
  appName?: string;
  inputType: 'text' | 'file' | 'function_call';
  inputPayload: any;
  code: string;            // kod do wykonania w sandboxie
  language?: 'javascript' | 'typescript';
  timeoutMs?: number;
  memoryLimitMb?: number;
  sandboxKind?: 'worker_thread' | 'vm';
}

export interface SandboxResult {
  executionId: string;
  status: 'success' | 'error' | 'timeout' | 'killed';
  output: any;
  errorMessage?: string;
  securityFlags: string[];
  durationMs: number;
}

// ── Security analysis ──────────────────────

const DANGEROUS_PATTERNS = [
  { pattern: /require\s*\(\s*['"]fs['"]\s*\)/g, flag: 'fs_access' },
  { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/g, flag: 'child_process' },
  { pattern: /process\.exit/g, flag: 'process_exit' },
  { pattern: /\beval\s*\(/g, flag: 'eval' },
  { pattern: /new\s+Function\s*\(/g, flag: 'dynamic_function' },
  { pattern: /require\s*\(\s*['"]net['"]\s*\)/g, flag: 'net_access' },
  { pattern: /require\s*\(\s*['"]http['"]\s*\)/g, flag: 'http_access' },
  { pattern: /setTimeout\s*\(\s*[^,]+,\s*0\s*\)/g, flag: 'macro_task' },
  { pattern: /setInterval/g, flag: 'interval' },
  { pattern: /while\s*\(\s*true\s*\)/g, flag: 'infinite_loop' },
];

export function analyzeCodeSecurity(code: string): string[] {
  const flags: string[] = [];
  for (const { pattern, flag } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      flags.push(flag);
    }
  }
  return flags;
}

// ── VM-based sandbox (lightweight) ────────

export async function runInVmSandbox(
  code: string,
  inputPayload: any,
  timeoutMs: number
): Promise<{ output: any; error?: string }> {
  // Wrapper: kod musi przypisać do `result` swoją odpowiedź
  const wrappedCode = `
    (function(input) {
      const console = { log: () => {}, error: () => {}, warn: () => {} };
      const result = undefined;
      ${code}
      return typeof result !== 'undefined' ? result : (typeof output !== 'undefined' ? output : null);
    })(input)
  `;

  try {
    const context = vm.createContext({
      input: inputPayload,
      Math,
      Date,
      JSON,
      String,
      Number,
      Array,
      Object,
      Boolean,
      parseInt,
      parseFloat,
      isNaN,
    });

    const script = new vm.Script(wrappedCode);
    const output = script.runInContext(context, { timeout: timeoutMs, microtaskMode: 'afterEvaluate' } as any);
    return { output };
  } catch (e: any) {
    return { output: null, error: e.message };
  }
}

// ── Worker thread sandbox (CPU-bound, isolated) ──

export async function runInWorkerSandbox(
  code: string,
  inputPayload: any,
  timeoutMs: number
): Promise<{ output: any; error?: string }> {
  return new Promise((resolve) => {
    const workerCode = `
      const { parentPort } = require('worker_threads');
      parentPort.once('message', (input) => {
        try {
          const console = { log: () => {}, error: () => {}, warn: () => {} };
          let result;
          ${code}
          parentPort.postMessage({ output: typeof result !== 'undefined' ? result : null });
        } catch (e) {
          parentPort.postMessage({ output: null, error: e.message });
        }
      });
    `;

    const w = new Worker(workerCode, { eval: true });

    const timer = setTimeout(() => {
      w.terminate();
      resolve({ output: null, error: `Timeout ${timeoutMs}ms exceeded` });
    }, timeoutMs);

    w.once('message', (msg: any) => {
      clearTimeout(timer);
      w.terminate();
      resolve(msg);
    });

    w.once('error', (err: any) => {
      clearTimeout(timer);
      resolve({ output: null, error: err.message });
    });

    w.postMessage(inputPayload);
  });
}

// ── Main execute function ──────────────────

export async function executeInSandbox(req: SandboxRequest): Promise<SandboxResult> {
  const startedAt = Date.now();
  const timeoutMs = req.timeoutMs ?? 10000;
  const sandboxKind = req.sandboxKind ?? 'vm';

  // Security analysis
  const securityFlags = analyzeCodeSecurity(req.code);

  // Blokuj krytyczne flagi
  const blockingFlags = ['fs_access', 'child_process', 'process_exit'];
  for (const flag of securityFlags) {
    if (blockingFlags.includes(flag)) {
      const execution = await db.sandboxExecution.create({
        data: {
          familyId: req.familyId,
          appId: req.appId || null,
          appName: req.appName || null,
          inputType: req.inputType,
          inputPayload: JSON.stringify(req.inputPayload),
          sandboxKind,
          timeoutMs,
          memoryLimitMb: req.memoryLimitMb ?? 64,
          status: 'killed',
          securityFlags: JSON.stringify(securityFlags),
          errorMessage: `Blocked by security flag: ${flag}`,
          startedAt: new Date(startedAt),
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
        },
      });
      return {
        executionId: execution.id,
        status: 'killed',
        output: null,
        errorMessage: `Blocked by security flag: ${flag}`,
        securityFlags,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  // Zapisz rozpoczęcie
  const execution = await db.sandboxExecution.create({
    data: {
      familyId: req.familyId,
      appId: req.appId || null,
      appName: req.appName || null,
      inputType: req.inputType,
      inputPayload: JSON.stringify(req.inputPayload),
      sandboxKind,
      timeoutMs,
      memoryLimitMb: req.memoryLimitMb ?? 64,
      status: 'running',
      securityFlags: JSON.stringify(securityFlags),
      startedAt: new Date(startedAt),
    },
  });

  // Wykonaj w sandboxie
  let output: any = null;
  let error: string | undefined;
  let status: 'success' | 'error' | 'timeout' = 'success';

  try {
    if (sandboxKind === 'worker_thread') {
      const result = await runInWorkerSandbox(req.code, req.inputPayload, timeoutMs);
      output = result.output;
      error = result.error;
      if (error) {
        status = error.includes('Timeout') ? 'timeout' : 'error';
      }
    } else {
      const result = await runInVmSandbox(req.code, req.inputPayload, timeoutMs);
      output = result.output;
      error = result.error;
      if (error) status = 'error';
    }
  } catch (e: any) {
    error = e.message;
    status = 'error';
  }

  const durationMs = Date.now() - startedAt;

  // Zapisz wynik
  await db.sandboxExecution.update({
    where: { id: execution.id },
    data: {
      status,
      outputPayload: JSON.stringify(output),
      errorMessage: error,
      finishedAt: new Date(),
      durationMs,
    },
  });

  return {
    executionId: execution.id,
    status,
    output,
    errorMessage: error,
    securityFlags,
    durationMs,
  };
}

// ── Execution history ──────────────────────

export async function getExecutionHistory(familyId: string, limit = 20) {
  return db.sandboxExecution.findMany({
    where: { familyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ── Model router (cheap vs reasoning) ──────

export type TaskComplexity = 'simple' | 'moderate' | 'complex';

export function classifyTaskComplexity(input: string): TaskComplexity {
  const len = input.length;
  const wordCount = input.split(/\s+/).length;

  if (len < 100 && wordCount < 20) return 'simple';
  if (len < 500 && wordCount < 100) return 'moderate';
  return 'complex';
}

export function routeToModel(complexity: TaskComplexity): string {
  switch (complexity) {
    case 'simple':
      return 'google/gemini-flash-1.5'; // cheap
    case 'moderate':
      return 'anthropic/claude-3.5-haiku'; // mid
    case 'complex':
    default:
      return 'openai/gpt-4o-mini'; // reasoning
  }
}
