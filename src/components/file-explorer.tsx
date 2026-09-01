'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FolderTree, FileText, FileCode, File, ChevronRight, ChevronDown, Home, Loader2, HardDrive, Folder, FolderOpen } from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// FileExplorer — drzewko plików PC użytkownika
// GET /api/files?path=... → { path, parent, entries: [{ name, path, isDir, size, ext, mtime }] }
// Klik na folder → toggle expand (lazy load)
// Klik na plik .txt/.html/.md/.js/.ts/.json → onOpenFile(path)
// ═══════════════════════════════════════════════════════════

interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  ext: string;
  mtime: string;
}

interface FileExplorerProps {
  /** Called when user clicks a text file */
  onOpenFile: (path: string) => void;
  /** Currently open file path (for highlight) */
  currentFilePath?: string | null;
  /** Initial path; defaults to user home */
  initialPath?: string;
}

interface DirCache {
  entries: DirEntry[];
  loading: boolean;
  error?: string;
  loaded: boolean;
}

const TEXT_EXTS = new Set([
  'txt','md','markdown','html','htm','css','js','jsx','ts','tsx',
  'json','xml','yaml','yml','csv','tsv','log','ini','conf','cfg',
  'py','rb','go','rs','java','c','cpp','h','hpp','cs','php',
  'sh','bash','zsh','ps1','bat','cmd','sql','svg','gitignore',
  'env','toml','properties','vue','svelte',
]);

function getIconForEntry(entry: DirEntry) {
  if (entry.isDir) return <Folder size={14} className="text-[#6ec6e7] shrink-0" />;
  if (TEXT_EXTS.has(entry.ext)) {
    if (['html','htm','svg','xml','vue','svelte'].includes(entry.ext)) {
      return <FileCode size={14} className="text-[#ffd93d] shrink-0" />;
    }
    if (['js','jsx','ts','tsx','py','go','rb','rs','java','c','cpp','cs','php','sh','sql'].includes(entry.ext)) {
      return <FileCode size={14} className="text-[#4ade80] shrink-0" />;
    }
    if (['json','yaml','yml','toml','ini','env','cfg','conf'].includes(entry.ext)) {
      return <FileCode size={14} className="text-[#4ade80] shrink-0" />;
    }
    return <FileText size={14} className="text-[#8888aa] shrink-0" />;
  }
  return <File size={14} className="text-[#8888aa] shrink-0" />;
}

export function FileExplorer({ onOpenFile, currentFilePath, initialPath }: FileExplorerProps) {
  // Top-level listing state
  const [rootPath, setRootPath] = useState<string>(initialPath || '');
  const [rootEntries, setRootEntries] = useState<DirEntry[]>([]);
  const [rootLoading, setRootLoading] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);

  // Expanded directories (path → children + loading state)
  const [expanded, setExpanded] = useState<Record<string, DirCache>>({});

  // Ref for top scroll container
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load root
  const loadRoot = useCallback(async (p?: string) => {
    setRootLoading(true);
    setRootError(null);
    try {
      const url = p ? `/api/files?path=${encodeURIComponent(p)}` : '/api/files';
      const r = await fetch(url);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setRootPath(data.path);
      setRootEntries(data.entries || []);
    } catch (e: any) {
      setRootError(e?.message || 'Błąd');
    } finally {
      setRootLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoot(initialPath);
  }, [initialPath, loadRoot]);

  const toggleDir = useCallback(async (dirPath: string) => {
    setExpanded(prev => {
      // Already loaded → just toggle visibility
      const existing = prev[dirPath];
      if (existing && existing.loaded) {
        return { ...prev, [dirPath]: { ...existing, loading: false } };
      }
      // Not loaded → fetch
      return { ...prev, [dirPath]: { entries: [], loading: true, loaded: false } };
    });

    // Need to fetch
    const existing = expanded[dirPath];
    if (existing && existing.loaded) return;

    try {
      const r = await fetch(`/api/files?path=${encodeURIComponent(dirPath)}`);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setExpanded(prev => ({
        ...prev,
        [dirPath]: { entries: data.entries || [], loading: false, loaded: true },
      }));
    } catch (e: any) {
      setExpanded(prev => ({
        ...prev,
        [dirPath]: { entries: [], loading: false, loaded: true, error: e?.message || 'Błąd' },
      }));
    }
  }, [expanded]);

  const collapseDir = useCallback((dirPath: string) => {
    setExpanded(prev => {
      const next = { ...prev };
      delete next[dirPath];
      return next;
    });
  }, []);

  // Recursive tree renderer
  const renderDir = (entries: DirEntry[], depth: number): React.ReactNode => {
    return entries
      .filter(e => e.isDir || TEXT_EXTS.has(e.ext))
      .map(entry => {
        const isExpanded = !!expanded[entry.path];
        const cache = expanded[entry.path];
        const isOpen = currentFilePath === entry.path;

        return (
          <div key={entry.path}>
            <button
              onClick={() => entry.isDir ? (isExpanded ? collapseDir(entry.path) : toggleDir(entry.path)) : onOpenFile(entry.path)}
              className={`w-full text-left flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-mono transition-colors hover:bg-[#252535] ${
                isOpen ? 'bg-[#6ec6e7]/15 text-[#6ec6e7]' : 'text-[#8888aa]'
              }`}
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
              title={entry.path}
            >
              {entry.isDir ? (
                <span className="shrink-0 w-3 flex justify-center">
                  {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </span>
              ) : (
                <span className="shrink-0 w-3" />
              )}
              {getIconForEntry(entry)}
              <span className="truncate">{entry.name}</span>
            </button>
            {entry.isDir && isExpanded && cache && (
              <div>
                {cache.loading && (
                  <div className="text-[10px] text-[#8888aa] font-mono py-0.5" style={{ paddingLeft: `${(depth + 1) * 12 + 6}px` }}>
                    <Loader2 size={9} className="inline animate-spin mr-1" /> Ładowanie...
                  </div>
                )}
                {cache.error && (
                  <div className="text-[10px] text-[#ff6b6b] font-mono py-0.5" style={{ paddingLeft: `${(depth + 1) * 12 + 6}px` }}>
                    {cache.error}
                  </div>
                )}
                {!cache.loading && !cache.error && cache.entries.length === 0 && (
                  <div className="text-[10px] text-[#8888aa] font-mono py-0.5" style={{ paddingLeft: `${(depth + 1) * 12 + 6}px` }}>
                    (puste)
                  </div>
                )}
                {!cache.loading && cache.entries.length > 0 && renderDir(cache.entries, depth + 1)}
              </div>
            )}
          </div>
        );
      });
  };

  return (
    <div className="h-full flex flex-col bg-[#181828]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#383850] flex items-center gap-0">
        <FolderTree size={14} style={{ color: '#6ec6e7' }} />
        <span className="text-xs font-mono" style={{ color: '#6ec6e7' }}>EXPLORER</span>
      </div>

      {/* Path breadcrumb */}
      <div className="px-2 py-1.5 border-b border-[#383850] flex items-center gap-1 text-[9px] font-mono text-[#8888aa]">
        <button
          onClick={() => loadRoot()}
          title="Katalog domowy"
          className="hover:text-[#6ec6e7] transition-colors"
        >
          <Home size={11} />
        </button>
        <span className="truncate" title={rootPath}>{rootPath || '...'}</span>
      </div>

      {/* Tree */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-1">
        {rootLoading && (
          <div className="text-center py-4 text-[10px] text-[#8888aa] font-mono">
            <Loader2 size={12} className="inline animate-spin mr-1" /> Ładowanie...
          </div>
        )}
        {rootError && (
          <div className="px-2 py-2 text-[10px] text-[#ff6b6b] font-mono">{rootError}</div>
        )}
        {!rootLoading && !rootError && rootEntries.length === 0 && (
          <div className="text-center py-4 text-[10px] text-[#8888aa] font-mono">
            (pusty katalog)
          </div>
        )}
        {!rootLoading && rootEntries.length > 0 && renderDir(rootEntries, 0)}
      </div>

      {/* Footer */}
      <div className="px-2 py-1 border-t border-[#383850] text-[9px] text-[#8888aa] font-mono">
        {rootEntries.filter(e => e.isDir).length} katalogów · {rootEntries.filter(e => !e.isDir).length} plików
      </div>
    </div>
  );
}
