// ═══════════════════════════════════════════════════════════
// BOKA OS — PocketFlow-inspired Flow Framework
// ═══════════════════════════════════════════════════════════
//
// Źródło: github.com/pocketflow-ai/pocketflow (100 LOC, zero deps)
// Adaptacja: TypeScript-first dla Next.js, silnie typowany shared store.
//
// Lifecycle Noda: prep() → exec() → post()
//   - prep(shared): zbierz dane ze shared store, zwróć prepRes
//   - exec(prepRes): wykonaj logikę, zwróć execRes
//   - post(shared, prepRes, execRes): zapisz wynik do shared, zwróć action string
//
// Flow: graf Node'ów połączonych akcjami (action strings).
//   Flow.run(shared) wykonuje graf aż do terminalnej akcji (null/undefined).
// ═══════════════════════════════════════════════════════════

// ── Shared store — kontekst przepływający przez Flow ──

export interface BokaFlowState {
  // Identyfikacja
  familyId: string;
  memberId?: string;
  date: Date;

  // Dane wejściowe
  userInput?: string;
  trigger?: string; // 'ritual: morning_briefing', 'proactive:greeting', etc.

  // Kontekst (uzupełniany przez Node'y)
  soulProfile?: any;
  memories?: any[];
  weather?: any;
  calendar?: any[];
  reminders?: any[];
  plans?: any[];

  // Output
  output?: string;
  outputStructured?: any;

  // Metadane wykonania
  startedAt: number;
  stepsTaken: string[];
  errors: string[];
}

export function createFlowState(partial: Partial<BokaFlowState> & { familyId: string }): BokaFlowState {
  return {
    date: new Date(),
    startedAt: Date.now(),
    stepsTaken: [],
    errors: [],
    ...partial,
  };
}

// ── Node base class (jak PocketFlow.Node) ──

export abstract class Node<TPrep = any, TExec = any> {
  abstract prep(shared: BokaFlowState): Promise<TPrep> | TPrep;
  abstract exec(prepRes: TPrep): Promise<TExec> | TExec;
  abstract post(shared: BokaFlowState, prepRes: TPrep, execRes: TExec): Promise<string | null> | string | null;

  /** Sukcesorzy: action → następny Node */
  protected successors: Map<string, Node> = new Map();

  /** Default successor (gdy post zwraca null lub akcję bez mapowania) */
  protected defaultSuccessor?: Node;

  on(action: string, node: Node): this {
    this.successors.set(action, node);
    return this;
  }

  default(node: Node): this {
    this.defaultSuccessor = node;
    return this;
  }

  /** Zwróć następny Node dla akcji */
  next(action: string | null): Node | null {
    if (!action) return null;
    if (this.successors.has(action)) return this.successors.get(action)!;
    return this.defaultSuccessor ?? null;
  }
}

// ── Batch Node (iteruje po liście) ────────

export abstract class BatchNode<TItem = any, TExec = any> extends Node<TItem[], TExec[]> {
  async runBatch(items: TItem[]): Promise<TExec[]> {
    const results: TExec[] = [];
    for (const item of items) {
      results.push(await this.execItem(item));
    }
    return results;
  }

  abstract execItem(item: TItem): Promise<TExec> | TExec;
}

// ── Flow (graf Node'ów) ───────────────────

export class Flow {
  private startNode: Node;
  private maxSteps: number;

  constructor(startNode: Node, maxSteps = 20) {
    this.startNode = startNode;
    this.maxSteps = maxSteps;
  }

  async run(shared: BokaFlowState): Promise<BokaFlowState> {
    let current: Node | null = this.startNode;
    let steps = 0;

    while (current && steps < this.maxSteps) {
      steps++;
      const nodeName = current.constructor.name;
      shared.stepsTaken.push(nodeName);

      try {
        const prepRes = await current.prep(shared);
        const execRes = await current.exec(prepRes);
        const action = await current.post(shared, prepRes, execRes);
        current = current.next(action);
      } catch (e: any) {
        shared.errors.push(`${nodeName}: ${e.message}`);
        // Próbujemy kontynuować — Flow jest odporny
        if (current) current = current.next('error');
      }
    }

    if (steps >= this.maxSteps) {
      shared.errors.push(`Flow hit maxSteps=${this.maxSteps}`);
    }

    return shared;
  }
}

// ── Helper: utwórz prosty Node z funkcji ──

export class LambdaNode extends Node<any, any> {
  constructor(
    private prepFn: (s: BokaFlowState) => Promise<any> | any,
    private execFn: (p: any) => Promise<any> | any,
    private postFn: (s: BokaFlowState, p: any, e: any) => Promise<string | null> | string | null,
  ) {
    super();
  }
  async prep(s: BokaFlowState) { return this.prepFn(s); }
  async exec(p: any) { return this.execFn(p); }
  async post(s: BokaFlowState, p: any, e: any) { return this.postFn(s, p, e); }
}

// ── Built-in Node'y BOKA ──────────────────

import { db } from '@/lib/db';

/** Fetch ostatnie wspomnienia membera */
export class FetchRecentMemoriesNode extends Node<{ memberId?: string; familyId: string }, any[]> {
  async prep(shared: BokaFlowState) {
    return { memberId: shared.memberId, familyId: shared.familyId };
  }
  async exec(prepRes: { memberId?: string; familyId: string }) {
    const where: any = { familyId: prepRes.familyId, validUntil: null };
    if (prepRes.memberId) where.memberId = prepRes.memberId;
    return db.memoryEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }
  async post(shared: BokaFlowState, _: any, memories: any[]) {
    shared.memories = memories;
    return null;
  }
}

/** Compose wiadomość końcową */
export class ComposeMessageNode extends Node<void, string> {
  async prep(shared: BokaFlowState) {}
  async exec() { return ''; }
  async post(shared: BokaFlowState, _: void, __: string) {
    // Domyślnie: zwracamy output z shared, lub składamy z memory context
    shared.output = shared.output || `Cześć! ${shared.memories?.length || 0} wspomnień w kontekście.`;
    return null;
  }
}

// ── Example Flow: morning briefing ────────

export async function runMorningBriefing(familyId: string, memberId?: string): Promise<BokaFlowState> {
  const fetchMemories = new FetchRecentMemoriesNode();
  const compose = new ComposeMessageNode();

  fetchMemories.default(compose);

  const flow = new Flow(fetchMemories);
  const shared = createFlowState({ familyId, memberId, trigger: 'ritual:morning_briefing' });
  return flow.run(shared);
}
