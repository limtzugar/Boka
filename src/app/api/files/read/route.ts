import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════
// /api/files/read — read a text file for BOKA File Viewer
// GET /api/files/read?path=C:\Users\me\file.txt
// Returns: { path, name, ext, size, content, truncated? }
// ═══════════════════════════════════════════════════════════

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx',
  'json', 'xml', 'yaml', 'yml', 'csv', 'tsv', 'log', 'ini', 'conf', 'cfg',
  'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'sql', 'svg', 'gitignore',
  'env', 'toml', 'properties', 'vue', 'svelte',
]);

const MAX_BYTES = 512 * 1024; // 512 KB cap to keep UI responsive

function getExt(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return '';
  return name.slice(dot + 1).toLowerCase();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const reqPath = url.searchParams.get('path');

  if (!reqPath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  let absPath: string;
  try {
    absPath = path.resolve(reqPath);
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const stat = await fs.stat(absPath);

    if (stat.isDirectory()) {
      return NextResponse.json({ error: 'Path is a directory, not a file' }, { status: 400 });
    }

    const ext = getExt(absPath);
    if (!TEXT_EXTENSIONS.has(ext)) {
      return NextResponse.json({
        error: `Plik .${ext} nie jest wspierany jako tekst. Wspierane: txt, md, html, js, ts, json, css, py, itp.`,
        path: absPath,
      }, { status: 415 });
    }

    if (stat.size > MAX_BYTES * 4) {
      return NextResponse.json({
        error: `Plik za duży (${(stat.size / 1024 / 1024).toFixed(1)} MB). Limit: 2 MB.`,
        path: absPath,
      }, { status: 413 });
    }

    // Read file as UTF-8 (best-effort; binary fallback not needed since ext is whitelisted)
    let content: string;
    try {
      content = await fs.readFile(absPath, 'utf-8');
    } catch {
      // Try latin-1 as fallback for files with weird encoding
      const buf = await fs.readFile(absPath);
      content = buf.toString('utf-8');
    }

    const truncated = content.length > MAX_BYTES;
    if (truncated) {
      content = content.slice(0, MAX_BYTES);
    }

    return NextResponse.json({
      path: absPath,
      name: path.basename(absPath),
      ext,
      size: stat.size,
      content,
      truncated,
      mtime: stat.mtime.toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({
      error: e?.message || 'Failed to read file',
      path: absPath,
    }, { status: 500 });
  }
}
