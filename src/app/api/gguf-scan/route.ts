import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// GET — scan for .gguf files in common locations on the user's disk
// Returns list of full paths to .gguf files found.
export async function GET() {
  const found: string[] = [];

  // Common locations to scan (Windows + Linux + Mac)
  const home = os.homedir();
  const username = process.env.USERNAME || process.env.USER || '';

  const scanDirs = [
    home,
    path.join(home, 'Downloads'),
    path.join(home, 'Documents'),
    path.join(home, 'Desktop'),
    path.join(home, 'Models'),
    path.join(home, 'models'),
    path.join(home, 'llama.cpp'),
    path.join(home, 'llama.cpp', 'models'),
    // Windows specific
    'C:\\Models',
    'C:\\llama.cpp',
    'C:\\llama.cpp\\models',
    'C:\\Users\\' + username + '\\Downloads',
    'C:\\Users\\' + username + '\\Models',
    'D:\\Models',
    'E:\\Models',
    // Ollama storage (we can detect ollama models even if user wants gguf)
    path.join(home, '.ollama', 'models'),
    // HuggingFace cache
    path.join(home, '.cache', 'huggingface'),
  ].filter(p => {
    try { return fs.existsSync(p); } catch { return false; }
  });

  const MAX_DEPTH = 3;
  const MAX_FILES = 100;

  function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH || found.length >= MAX_FILES) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (found.length >= MAX_FILES) return;
        const full = path.join(dir, entry.name);
        try {
          if (entry.isDirectory()) {
            // Skip system / hidden dirs
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'System Volume Information') continue;
            walk(full, depth + 1);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')) {
            found.push(full);
          }
        } catch { /* permission denied etc. */ }
      }
    } catch { /* permission denied */ }
  }

  for (const d of scanDirs) {
    walk(d, 0);
  }

  return NextResponse.json({
    files: found,
    scanned: scanDirs.length,
    scanDirs: scanDirs,
  });
}
