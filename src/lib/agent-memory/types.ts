// ═══════════════════════════════════════════════════════════
// BOKA — Agent Memory — Types
// Port z github.com/rohitg00/agentmemory, zaadaptowany do BOKA desktop.
// Zgodny schema-wise z oryginałem, ale bez iii-engine / vector DB / MCP.
// ═══════════════════════════════════════════════════════════

/** Typ pamięci semantycznej — dlaczego coś jest ważne. */
export type MemoryType =
  | 'pattern'        // powtarzający się wzorzec (np. "user woli X nad Y")
  | 'preference'     // gust, styl, narzędzie
  | 'architecture'   // decyzja architektoniczna (np. "JWT przez jose, nie jsonwebtoken")
  | 'bug'            // napotkany bug + fix
  | 'workflow'       // jak coś robimy (procedura)
  | 'fact';          // pojedynczy fakt ("user ma 40 lat")

/** Typ obserwacji — co się wydarzyło w sesji. */
export type ObservationType =
  | 'file_read'
  | 'file_write'
  | 'file_edit'
  | 'command_run'
  | 'search'
  | 'web_fetch'
  | 'conversation'
  | 'error'
  | 'decision'
  | 'discovery'
  | 'task'
  | 'other';

/** Hook lifecycle (zgodny z agentmemory + Claude Code). */
export type HookType =
  | 'session_start'
  | 'prompt_submit'
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'pre_compact'
  | 'subagent_start'
  | 'subagent_stop'
  | 'notification'
  | 'task_completed'
  | 'stop'
  | 'session_end';

/** Sesja pracy agenta (jedna konwersacja / jedno zadanie). */
export interface Session {
  id: string;
  familyId?: string;        // BOKA family scope (opcjonalne)
  project: string;          // nazwa projektu (np. "boka" / "research")
  cwd?: string;             // working directory
  startedAt: string;        // ISO
  endedAt?: string;
  status: 'active' | 'completed' | 'abandoned';
  observationCount: number;
  model?: string;
  tags?: string[];
  firstPrompt?: string;
  summary?: string;
  agentId?: string;
}

/** Surowa obserwacja — zdarzenie z hooka (tool call, prompt, etc.). */
export interface RawObservation {
  id: string;
  sessionId: string;
  familyId?: string;        // BOKA family scope (opcjonalne)
  timestamp: string;
  hookType: HookType;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  userPrompt?: string;
  assistantResponse?: string;
  raw?: unknown;
  agentId?: string;
}

/** Skompresowana obserwacja — po LLM-extraction. */
export interface CompressedObservation {
  id: string;
  sessionId: string;
  familyId?: string;        // BOKA family scope (opcjonalne)
  timestamp: string;
  type: ObservationType;
  title: string;
  subtitle?: string;
  facts: string[];
  narrative: string;
  concepts: string[];
  files: string[];
  importance: number;       // 0..1
  confidence?: number;      // 0..1
  agentId?: string;
  tags?: string[];          // BOKA dodatek — dodatkowe tagi
}

/** Widoczność memory — Persona Memory Forks (Innowacja #3). */
export type MemoryVisibility =
  | 'family'        // widoczne dla wszystkich w rodzinie (default)
  | 'child-safe'    // bezpieczne dla dzieci
  | 'adult-only'    // tylko dorośli (parent/partner)
  | 'private';      // tylko twórca (agentId)

/** Pamięć semantyczna — skonsolidowana lekcja. */
export interface Memory {
  id: string;
  familyId?: string;        // BOKA family scope (opcjonalne)
  createdAt: string;
  updatedAt: string;
  type: MemoryType;
  title: string;
  content: string;
  concepts: string[];
  files: string[];
  sessionIds: string[];
  strength: number;          // 0..10, default 7; decay z czasem
  version: number;           // 1 = oryginał, 2+ = supersede
  parentId?: string;         // poprzednia wersja, jeśli supersede
  supersedes?: string[];     // lista id zastąpionych
  relatedIds?: string[];
  sourceObservationIds?: string[];
  isLatest: boolean;         // false dla starych wersji
  forgetAfter?: string;      // ISO — kiedy auto-forget
  lastAccessedAt?: string;   // dla decay
  accessCount?: number;
  agentId?: string;
  project?: string;
  tags?: string[];
  visibility?: MemoryVisibility;  // v3: Persona Memory Forks
}

/** Audit log — każdy zapis/usunięcie/modyfikacja. */
export interface AuditEntry {
  id: string;
  familyId?: string;        // BOKA family scope (opcjonalne)
  timestamp: string;
  action: 'create' | 'update' | 'delete' | 'access' | 'forget' | 'consolidate';
  resource: 'memory' | 'observation' | 'session';
  resourceId: string;
  reason?: string;
  actor: string;             // 'system' | 'user' | 'agent' | 'auto-forget' | 'consolidation'
  metadata?: Record<string, unknown>;
}

/** Wynik wyszukiwania hybrydowego. */
export interface HybridSearchResult {
  observation: CompressedObservation;
  memory?: Memory;
  combinedScore: number;
  bm25Score: number;
  vectorScore: number;       // 0 gdy bez vector DB
  graphScore: number;        // 0 gdy bez graph
  bm25Rank: number;
  vectorRank: number;
  graphRank: number;
  graphContext?: string;
}

/** Filtry do smart-search. */
export interface SmartSearchParams {
  query: string;
  limit?: number;
  project?: string;
  agentId?: string;
  familyId?: string;          // BOKA family scope (opcjonalne)
  types?: MemoryType[];
  tags?: string[];
  includeLessons?: boolean;  // dołącz memories oprócz observations
  minStrength?: number;
  persona?: Persona;          // v3: filter by persona visibility
}

/** Aktywna persona — determinuje które memories są widoczne. */
export type Persona = 'parent' | 'partner' | 'child' | 'guest';

/** Wynik smart-search. */
export interface SmartSearchResult {
  results: HybridSearchResult[];
  query: string;
  expansion?: {
    reformulations: string[];
    entities: string[];
  };
  totalFound: number;
  latencyMs: number;
}

/** Wynik auto-forget. */
export interface AutoForgetResult {
  ttlExpired: string[];
  contradictions: Array<{
    memoryA: string;
    memoryB: string;
    similarity: number;
  }>;
  lowValueObs: string[];
  dryRun: boolean;
}

/** Wynik consolidation. */
export interface ConsolidationResult {
  tier: 'semantic' | 'procedural' | 'all';
  memoriesCreated: number;
  memoriesSuperseded: number;
  observationsConsumed: number;
  decayedMemories: number;
  skipped?: boolean;
  reason?: string;
}
