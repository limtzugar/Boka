'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, Upload, Trash2, Loader2, AlertTriangle, Sparkles,
  Send, FilePlus, FileCode, FolderOpen, ChevronRight, X,
  CheckCircle, Shield, BookOpen, Briefcase, Building2, PenTool,
  RefreshCw, Eye, Download,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// BOKA OS v0.3.15 — Document AI Tab
// Umowy + dokumenty księgowe/administracyjne
// Obszary prawa: rodzinne · budowlane · prawa autorskie
// ═══════════════════════════════════════════════════════════

type SubView = 'list' | 'preview' | 'generate' | 'generated-list' | 'generated-preview';

interface DocListItem {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  documentKind: string | null;
  legalArea: string | null;
  hasAnalysis: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface FullDoc {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  documentText: string | null;
  ocrConfidence: number | null;
  ocrEngine: string | null;
  documentKind: string | null;
  legalArea: string | null;
  analysis: any;
  analyzedAt: string | null;
  tags: string[];
  qaHistory: { id: string; question: string; answer: string; createdAt: string }[];
  createdAt: string;
}

interface TemplateListItem {
  id: string;
  templateKey: string;
  title: string;
  description: string | null;
  legalArea: string;
  documentKind: string;
  fields: any[];
  isBuiltIn: boolean;
  usageCount: number;
}

interface GeneratedDoc {
  id: string;
  title: string;
  legalArea: string;
  documentKind: string;
  finalText: string;
  fieldsValues: string;
  createdAt: string;
}

const LEGAL_AREA_LABELS: Record<string, string> = {
  family: 'Prawo rodzinne',
  construction: 'Prawo budowlane',
  copyright: 'Prawa autorskie',
  mixed: 'Mieszane',
  admin: 'Administracyjne',
  other: 'Inne',
};

const LEGAL_AREA_COLORS: Record<string, string> = {
  family: '#6ee77c',
  construction: '#e7d76e',
  copyright: '#6ec6e7',
  mixed: '#a855f7',
  admin: '#6ee7b2',
  other: '#6b6b8d',
};

const LEGAL_AREA_ICONS: Record<string, any> = {
  family: BookOpen,
  construction: Building2,
  copyright: PenTool,
  mixed: Briefcase,
  admin: FileText,
  other: FileCode,
};

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(s: string): string {
  try {
    const d = new Date(s);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return s; }
}

// ─────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────

export function DocumentsTab() {
  const [subView, setSubView] = useState<SubView>('list');
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [currentDoc, setCurrentDoc] = useState<FullDoc | null>(null);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [currentGenerated, setCurrentGenerated] = useState<GeneratedDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterArea, setFilterArea] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/documents/list');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setDocs(data.documents || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd listy');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTemplates = useCallback(async () => {
    try {
      const url = filterArea ? `/api/documents/templates?legalArea=${filterArea}` : '/api/documents/templates';
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd szablonów');
    }
  }, [filterArea]);

  const refreshGenerated = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/documents/generated');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setGeneratedDocs(data.documents || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd listy');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshDocs(); }, [refreshDocs]);
  useEffect(() => { refreshTemplates(); }, [refreshTemplates]);
  useEffect(() => { if (subView === 'generated-list') refreshGenerated(); }, [subView, refreshGenerated]);

  // ── Upload file ──
  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name.replace(/\.[^.]+$/, ''));
        formData.append('tags', JSON.stringify([]));
        const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Upload failed: ${file.name}`);
        }
      }
      await refreshDocs();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd uploadu');
    } finally {
      setLoading(false);
    }
  }, [refreshDocs]);

  // ── Open document for preview ──
  const openDoc = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/read?id=${id}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setCurrentDoc(data.document);
      setSubView('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd otwarcia');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Delete document ──
  const deleteDoc = useCallback(async (id: string) => {
    if (!confirm('Usunąć dokument? Tej operacji nie można cofnąć.')) return;
    try {
      await fetch('/api/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await refreshDocs();
      if (currentDoc?.id === id) {
        setCurrentDoc(null);
        setSubView('list');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd usuwania');
    }
  }, [refreshDocs, currentDoc]);

  // ── Trigger analysis ──
  const analyzeDoc = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/documents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || 'Błąd analizy');
      }
      // Refresh doc
      await openDoc(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd analizy');
    } finally {
      setLoading(false);
    }
  }, [openDoc]);

  // ── Generated doc download ──
  const downloadGenerated = useCallback((doc: GeneratedDoc) => {
    const blob = new Blob([doc.finalText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^\w\sąćęłńóśźż]/gi, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex overflow-hidden bg-[#181828] text-[#e8e8f5]">
      {/* ─── LEFT: Sub-nav (240px) ─── */}
      <aside className="w-60 shrink-0 border-r border-[#383850] bg-[#181828] flex flex-col">
        <div className="px-3 py-3 border-b border-[#383850]">
          <h2 className="font-pixel text-xs" style={{ color: '#ffd93d' }}>DOKUMENTY</h2>
          <div className="text-[9px] text-[#8888aa] font-mono mt-1">v0.3.15 · Document AI</div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <NavButton
            active={subView === 'list' || subView === 'preview'}
            onClick={() => { setSubView('list'); setCurrentDoc(null); }}
            icon={<FolderOpen size={14} />}
            label="Moje dokumenty"
            count={docs.length}
            color="#6ee77c"
          />
          <NavButton
            active={subView === 'generate'}
            onClick={() => setSubView('generate')}
            icon={<FilePlus size={14} />}
            label="Generuj umowę"
            color="#6ec6e7"
          />
          <NavButton
            active={subView === 'generated-list' || subView === 'generated-preview'}
            onClick={() => setSubView('generated-list')}
            icon={<FileCode size={14} />}
            label="Wygenerowane"
            count={generatedDocs.length}
            color="#a855f7"
          />
        </nav>

        {/* Legal areas legend */}
        <div className="p-2 border-t border-[#383850] text-[8px] font-mono leading-relaxed">
          <div className="text-[#8888aa] uppercase mb-1.5">Obszary prawa:</div>
          <div className="space-y-0.5">
            {Object.entries(LEGAL_AREA_LABELS).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LEGAL_AREA_COLORS[k] }} />
                <span style={{ color: LEGAL_AREA_COLORS[k] }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 bg-[#ff6b6b]/10 border-b border-[#ff6b6b]/30 text-[10px] font-mono text-[#ff6b6b] flex items-center justify-between">
 <span> {error}</span>
            <button onClick={() => setError(null)} className="hover:text-[#e8e8f5]"><X size={11} /></button>
          </div>
        )}

        {/* Loading banner */}
        {loading && (
          <div className="px-4 py-1.5 bg-[#a855f7]/10 border-b border-[#a855f7]/30 text-[10px] font-mono text-[#a855f7] flex items-center gap-0">
            <Loader2 size={11} className="animate-spin" />
            Przetwarzanie...
          </div>
        )}

        {/* Sub-view content */}
        <div className="flex-1 overflow-y-auto">
          {(subView === 'list' || subView === 'preview') && (
            <DocumentsListView
              docs={docs}
              onUpload={handleUpload}
              onOpen={openDoc}
              onDelete={deleteDoc}
              fileInputRef={fileInputRef as any}
              previewDoc={subView === 'preview' ? currentDoc : null}
              onAnalyze={analyzeDoc}
              onBack={() => { setSubView('list'); setCurrentDoc(null); }}
            />
          )}
          {subView === 'generate' && (
            <GenerateView templates={templates} onGenerated={async (id) => {
              await refreshGenerated();
              const res = await fetch(`/api/documents/generated?id=${id}`);
              if (res.ok) {
                const d = await res.json();
                setCurrentGenerated(d.document);
                setSubView('generated-preview');
              }
            }} />
          )}
          {subView === 'generated-list' && (
            <GeneratedListView
              docs={generatedDocs}
              onOpen={async (id) => {
                const res = await fetch(`/api/documents/generated?id=${id}`);
                if (res.ok) {
                  const d = await res.json();
                  setCurrentGenerated(d.document);
                  setSubView('generated-preview');
                }
              }}
              onRefresh={refreshGenerated}
            />
          )}
          {subView === 'generated-preview' && currentGenerated && (
            <GeneratedPreviewView
              doc={currentGenerated}
              onBack={() => setSubView('generated-list')}
              onDownload={downloadGenerated}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// NAV BUTTON
// ─────────────────────────────────────────────────────────

function NavButton({ active, onClick, icon, label, count, color }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-[11px] font-mono transition-all border-l-2 flex items-center gap-0 ${
        active
          ? 'bg-[#252535] border-l-2'
          : 'text-[#8888aa] border-transparent hover:bg-[#1a1a28] hover:text-[#e8e8f5]'
      }`}
      style={active ? { color, borderColor: color, backgroundColor: `${color}1a` } : undefined}
    >
      <span style={{ color: active ? color : undefined }}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[9px] opacity-70">{count}</span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// DOCUMENTS LIST VIEW (with optional preview pane)
// ─────────────────────────────────────────────────────────

function DocumentsListView({
  docs, onUpload, onOpen, onDelete, fileInputRef, previewDoc, onAnalyze, onBack,
}: {
  docs: DocListItem[];
  onUpload: (files: FileList | null) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  previewDoc: FullDoc | null;
  onAnalyze: (id: string) => void;
  onBack: () => void;
}) {
  if (previewDoc) {
    return <DocumentPreviewView doc={previewDoc} onBack={onBack} onAnalyze={onAnalyze} />;
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); onUpload(e.dataTransfer.files); }}
        className="mb-6 p-6 border-2 border-dashed border-[#383850]  text-center hover:border-[#e7d76e]/50 transition-all cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={32} className="mx-auto mb-2 text-[#ffd93d]" />
        <div className="text-sm text-[#e8e8f5] font-mono">Przeciągnij umowę PDF lub skan (jpg/png)</div>
        <div className="text-[10px] text-[#8888aa] font-mono mt-1">
          Wspierane: PDF, PNG, JPG, WEBP, TIFF, TXT · max 15MB
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.bmp,.txt,.md"
          onChange={(e) => onUpload(e.target.files)}
          className="hidden"
        />
      </div>

      {/* Documents list */}
      {docs.length === 0 ? (
        <div className="text-center py-12 text-[#8888aa] font-mono text-sm">
          <FileText size={48} className="mx-auto mb-2 opacity-30" />
          Brak dokumentów. Prześlij pierwszy plik powyżej.
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const Icon = LEGAL_AREA_ICONS[doc.legalArea || 'other'] || FileText;
            const color = LEGAL_AREA_COLORS[doc.legalArea || 'other'] || '#6b6b8d';
            return (
              <div
                key={doc.id}
                className="p-2  border border-[#383850] bg-[#1a1a28] hover:bg-[#252535] transition-all cursor-pointer flex items-center gap-0"
                onClick={() => onOpen(doc.id)}
              >
                <div
                  className="w-10 h-10  flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${color}1a`, border: `1px solid ${color}40`, color }}
                >
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#e8e8f5] truncate">{doc.title}</div>
                  <div className="text-[10px] text-[#8888aa] font-mono flex items-center gap-0 mt-0.5">
                    <span>{doc.fileName}</span>
                    <span>·</span>
                    <span>{formatBytes(doc.fileSize)}</span>
                    <span>·</span>
                    <span>{formatDate(doc.createdAt)}</span>
                    {doc.documentKind && (
                      <>
                        <span>·</span>
                        <span style={{ color }}>{doc.documentKind}</span>
                      </>
                    )}
                  </div>
                </div>
                {doc.hasAnalysis ? (
                  <span className="px-2 py-1  text-[9px] font-mono bg-[#6ee77c]/10 text-[#4ade80] border border-[#6ee77c]/30 flex items-center gap-1">
                    <CheckCircle size={9} /> analiza
                  </span>
                ) : (
                  <span className="px-2 py-1  text-[9px] font-mono bg-[#2a2a3a] text-[#8888aa]">
                    bez analizy
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                  className="text-[#8888aa] hover:text-[#ff6b6b] p-1"
                  title="Usuń"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// DOCUMENT PREVIEW VIEW (text + analysis + Q&A)
// ─────────────────────────────────────────────────────────

function DocumentPreviewView({ doc, onBack, onAnalyze }: {
  doc: FullDoc;
  onBack: () => void;
  onAnalyze: (id: string) => void;
}) {
  const [qaInput, setQaInput] = useState('');
  const [qaAnswer, setQaAnswer] = useState<string | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const color = LEGAL_AREA_COLORS[doc.legalArea || 'other'] || '#6b6b8d';
  const areaLabel = LEGAL_AREA_LABELS[doc.legalArea || 'other'] || 'Inne';

  const askQuestion = useCallback(async () => {
    if (!qaInput.trim()) return;
    setQaLoading(true);
    setQaAnswer(null);
    try {
      const res = await fetch('/api/documents/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, question: qaInput.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Błąd Q&A');
      }
      const data = await res.json();
      setQaAnswer(data.answer);
      setQaInput('');
      // Refresh doc to get updated Q&A history
      setTimeout(async () => {
        const r = await fetch(`/api/documents/read?id=${doc.id}`);
        if (r.ok) {
          const d = await r.json();
          // Replace doc but keep view
        }
      }, 100);
    } catch (e) {
      setQaAnswer(`Błąd: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setQaLoading(false);
    }
  }, [qaInput, doc.id]);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Back button + title */}
      <button onClick={onBack} className="text-[10px] font-mono text-[#8888aa] hover:text-[#e8e8f5] mb-2 flex items-center gap-1">
        <ChevronRight size={11} className="rotate-180" /> Wróć do listy
      </button>

      <div className="mb-2 flex items-start justify-between gap-0">
        <div className="flex-1">
          <h2 className="text-lg text-[#e8e8f5] mb-1">{doc.title}</h2>
          <div className="text-[10px] text-[#8888aa] font-mono flex items-center gap-0 flex-wrap">
            <span>{doc.fileName}</span>
            <span>·</span>
            <span>{formatBytes(doc.fileSize)}</span>
            <span>·</span>
            <span>OCR: {doc.ocrEngine || 'brak'}</span>
            {doc.ocrConfidence !== null && (
              <span className={doc.ocrConfidence > 0.7 ? 'text-[#4ade80]' : 'text-[#ffd93d]'}>
                · {Math.round(doc.ocrConfidence * 100)}%
              </span>
            )}
            {doc.documentKind && (
              <>
                <span>·</span>
                <span style={{ color }}>{doc.documentKind}</span>
              </>
            )}
            <span>·</span>
            <span style={{ color }}>{areaLabel}</span>
          </div>
        </div>
        {!doc.analysis ? (
          <button
            onClick={() => onAnalyze(doc.id)}
            className="px-3 py-2  bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/50 text-xs font-mono hover:bg-[#a855f7]/30 flex items-center gap-1.5"
          >
            <Sparkles size={12} /> Analizuj prawnie
          </button>
        ) : (
          <button
            onClick={() => onAnalyze(doc.id)}
            className="px-3 py-2  bg-[#252535] text-[#8888aa] border border-[#383850] text-xs font-mono hover:text-[#a855f7] flex items-center gap-1.5"
          >
            <RefreshCw size={12} /> Ponów analizę
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-0">
        {/* LEFT: Document text */}
        <div>
          <h3 className="text-[10px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1">
            <FileText size={11} /> Treść dokumentu (ekstrahowana)
          </h3>
          <div className="p-2  border border-[#383850] bg-[#1a1a28] max-h-[60vh] overflow-y-auto">
            <pre className="text-[11px] text-[#e8e8f5] whitespace-pre-wrap font-mono leading-relaxed">
              {doc.documentText || '[Brak tekstu — sprawdź ekstrakcję OCR/PDF]'}
            </pre>
          </div>
        </div>

        {/* RIGHT: Analysis + Q&A */}
        <div className="space-y-2">
          {/* Analysis */}
          <div>
            <h3 className="text-[10px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1">
              <Sparkles size={11} /> Analiza prawna
            </h3>
            {doc.analysis ? (
              <AnalysisPanel analysis={doc.analysis} />
            ) : (
              <div className="p-4  border border-dashed border-[#383850] text-[11px] text-[#8888aa] font-mono text-center">
                Brak analizy. Kliknij „Analizuj prawnie" aby uruchomić LLM.
              </div>
            )}
          </div>

          {/* Q&A */}
          <div>
            <h3 className="text-[10px] font-mono uppercase text-[#8888aa] mb-2 flex items-center gap-1">
              <Send size={11} /> Zapytaj o dokument
            </h3>
            <div className="p-2  border border-[#383850] bg-[#1a1a28]">
              <div className="flex gap-0 mb-2">
                <input
                  type="text"
                  value={qaInput}
                  onChange={e => setQaInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askQuestion(); } }}
                  placeholder="Np. Jakie są obowiązki wykonawcy? Jakie kary umowne?"
                  className="flex-1 bg-[#181828] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#a855f7]/40"
                />
                <button
                  onClick={askQuestion}
                  disabled={qaLoading || !qaInput.trim()}
                  className="px-2 py-1  bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/40 text-[10px] font-mono hover:bg-[#a855f7]/30 disabled:opacity-30"
                >
                  {qaLoading ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                </button>
              </div>
              {qaAnswer && (
                <div className="p-2  bg-[#a855f7]/5 border border-[#a855f7]/20 text-[11px] text-[#e8e8f5] leading-relaxed">
                  {qaAnswer}
                </div>
              )}
              {doc.qaHistory.length > 0 && (
                <details className="mt-2">
                  <summary className="text-[9px] font-mono text-[#8888aa] cursor-pointer">
                    Historia Q&A ({doc.qaHistory.length})
                  </summary>
                  <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                    {doc.qaHistory.map(qa => (
                      <div key={qa.id} className="p-1.5  bg-[#181828] border border-[#383850] text-[10px]">
                        <div className="text-[#a855f7]">Q: {qa.question}</div>
                        <div className="text-[#e8e8f5]">A: {qa.answer.slice(0, 200)}{qa.answer.length > 200 ? '...' : ''}</div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisPanel({ analysis }: { analysis: any }) {
  return (
    <div className="p-2  border border-[#a855f7]/30 bg-[#a855f7]/5 space-y-2">
      {/* Summary */}
      <div>
        <div className="text-[9px] font-mono uppercase text-[#a855f7] mb-1">Streszczenie</div>
        <div className="text-[11px] text-[#e8e8f5] leading-relaxed">{analysis.summary}</div>
      </div>

      {/* Parties */}
      {analysis.parties?.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase text-[#a855f7] mb-1">Strony</div>
          <ul className="text-[11px] text-[#e8e8f5] space-y-0.5">
            {analysis.parties.map((p: string, i: number) => <li key={i}>• {p}</li>)}
          </ul>
        </div>
      )}

      {/* Key dates */}
      {analysis.keyDates?.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase text-[#a855f7] mb-1">Kluczowe daty</div>
          <ul className="text-[11px] text-[#e8e8f5] space-y-0.5">
            {analysis.keyDates.map((d: any, i: number) => (
              <li key={i}>• {d.label}: <span className="font-mono text-[#4ade80]">{d.date}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* Red flags */}
      {analysis.redFlags?.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase text-[#ff6b6b] mb-1 flex items-center gap-1">
            <AlertTriangle size={10} /> Red Flags
          </div>
          <ul className="text-[11px] text-[#ff6b6b] space-y-0.5">
 {analysis.redFlags.map((r: string, i: number) => <li key={i}> {r}</li>)}
          </ul>
        </div>
      )}

      {/* Risks */}
      {analysis.risks?.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase text-[#ffd93d] mb-1 flex items-center gap-1">
            <Shield size={10} /> Ryzyka
          </div>
          <ul className="text-[11px] text-[#e8e8f5] space-y-1">
            {analysis.risks.map((r: any, i: number) => (
              <li key={i} className="border-l-2 pl-2" style={{
                borderColor: r.severity === 'high' ? '#ff6b6b' : r.severity === 'medium' ? '#e7d76e' : '#6ee77c'
              }}>
                <span className="text-[10px] uppercase font-mono" style={{
                  color: r.severity === 'high' ? '#ff6b6b' : r.severity === 'medium' ? '#e7d76e' : '#6ee77c'
                }}>[{r.severity}]</span> {r.description}
                {r.recommendation && <div className="text-[#8888aa] mt-0.5">→ {r.recommendation}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key clauses */}
      {analysis.keyClauses?.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase text-[#a855f7] mb-1">Kluczowe klauzule</div>
          <ul className="text-[11px] text-[#e8e8f5] space-y-1">
            {analysis.keyClauses.map((c: any, i: number) => (
              <li key={i}>
                <div className="text-[#4ade80]">{c.title}</div>
                <div className="text-[#e8e8f5]">{c.summary}</div>
 {c.concern && <div className="text-[#ffd93d]"> {c.concern}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {analysis.recommendations?.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase text-[#4ade80] mb-1 flex items-center gap-1">
            <CheckCircle size={10} /> Rekomendacje
          </div>
          <ul className="text-[11px] text-[#e8e8f5] space-y-0.5">
 {analysis.recommendations.map((r: string, i: number) => <li key={i}> {r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// GENERATE VIEW (template selection + field filling)
// ─────────────────────────────────────────────────────────

function GenerateView({ templates, onGenerated }: {
  templates: TemplateListItem[];
  onGenerated: (id: string) => void;
}) {
  const [selectedTpl, setSelectedTpl] = useState<TemplateListItem | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [customInstructions, setCustomInstructions] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectTemplate = (tpl: TemplateListItem) => {
    setSelectedTpl(tpl);
    const defaults: Record<string, string> = {};
    tpl.fields.forEach(f => { if (f.default) defaults[f.key] = f.default; });
    setFieldValues(defaults);
  };

  const doGenerate = async () => {
    if (!selectedTpl) return;
    // Check required fields
    const missing = selectedTpl.fields.filter(f => f.required && !fieldValues[f.key]?.trim());
    if (missing.length > 0) {
      setError(`Wypełnij wymagane pola: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTpl.id,
          legalArea: selectedTpl.legalArea,
          documentKind: selectedTpl.documentKind,
          title: selectedTpl.title,
          fieldsValues: fieldValues,
          customInstructions: customInstructions.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || 'Błąd generowania');
      }
      const data = await res.json();
      onGenerated(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setGenerating(false);
    }
  };

  // Group templates by legalArea
  const grouped = templates.reduce((acc, t) => {
    const k = t.legalArea;
    if (!acc[k]) acc[k] = [];
    acc[k].push(t);
    return acc;
  }, {} as Record<string, TemplateListItem[]>);

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h2 className="font-pixel text-sm text-[#6ec6e7] mb-2">GENERATOR DOKUMENTÓW</h2>

      {!selectedTpl ? (
        // Template selection
        <div className="space-y-2">
          <div className="text-[11px] text-[#8888aa] font-mono">
            Wybierz szablon dokumentu. BOKA uzupełni pola i wygeneruje gotowy dokument prawniczym językiem.
          </div>
          {Object.entries(grouped).map(([area, tpls]) => {
            const Icon = LEGAL_AREA_ICONS[area] || FileText;
            const color = LEGAL_AREA_COLORS[area] || '#6b6b8d';
            return (
              <div key={area}>
                <div className="flex items-center gap-0 mb-2">
                  <Icon size={14} style={{ color }} />
                  <span className="text-[10px] font-mono uppercase" style={{ color }}>
                    {LEGAL_AREA_LABELS[area] || area}
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: `${color}33` }} />
                </div>
                <div className="grid grid-cols-2 gap-0">
                  {tpls.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => selectTemplate(tpl)}
                      className="text-left p-2  border border-[#383850] bg-[#1a1a28] hover:bg-[#252535] hover:border-[#6ec6e7]/30 transition-all"
                    >
                      <div className="text-sm text-[#e8e8f5] mb-0.5">{tpl.title}</div>
                      {tpl.description && (
                        <div className="text-[10px] text-[#8888aa] font-mono">{tpl.description}</div>
                      )}
                      <div className="text-[9px] text-[#8888aa] font-mono mt-1">
                        {tpl.fields.length} pól · {tpl.isBuiltIn ? 'wbudowany' : 'własny'} · użyty {tpl.usageCount}×
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {templates.length === 0 && (
            <div className="text-center text-[#8888aa] font-mono py-8">Brak szablonów</div>
          )}
        </div>
      ) : (
        // Field filling
        <div>
          <button
            onClick={() => setSelectedTpl(null)}
            className="text-[10px] font-mono text-[#8888aa] hover:text-[#e8e8f5] mb-2 flex items-center gap-1"
          >
            <ChevronRight size={11} className="rotate-180" /> Wybierz inny szablon
          </button>

          <div className="p-4  border border-[#383850] bg-[#1a1a28] mb-2">
            <div className="text-sm text-[#e8e8f5] mb-1">{selectedTpl.title}</div>
            <div className="text-[10px] font-mono" style={{ color: LEGAL_AREA_COLORS[selectedTpl.legalArea] }}>
              {LEGAL_AREA_LABELS[selectedTpl.legalArea]} · {selectedTpl.documentKind}
            </div>
            {selectedTpl.description && (
              <div className="text-[11px] text-[#8888aa] mt-1">{selectedTpl.description}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-0 mb-2">
            {selectedTpl.fields.map(field => (
              <div key={field.key} className={field.type === 'textarea' ? 'col-span-2' : ''}>
                <label className="block text-[10px] font-mono text-[#8888aa] uppercase tracking-wider mb-1">
                  {field.label} {field.required && <span className="text-[#ff6b6b]">*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={fieldValues[field.key] || ''}
                    onChange={e => setFieldValues(v => ({ ...v, [field.key]: e.target.value }))}
                    placeholder={field.hint || ''}
                    rows={3}
                    className="w-full bg-[#181828] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#6ec6e7]/40 font-mono"
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={fieldValues[field.key] || ''}
                    onChange={e => setFieldValues(v => ({ ...v, [field.key]: e.target.value }))}
                    className="w-full bg-[#181828] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] focus:outline-none focus:border-[#6ec6e7]/40 font-mono"
                  >
                    <option value="">— wybierz —</option>
                    {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                    value={fieldValues[field.key] || ''}
                    onChange={e => setFieldValues(v => ({ ...v, [field.key]: e.target.value }))}
                    placeholder={field.hint || ''}
                    className="w-full bg-[#181828] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#6ec6e7]/40 font-mono"
                  />
                )}
                {field.hint && field.type !== 'textarea' && (
                  <div className="text-[9px] text-[#8888aa] mt-0.5">{field.hint}</div>
                )}
              </div>
            ))}
          </div>

          {/* Custom instructions */}
          <div className="mb-2">
            <label className="block text-[10px] font-mono text-[#8888aa] uppercase tracking-wider mb-1">
              Dodatkowe instrukcje dla BOKA (opcjonalnie)
            </label>
            <textarea
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              placeholder="Np. dodaj klauzulę o mediacji, uwzględnij podatki VAT, wzmocnij ochronę konsumenta..."
              rows={2}
              className="w-full bg-[#181828] border border-[#383850]  px-2 py-1.5 text-[11px] text-[#e8e8f5] placeholder:text-[#5a5a78] focus:outline-none focus:border-[#6ec6e7]/40 font-mono"
            />
          </div>

          {error && (
            <div className="mb-2 p-2  bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[10px] font-mono text-[#ff6b6b]">
 {error}
            </div>
          )}

          <button
            onClick={doGenerate}
            disabled={generating}
            className="px-4 py-2  bg-[#6ec6e7]/20 text-[#6ec6e7] border border-[#6ec6e7]/50 text-sm font-mono hover:bg-[#6ec6e7]/30 disabled:opacity-30 flex items-center gap-0"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generating ? 'Generuję dokument...' : 'Generuj dokument'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// GENERATED LIST VIEW
// ─────────────────────────────────────────────────────────

function GeneratedListView({ docs, onOpen, onRefresh }: {
  docs: GeneratedDoc[];
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-pixel text-sm text-[#a855f7]">WYGENEROWANE DOKUMENTY</h2>
        <button onClick={onRefresh} className="text-[#8888aa] hover:text-[#e8e8f5]" title="Odśwież">
          <RefreshCw size={12} />
        </button>
      </div>
      {docs.length === 0 ? (
        <div className="text-center py-12 text-[#8888aa] font-mono text-sm">
          <FileCode size={48} className="mx-auto mb-2 opacity-30" />
          Brak wygenerowanych dokumentów. Użyj „Generuj umowę" aby utworzyć pierwszy.
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const color = LEGAL_AREA_COLORS[doc.legalArea] || '#6b6b8d';
            const Icon = LEGAL_AREA_ICONS[doc.legalArea] || FileCode;
            return (
              <div
                key={doc.id}
                className="p-2  border border-[#383850] bg-[#1a1a28] hover:bg-[#252535] cursor-pointer flex items-center gap-0"
                onClick={() => onOpen(doc.id)}
              >
                <div className="w-10 h-10  flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${color}1a`, border: `1px solid ${color}40`, color }}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#e8e8f5] truncate">{doc.title}</div>
                  <div className="text-[10px] text-[#8888aa] font-mono">
                    {formatDate(doc.createdAt)} · {doc.documentKind} · {doc.finalText.length} znaków
                  </div>
                </div>
                <Eye size={12} style={{ color }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// GENERATED PREVIEW VIEW
// ─────────────────────────────────────────────────────────

function GeneratedPreviewView({ doc, onBack, onDownload }: {
  doc: GeneratedDoc;
  onBack: () => void;
  onDownload: (doc: GeneratedDoc) => void;
}) {
  const color = LEGAL_AREA_COLORS[doc.legalArea] || '#6b6b8d';
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <button onClick={onBack} className="text-[10px] font-mono text-[#8888aa] hover:text-[#e8e8f5] mb-2 flex items-center gap-1">
        <ChevronRight size={11} className="rotate-180" /> Wróć do listy
      </button>

      <div className="flex items-start justify-between mb-2 gap-0">
        <div>
          <h2 className="text-lg text-[#e8e8f5] mb-1">{doc.title}</h2>
          <div className="text-[10px] text-[#8888aa] font-mono">
            {formatDate(doc.createdAt)} · <span style={{ color }}>{LEGAL_AREA_LABELS[doc.legalArea]}</span> · {doc.documentKind}
          </div>
        </div>
        <button
          onClick={() => onDownload(doc)}
          className="px-3 py-1.5  bg-[#6ee77c]/20 text-[#4ade80] border border-[#6ee77c]/40 text-xs font-mono hover:bg-[#6ee77c]/30 flex items-center gap-1.5"
        >
          <Download size={12} /> Pobierz .txt
        </button>
      </div>

      <div className="p-4  border border-[#383850] bg-[#1a1a28]">
        <pre className="text-[11px] text-[#e8e8f5] whitespace-pre-wrap font-mono leading-relaxed">
          {doc.finalText}
        </pre>
      </div>

      <div className="mt-3 p-2  bg-[#e7d76e]/5 border border-[#e7d76e]/20 text-[10px] font-mono text-[#ffd93d]">
 To nie jest porada prawna. Dokument wygenerowany przez AI — skonsultuj z adwokatem przed podpisaniem.
      </div>
    </div>
  );
}
