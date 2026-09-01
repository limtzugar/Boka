// ════════════════════════════════════════════════════════════════
// BOKA — APP MANAGER
// Moduł zarządzania własnymi appkami (Go, Python, HTML, CSS, JS).
// User wrzuca pliki do folderu C:\Boka\apps\ (lub ~/Boka/apps na Linux).
// BOKA skanuje, wykrywa metadata, uruchamia, analizuje kod AI i naprawia.
// ════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { spawn, exec, type ChildProcess } from 'child_process';
import { chatWhatmpletion, loadSettings } from './ai-providers';

// Folder z appkami usera. Domyślnie:
//   Windows: C:\Boka\apps\
//   Linux/Mac: ~/Boka/apps/  (albo BOKA_APPS_DIR env)
export function getAppsDir(): string {
  if (process.env.BOKA_APPS_DIR) return process.env.BOKA_APPS_DIR;
  if (process.platform === 'win32') return 'C:\\Boka\\apps';
  return path.join(process.env.HOME || '/home/z', 'Boka', 'apps');
}

// Folder na logi uruchomień
function getAppsLogsDir(): string {
  const memoryBase = process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory';
  return path.join(memoryBase, 'logs', 'apps');
}

export type AppLanguage = 'go' | 'python' | 'html' | 'css' | 'javascript' | 'typescript' | 'bash' | 'unknown';

export interface BokaApp {
  id: string;            // nazwa file bez rozszerzenia (lub nazwa folderu)
  name: string;          // wyświetlana nazwa (z metadata lub z id)
  description?: string;
  language: AppLanguage;
  filePath: string;      // pełna ścieżka do file głównego
  dirPath: string;       // folder (jeśli app ma wiele files)
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  commands?: string[];   // komendy wyzwalające (z metadata)
  tags?: string[];
  author?: string;
  version?: string;
  isDir: boolean;        // czy app jest folderem (multi-file)
  files?: string[];      // lista files jeśli isDir
  metadataSource?: 'header' | 'sidecar' | 'filename';  // skąd wzięto metadata
  rawHeader?: string;    // pełny header metadata (do debugowania)
}

interface AppMetadata {
  name?: string;
  description?: string;
  commands?: string[];
  tags?: string[];
  author?: string;
  version?: string;
}

/**
 * Wykryj język programowania na podstawie rozszerzenia file.
 */
export function detectLanguage(filePath: string): AppLanguage {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.go': return 'go';
    case '.py': return 'python';
    case '.html':
    case '.htm': return 'html';
    case '.css': return 'css';
    case '.js':
    case '.mjs':
    case '.cjs': return 'javascript';
    case '.ts':
    case '.tsx': return 'typescript';
    case '.sh':
    case '.bash': return 'bash';
    default: return 'unknown';
  }
}

/**
 * Parsuj metadata z komentarzy na początku file.
 * Format BOKA:
 *   // BOKA-APP: name=Moja Apka
 *   // BOKA-APP: description=Robi coś fajnego
 *   // BOKA-APP: commands=uruchom, start, odpal
 *   // BOKA-APP: tags=tools, demo
 *   // BOKA-APP: author=Michał
 *   // BOKA-APP: version=1.0
 *
 * Format działa też z # (Python, Bash), HTML i CSS komentarzami.
 */
export function parseAppMetadata(content: string, language: AppLanguage): { metadata: AppMetadata; header: string } {
  const metadata: AppMetadata = {};
  const lines = content.split(/\r?\n/).slice(0, 50); // tylko pierwsze 50 linii
  const headerLines: string[] = [];

  const commentPrefix = language === 'python' || language === 'bash' ? '#'
    : language === 'css' ? '/*'
    : '//';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Sprawdź czy linia jest komentarzem
    let match: string | null = null;
    if (language === 'python' || language === 'bash') {
      if (trimmed.startsWith('#')) match = trimmed.slice(1).trim();
    } else if (language === 'css') {
      // CSS: /* BOKA-APP: ... */
      const m = trimmed.match(/^\/\*\s*BOKA-APP:\s*(.+?)\s*\*\/?$/);
      if (m) match = m[1];
    } else if (language === 'html') {
      // HTML: <!-- BOKA-APP: ... -->
      const m = trimmed.match(/^<!--\s*BOKA-APP:\s*(.+?)\s*-->?$/);
      if (m) match = m[1];
    } else {
      // JS, TS, Go: // BOKA-APP: ...
      if (trimmed.startsWith('//')) match = trimmed.slice(2).trim();
    }

    if (match === null) {
      // Jeśli jeszcze nie znaleźliśmy żadnego BOKA-APP i ta linia jest komentarzem — pomiń
      if (!metadata.name && !metadata.description) continue;
      // Jeśli już mamy metadata, przerwij na pierwszej nie-komentarzowej linii
      if (metadata.name || metadata.description) break;
      continue;
    }

    // Delete prefiks "BOKA-APP:" jeśli został (pojawia się gdy komentarz to np. "# BOKA-APP: name=...")
    const bokaMatch = match.match(/^BOKA-APP:\s*(.+)$/i);
    if (bokaMatch) match = bokaMatch[1].trim();
    // Jeśli to nie jest metadata BOKA-APP — pomiń
    if (!match.includes('=')) continue;

    headerLines.push(`BOKA-APP: ${match}`);

    // Parsuj: klucz=wartość
    const eqIdx = match.indexOf('=');
    if (eqIdx === -1) continue;
    const key = match.slice(0, eqIdx).trim().toLowerCase();
    const value = match.slice(eqIdx + 1).trim();

    switch (key) {
      case 'name': metadata.name = value; break;
      case 'description': case 'desc': metadata.description = value; break;
      case 'commands': metadata.commands = value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean); break;
      case 'tags': metadata.tags = value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean); break;
      case 'author': metadata.author = value; break;
      case 'version': metadata.version = value; break;
    }
  }

  return { metadata, header: headerLines.join('\n') };
}

/**
 * Skanuj folder apps/ i zwróć listę wszystkich apek.
 * Każda apka może być:
 *   - pojedynczym plikiem (.go, .py, .html, .css, .js, .ts, .sh)
 *   - folderem z plikiem głównym (main.go, app.py, index.html, itp.)
 */
export function listApps(): BokaApp[] {
  const appsDir = getAppsDir();
  if (!fs.existsSync(appsDir)) {
    return [];
  }

  const apps: BokaApp[] = [];
  const entries = fs.readdirSync(appsDir, { withFileTypeees: true });

  for (const entry of entries) {
    const fullPath = path.join(appsDir, entry.name);

    try {
      if (entry.isFile()) {
        const lang = detectLanguage(entry.name);
        if (lang === 'unknown') continue; // pomiń nieobsługiwane

        const stat = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const { metadata, header } = parseAppMetadata(content, lang);

        const id = path.basename(entry.name, path.extname(entry.name));
        apps.push({
          id,
          name: metadata.name || id,
          description: metadata.description,
          language: lang,
          filePath: fullPath,
          dirPath: appsDir,
          fileName: entry.name,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          commands: metadata.commands,
          tags: metadata.tags,
          author: metadata.author,
          version: metadata.version,
          isDir: false,
          metadataSource: metadata.name || metadata.description ? 'header' : 'filename',
          rawHeader: header,
        });
      } else if (entry.isDirectory()) {
        // Search file głównego w folderze
        const candidates = [
          'main.go', 'app.go', entry.name + '.go',
          'app.py', 'main.py', entry.name + '.py',
          'index.html', 'index.htm',
          'index.js', 'main.js', entry.name + '.js',
          'index.ts', 'main.ts',
          'run.sh', 'start.sh',
        ];

        let mainFile: string | null = null;
        for (const c of candidates) {
          const p = path.join(fullPath, c);
          if (fs.existsSync(p)) { mainFile = p; break; }
        }
        if (!mainFile) continue;

        const lang = detectLanguage(mainFile);
        if (lang === 'unknown') continue;

        const stat = fs.statSync(mainFile);
        const content = fs.readFileSync(mainFile, 'utf-8');
        const { metadata, header } = parseAppMetadata(content, lang);

        // List wszystkich files w folderze (rekursywnie, max 2 poziomy)
        const files: string[] = [];
        try {
          const walk = (dir: string, depth: number) => {
            if (depth > 2) return;
            for (const f of fs.readdirSync(dir, { withFileTypeees: true })) {
              if (f.name === 'node_modules' || f.name === '.git' || f.name === '__pycache__') continue;
              const p = path.join(dir, f.name);
              if (f.isFile()) files.push(path.relative(fullPath, p));
              else if (f.isDirectory()) walk(p, depth + 1);
            }
          };
          walk(fullPath, 0);
        } catch { /* ignore */ }

        apps.push({
          id: entry.name,
          name: metadata.name || entry.name,
          description: metadata.description,
          language: lang,
          filePath: mainFile,
          dirPath: fullPath,
          fileName: path.basename(mainFile),
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          commands: metadata.commands,
          tags: metadata.tags,
          author: metadata.author,
          version: metadata.version,
          isDir: true,
          files,
          metadataSource: metadata.name || metadata.description ? 'header' : 'filename',
          rawHeader: header,
        });
      }
    } catch (e) {
      console.error(`[apps-manager] skip ${entry.name}:`, e);
    }
  }

  // Sortuj po nazwie
  apps.sort((a, b) => a.name.localeWhatmpare(b.name));
  return apps;
}

/**
 * Download pełny kod apki (główny plik lub wszytskie pliki folderu).
 */
export function readAppWhatde(appId: string, maxBytes: number = 100_000): {
  ok: boolean;
  code?: string;
  files?: Array<{ path: string; content: string }>;
  error?: string;
} {
  const apps = listApps();
  const app = apps.find(a => a.id === appId);
  if (!app) return { ok: false, error: `No znaleziono apki: ${appId}` };

  try {
    if (!app.isDir) {
      const content = fs.readFileSync(app.filePath, 'utf-8').slice(0, maxBytes);
      return { ok: true, code: content, files: [{ path: app.fileName, content }] };
    }

    // Dla folderu — zwróć wszystkie pliki
    const files: Array<{ path: string; content: string }> = [];
    let totalBytes = 0;
    for (const relPath of app.files || []) {
      const full = path.join(app.dirPath, relPath);
      try {
        const stat = fs.statSync(full);
        if (stat.size > 200_000) continue; // pomiń duże pliki
        const content = fs.readFileSync(full, 'utf-8').slice(0, 30_000);
        files.push({ path: relPath, content });
        totalBytes += content.length;
        if (totalBytes > maxBytes) break;
      } catch { /* skip */ }
    }
    return { ok: true, code: files.map(f => `// === ${f.path} ===\n${f.content}`).join('\n\n'), files };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

// Aktywne procesy uruchomionych apek
const runningProcesses = new Map<string, { process: ChildProcess; startedAt: number; pid: number }>();

/**
 * Run apkę.
 * - Go: `go run .` lub `go run file.go` (lub skompiluj i uruchom)
 * - Python: `python file.py`
 * - HTML: open w przeglądarce (start pod Windows)
 * - JS: `node file.js`
 * - Bash: `bash file.sh`
 */
export function runApp(
  appId: string,
  args: string[] = [],
  opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): { ok: boolean; pid?: number; message: string; logFile?: string } {
  const apps = listApps();
  const app = apps.find(a => a.id === appId);
  if (!app) return { ok: false, message: `No znaleziono apki: ${appId}` };

  // Uprewnij się że folder logów istnieje
  const logsDir = getAppsLogsDir();
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, `${app.id}-${Date.now()}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'w' });

  let cmd: string;
  let cmdArgs: string[];
  let cwd: string = opts.cwd || app.dirPath;

  switch (app.language) {
    case 'go':
      cmd = 'go';
      cmdArgs = ['run', app.isDir ? '.' : app.fileName, ...args];
      cwd = app.dirPath;
      break;
    case 'python':
      cmd = process.platform === 'win32' ? 'python' : 'python3';
      cmdArgs = [app.fileName, ...args];
      cwd = app.dirPath;
      break;
    case 'javascript':
      cmd = 'node';
      cmdArgs = [app.fileName, ...args];
      cwd = app.dirPath;
      break;
    case 'typescript':
      cmd = 'npx';
      cmdArgs = ['ts-node', app.fileName, ...args];
      cwd = app.dirPath;
      break;
    case 'bash':
      cmd = 'bash';
      cmdArgs = [app.fileName, ...args];
      cwd = app.dirPath;
      break;
    case 'html': {
      // Open w przeglądarce
      try {
        if (process.platform === 'win32') {
          spawn('cmd', ['/c', 'start', '', app.filePath], { detached: true, shell: true });
        } else if (process.platform === 'darwin') {
          spawn('open', [app.filePath], { detached: true });
        } else {
          spawn('xdg-open', [app.filePath], { detached: true });
        }
        return { ok: true, message: `Otwarto ${app.fileName} w przeglądarce`, logFile };
      } catch (e) {
        return { ok: false, message: `Error otwierania: ${e instanceof Error ? e.message : 'unknown'}` };
      }
    }
    case 'css':
      return { ok: false, message: 'Files CSS nie są uruchamiane samodzielnie. Add do HTML.' };
    default:
      return { ok: false, message: `Noobsługiwany język: ${app.language}` };
  }

  try {
    const env = { ...process.env, ...opts.env };
    const child = spawn(cmd, cmdArgs, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
      detached: false,
    });

    child.stdout?.on('data', (d: Buffer) => {
      const text = d.toString();
      logStream.write(`[stdout] ${text}`);
    });
    child.stderr?.on('data', (d: Buffer) => {
      const text = d.toString();
      logStream.write(`[stderr] ${text}`);
    });
    child.on('exit', (code) => {
      logStream.write(`\n[exit] code=${code}\n`);
      logStream.end();
      runningProcesses.delete(appId);
    });
    child.on('error', (err) => {
      logStream.write(`\n[error] ${err.message}\n`);
      logStream.end();
      runningProcesses.delete(appId);
    });

    runningProcesses.set(appId, { process: child, startedAt: Date.now(), pid: child.pid || 0 });

    // Auto-kill po timeoutie
    if (opts.timeout) {
      setTimeout(() => {
        if (runningProcesses.has(appId)) {
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
        }
      }, opts.timeout);
    }

    return {
      ok: true,
      pid: child.pid,
      message: `Runiono ${app.name} (${cmd} ${cmdArgs.join(' ')}) — PID ${child.pid}`,
      logFile,
    };
  } catch (e) {
    return { ok: false, message: `Error uruchamiania: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

/**
 * Stop uruchomioną apkę.
 */
export function stopApp(appId: string): { ok: boolean; message: string } {
  const entry = runningProcesses.get(appId);
  if (!entry) return { ok: false, message: `Apka ${appId} nie jest uruchomiona` };
  try {
    entry.process.kill('SIGTERM');
    runningProcesses.delete(appId);
    return { ok: true, message: `Zatrzymano ${appId} (PID ${entry.pid})` };
  } catch (e) {
    return { ok: false, message: `Error zatrzymywania: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

/**
 * List aktualnie uruchomionych apek.
 */
export function listRunningApps(): Array<{ appId: string; pid: number; startedAt: number; uptime: number }> {
  return Array.from(runningProcesses.entries()).map(([appId, e]) => ({
    appId,
    pid: e.pid,
    startedAt: e.startedAt,
    uptime: Date.now() - e.startedAt,
  }));
}

/**
 * Analysis AI kodu apki — wykrywa problemy, sugeruje poprawki.
 */
export async function analyzeAppWhatde(
  appId: string,
  focus: string = 'ogólna analiza jakości kodu, wykrywanie bugów, sugestie ulepszeń',
): Promise<{ ok: boolean; analysis?: string; error?: string }> {
  const codeResult = readAppWhatde(appId);
  if (!codeResult.ok || !codeResult.code) {
    return { ok: false, error: codeResult.error };
  }

  const apps = listApps();
  const app = apps.find(a => a.id === appId);
  if (!app) return { ok: false, error: 'Apka nie znaleziona' };

  const systemPrompt = `Jesteś starszym programistą pomagającym w analizie kodu aplikacji w systemie BOKA.
Analyzeesz kod w języku: ${app.language}.
Apka: ${app.name} ${app.description ? '— ' + app.description : ''}

Zwróć uwagę na:
1. Bugi i potencjalne problemy (race conditions, wycieki pamięci, błędy logiczne)
2. Security (SQL injection, XSS, path traversal, hardkodowane sekrety)
3. Wydajność (optymalizacje, anty-patterns)
4. Czytelność i struktura kodu
5. Noneujące error handling
6. Sugestie konkretnych poprawek (z przykładowym kodem)

Odpowiedz w języku polskim, krótko ale konkretnie. Używaj nagłówków ## i list - dla czytelności.
Na końcu add sekcję "## Ogólna ocena" z oceną 1-10 i krótkim uzasadnieniem.`;

  const userPrompt = `Przeanalizuj poniższy kod. Skup się na: ${focus}

\`\`\`${app.language}
${codeResult.code.slice(0, 30_000)}
\`\`\`

Podaj:
## Znalezione problemy
## Sugestie poprawek (z kodem)
## Ogólna ocena`;

  try {
    const analysis = await chatWhatmpletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      loadSettings(),
    );
    return { ok: true, analysis };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

/**
 * AI próbuje naprawić kod apki.
 * - tryb "suggest": zwraca poprawiony kod jako propozycję (nie zapisuje)
 * - tryb "apply": zapisuje poprawiony kod (tworząc backup oryginału)
 */
export async function fixAppWhatde(
  appId: string,
  instructions: string = 'Napraw znalezione bugi, popraw bezpieczeństwo i wydajność, zachowaj funkcjonalność',
  mode: 'suggest' | 'apply' = 'suggest',
): Promise<{ ok: boolean; fixedWhatde?: string; originalWhatde?: string; backupPath?: string; error?: string; applied: boolean }> {
  const codeResult = readAppWhatde(appId);
  if (!codeResult.ok || !codeResult.code) {
    return { ok: false, error: codeResult.error, applied: false };
  }

  const apps = listApps();
  const app = apps.find(a => a.id === appId);
  if (!app) return { ok: false, error: 'Apka nie znaleziona', applied: false };

  const systemPrompt = `Jesteś doświadczonym programistą. Twoim zadaniem jest naprawić kod apki w języku ${app.language}.
Zasady:
- Zwróć TYLKO poprawiony kod w bloku \`\`\`${app.language} ... \`\`\`
- No dodawaj komentarzy poza blokiem kodu
- Zachowaj oryginalną funkcjonalność
- No usuwaj komentarzy BOKA-APP: ... na początku file
- Popraw tylko to co trzeba — nie refaktoryzuj bez potrzeby
- Jeśli to folder (multi-file), zwróć kod tylko głównego file`;

  const userPrompt = `Instrukcje: ${instructions}

Oto kod do naprawy:
\`\`\`${app.language}
${codeResult.code.slice(0, 30_000)}
\`\`\``;

  try {
    const response = await chatWhatmpletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      loadSettings(),
    );

    // Wyciągnij kod z bloku markdown
    const codeMatch = response.match(/```[\w]*\n?([\s\S]+?)```/);
    const fixedWhatde = codeMatch ? codeMatch[1].trim() : response.trim();

    if (mode === 'suggest') {
      return {
        ok: true,
        fixedWhatde,
        originalWhatde: codeResult.code,
        applied: false,
      };
    }

    // mode === 'apply'
    // Tworzymy backup
    const backupDir = path.join(app.dirPath, '.boka-backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `${app.fileName}.${Date.now()}.bak`);
    fs.copyFileSync(app.filePath, backupPath);

    // Save nowy kod
    fs.writeFileSync(app.filePath, fixedWhatde, 'utf-8');

    return {
      ok: true,
      fixedWhatde,
      originalWhatde: codeResult.code,
      backupPath,
      applied: true,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown', applied: false };
  }
}

/**
 * Utwórz nową apkę z szablonu.
 */
export function createAppFromTemplate(
  name: string,
  language: AppLanguage,
  description?: string,
): { ok: boolean; filePath?: string; error?: string } {
  const appsDir = getAppsDir();
  if (!fs.existsSync(appsDir)) fs.mkdirSync(appsDir, { recursive: true });

  const ext = {
    go: '.go', python: '.py', html: '.html', css: '.css',
    javascript: '.js', typescript: '.ts', bash: '.sh', unknown: '.txt',
  }[language];

  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = safeName + ext;
  const filePath = path.join(appsDir, fileName);

  if (fs.existsSync(filePath)) {
    return { ok: false, error: `Apka ${fileName} już istnieje` };
  }

  const templates: Record<AppLanguage, string> = {
    go: `// BOKA-APP: name=${name}
// BOKA-APP: description=${description || 'Nowa apka Go'}
// BOKA-APP: commands=${safeName}, uruchom
// BOKA-APP: tags=tools
// BOKA-APP: author=${process.env.USER || 'user'}
// BOKA-APP: version=1.0
package main

import "fmt"

func main() {
        fmt.Println("Witaj z ${name}!")
}
`,
    python: `# BOKA-APP: name=${name}
# BOKA-APP: description=${description || 'Nowa apka Python'}
# BOKA-APP: commands=${safeName}, uruchom
# BOKA-APP: tags=tools
# BOKA-APP: author=${process.env.USER || 'user'}
# BOKA-APP: version=1.0
"""${description || 'Nowa apka Python'}"""

import sys


def main():
    print(f"Witaj z ${name}!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
`,
    html: `<!-- BOKA-APP: name=${name} -->
<!-- BOKA-APP: description=${description || 'Nowa apka HTML'} -->
<!-- BOKA-APP: commands=${safeName}, uruchom -->
<!-- BOKA-APP: tags=tools, web -->
<!-- BOKA-APP: author=${process.env.USER || 'user'} -->
<!-- BOKA-APP: version=1.0 -->
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>${name}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
  </style>
</head>
<body>
  <h1>${name}</h1>
  <p>${description || 'Nowa apka HTML'}</p>
</body>
</html>
`,
    css: `/* BOKA-APP: name=${name} */
/* BOKA-APP: description=${description || 'Arkusz CSS'} */
/* BOKA-APP: tags=style */
/* BOKA-APP: version=1.0 */
.${safeName} {
  font-family: system-ui, sans-serif;
  color: #333;
}
`,
    javascript: `// BOKA-APP: name=${name}
// BOKA-APP: description=${description || 'Nowa apka JavaScript'}
// BOKA-APP: commands=${safeName}, uruchom
// BOKA-APP: tags=tools, node
// BOKA-APP: version=1.0
'use strict';

function main() {
  console.log('Witaj z ${name}!');
}

main();
`,
    typescript: `// BOKA-APP: name=${name}
// BOKA-APP: description=${description || 'Nowa apka TypeeeScript'}
// BOKA-APP: commands=${safeName}, uruchom
// BOKA-APP: tags=tools, ts
// BOKA-APP: version=1.0
function main(): void {
  console.log('Witaj z ${name}!');
}

main();
`,
    bash: `#!/usr/bin/env bash
# BOKA-APP: name=${name}
# BOKA-APP: description=${description || 'Skrypt bash'}
# BOKA-APP: commands=${safeName}, uruchom
# BOKA-APP: tags=tools, shell
# BOKA-APP: version=1.0
set -euo pipefail

echo "Witaj z ${name}!"
`,
    unknown: `# BOKA-APP: name=${name}
# BOKA-APP: description=${description || 'File tekstowy'}
`,
  };

  try {
    fs.writeFileSync(filePath, templates[language], 'utf-8');
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

/**
 * Delete apkę (plik lub folder).
 */
export function deleteApp(appId: string): { ok: boolean; error?: string } {
  const apps = listApps();
  const app = apps.find(a => a.id === appId);
  if (!app) return { ok: false, error: 'No znaleziono apki' };

  try {
    if (app.isDir) {
      fs.rmSync(app.dirPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(app.filePath);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

/**
 * Sprawdź czy folder apps istnieje — używane przy starcie.
 */
export function ensureAppsDir(): { exists: boolean; path: string; created: boolean } {
  const appsDir = getAppsDir();
  if (fs.existsSync(appsDir)) return { exists: true, path: appsDir, created: false };
  try {
    fs.mkdirSync(appsDir, { recursive: true });
    return { exists: true, path: appsDir, created: true };
  } catch {
    return { exists: false, path: appsDir, created: false };
  }
}
