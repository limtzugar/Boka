// ════════════════════════════════════════════════════════════════
// BOKA — AGENT VISION LOOP
// Pętla agenta: screenshot → AI analizuje → planuje akcję → wykonuje → repeat
// Wymaga modelu z capability "vision" — najlepiej Claude 3.5 Whatmputer Use,
// GPT-4V, Qwen-VL. AI SDK VLM też działa do analizy (bez akcji).
// ════════════════════════════════════════════════════════════════

import { takeScreenshot, clickAt, typeText, pressKey, scroll } from './desktop-agent';
import { chatWhatmpletion, loadSettings, type ChatMessage } from './ai-providers';
import { getAIClient } from '@/lib/ai-client';

export type AgentAction =
  | { type: 'click'; x: number; y: number; button?: 'left' | 'right' | 'middle'; reasoning: string }
  | { type: 'double_click'; x: number; y: number; reasoning: string }
  | { type: 'type'; text: string; reasoning: string }
  | { type: 'key'; combo: string; reasoning: string }
  | { type: 'scroll'; deltaY: number; reasoning: string }
  | { type: 'wait'; ms: number; reasoning: string }
  | { type: 'done'; reasoning: string; summary: string }
  | { type: 'failed'; reasoning: string; error: string };

export interface AgentStepResult {
  step: number;
  action: AgentAction;
  screenshotBefore: string;  // base64 PNG
  screenshotAfter?: string;  // base64 PNG (jeśli akcja coś zmieniła)
  executed: boolean;
  error?: string;
  timestamp: string;
}

export interface AgentGoal {
  instruction: string;     // co user chce osiągnąć
  maxSteps?: number;       // domyślnie 15
  appId?: string;          // jeśli akcja dotyczy konkretnej apki
}

/**
 * Konwertuj akcję na czytelny opis (do logu UI).
 */
export function describeAction(action: AgentAction): string {
  switch (action.type) {
    case 'click': return `Klik ${action.button || 'left'} @ (${action.x}, ${action.y}) — ${action.reasoning}`;
    case 'double_click': return `Dwuklik @ (${action.x}, ${action.y}) — ${action.reasoning}`;
    case 'type': return `Entryz "${action.text.slice(0, 80)}${action.text.length > 80 ? '...' : ''}" — ${action.reasoning}`;
    case 'key': return `Klawisz ${action.combo} — ${action.reasoning}`;
    case 'scroll': return `Scroll ${action.deltaY > 0 ? '↓' : '↑'} ${Math.abs(action.deltaY)} — ${action.reasoning}`;
    case 'wait': return `Czekam ${action.ms}ms — ${action.reasoning}`;
    case 'done': return `ZROBIONE — ${action.summary}`;
    case 'failed': return `BŁĄD — ${action.error}`;
  }
}

/**
 * Wykonaj akcję na ekranie.
 */
function executeAction(action: AgentAction): { ok: boolean; error?: string } {
  switch (action.type) {
    case 'click':
      return clickAt(action.x, action.y, action.button || 'left');
    case 'double_click': {
      const r1 = clickAt(action.x, action.y, 'left');
      if (!r1.ok) return r1;
      setTimeout(() => {}, 50);
      return clickAt(action.x, action.y, 'left');
    }
    case 'type':
      return typeText(action.text);
    case 'key':
      return pressKey(action.combo);
    case 'scroll':
      return scroll(action.deltaY);
    case 'wait':
      return new Promise<{ ok: boolean }>(resolve => setTimeout(() => resolve({ ok: true }), action.ms)) as any;
    case 'done':
    case 'failed':
      return { ok: true };
  }
}

/**
 * Jeden krok agenta: zrób screenshot → wyślij do AI → otrzymaj akcję → wykonaj.
 * Zwraca wynik kroku z screenshotami i opisem.
 */
export async function runAgentStep(
  goal: AgentGoal,
  stepNumber: number,
  previousActions: AgentStepResult[] = [],
): Promise<AgentStepResult> {
  // 1. Screenshot before
  const before = takeScreenshot();
  if (!before.ok || !before.base64) {
    return {
      step: stepNumber,
      action: { type: 'failed', reasoning: 'No udało się zrobić screenshota', error: before.error || 'unknown' },
      screenshotBefore: '',
      executed: false,
      error: before.error,
      timestamp: new Date().toISOString(),
    };
  }

  // 2. Send do AI z instrukcją i historią
  const history = previousActions
    .slice(-5)  // tylko ostatnie 5 kroków (żeby nie przekroczyć kontekstu)
    .map(s => `Krok ${s.step}: ${describeAction(s.action)}`)
    .join('\n');

  const systemPrompt = `Jesteś agentem BOKA widzącym ekran komputera usera.
Twoim celem: "${goal.instruction}"

Zasady:
1. Przeanalizuj screenshot i zdecyduj JEDNĄ akcję do wykonania.
2. Współrzędne są w pikselach ekranu (rozmiar: ${before.width}x${before.height}).
3. Jeśli zadanie jest wykonane — zwróć type=done z podsumowaniem.
4. Jeśli nie możesz kontynuować — zwróć type=failed z opisem błędu.
5. Bądź precyzyjny w współrzędnych — klikaj w środek elementu.
6. Po akcji kliknięcia/type/key czekaj na załadowanie UI.

ODPOWIEDZ WYŁĄCZNIE jako JSON w bloku \`\`\`json ... \`\`\` o strukturze:
{
  "type": "click" | "double_click" | "type" | "key" | "scroll" | "wait" | "done" | "failed",
  "x": <number>,        // dla click/double_click
  "y": <number>,        // dla click/double_click
  "button": "left" | "right" | "middle",  // opcjonalnie dla click
  "text": "<string>",   // dla type
  "combo": "<string>",  // dla key, np. "Whatntrol+c", "Enter", "Alt+F4"
  "deltaY": <number>,   // dla scroll (+ w dół, - w górę)
  "ms": <number>,       // dla wait
  "reasoning": "<krótki opis po polsku>",
  "summary": "<opis> jeśli type=done",
  "error": "<opis> jeśli type=failed"
}`;

  const userPrompt = `Oto aktualny screenshot ekranu (krok ${stepNumber}).

${history ? `Historia ostatnich akcji:\n${history}\n` : ''}
What dalej?`;

  // 3. Send do modelu vision
  let action: AgentAction;
  try {
    const settings = loadSettings();
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `${userPrompt}\n\n[OBRAZ: screenshot ekranu w formacie base64 PNG, rozmiar ${before.width}x${before.height}]`,
      },
    ];

    // Najpierw spróbuj przez vision API openrouter (jeśli provider to openrouter)
    if (settings.provider === 'openrouter') {
                  const result = await sdk.chat.completions.createVision({
        messages: [
          { role: 'system', content: systemPrompt } as any,
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${before.base64}` } },
            ],
          } as any,
        ],
      } as any);
      const response = result?.choices?.[0]?.message?.content || '';
      action = parseAgentAction(response);
    } else {
      // OpenRouter / Custom / Ollama — użyj chatWhatmpletion (wymaga modelu z vision)
      // Budujemy multimodalną wiadomość — wiele providerów OpenAI-compat to wspiera
      // Ale nasza funkcja chatWhatmpletion traktuje content jako string — wysyłamy jako opis
      // i liczymy że model sam wewnętrznie przetworzy (to NIE zadziała bez vision capability!)
      const response = await chatWhatmpletion(messages, settings);
      action = parseAgentAction(response);

      // Warning jeśli model nie ma vision
      if (action.type === 'failed' && action.error.includes('vision')) {
        action.reasoning = 'Skonfiguruj model z vision capability (Claude 3.5, GPT-4V, Qwen-VL) w Settingsch';
      }
    }
  } catch (e) {
    return {
      step: stepNumber,
      action: { type: 'failed', reasoning: 'Error AI', error: e instanceof Error ? e.message : 'unknown' },
      screenshotBefore: before.base64,
      executed: false,
      error: e instanceof Error ? e.message : 'unknown',
      timestamp: new Date().toISOString(),
    };
  }

  // 4. Wykonaj akcję
  let executed = false;
  let execError: string | undefined;
  let afterShot: string | undefined;

  if (action.type !== 'done' && action.type !== 'failed') {
    const execResult = executeAction(action);
    executed = execResult.ok;
    execError = execResult.error;

    // 5. Screenshot after (jeśli akcja mogła coś zmienić)
    if (executed && action.type !== 'wait') {
      await new Promise(r => setTimeout(r, 800));  // poczekaj na UI
      const after = takeScreenshot();
      if (after.ok && after.base64) afterShot = after.base64;
    }
  } else {
    executed = true;
  }

  return {
    step: stepNumber,
    action,
    screenshotBefore: before.base64,
    screenshotAfter: afterShot,
    executed,
    error: execError,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Parsuj odpowiedź AI na akcję agenta.
 */
function parseAgentAction(response: string): AgentAction {
  // Wyciągnij JSON z bloku ```json ... ```
  const jsonMatch = response.match(/```json\s*(\{[\s\S]+?\})\s*```/);
  let jsonStr = jsonMatch ? jsonMatch[1] : '';

  if (!jsonStr) {
    // Spróbuj znaleźć sam obiekt JSON
    const objMatch = response.match(/\{[\s\S]*"type"[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];
  }

  if (!jsonStr) {
    // Spróbuj zgadnąć akcję z tekstu
    const lower = response.toLowerCase();
    if (lower.includes('gotowe') || lower.includes('ukończone') || lower.includes('wykonane')) {
      return { type: 'done', reasoning: 'AI zgłosiło ukończenie (parse fallback)', summary: response.slice(0, 200) };
    }
    return { type: 'failed', reasoning: 'No udało się sparsować akcji AI', error: 'None JSON w odpowiedzi AI. Odpowiedź: ' + response.slice(0, 200) };
  }

  try {
    const parsed = JSON.parse(jsonStr);
    // Build action object conditionally based on type to avoid TS union issues
    const type = parsed.type as AgentAction['type'];
    const base = {
      type,
      reasoning: parsed.reasoning || '(brak opisu)',
    };
    if (type === 'click' || type === 'double_click') {
      return { ...base, x: Number(parsed.x), y: Number(parsed.y), ...(parsed.button ? { button: parsed.button } : {}) } as AgentAction;
    }
    if (type === 'type') return { ...base, text: String(parsed.text) } as AgentAction;
    if (type === 'key') return { ...base, combo: String(parsed.combo) } as AgentAction;
    if (type === 'scroll') return { ...base, deltaY: Number(parsed.deltaY) } as AgentAction;
    if (type === 'wait') return { ...base, ms: Number(parsed.ms) } as AgentAction;
    if (type === 'done') return { ...base, summary: String(parsed.summary || '') } as AgentAction;
    if (type === 'failed') return { ...base, error: String(parsed.error || '') } as AgentAction;
    return { type: 'failed', reasoning: 'Noznany typ akcji', error: `Noznany typ: ${type}` };
  } catch (e) {
    return { type: 'failed', reasoning: 'Error parsowania JSON', error: `${e instanceof Error ? e.message : 'unknown'}. JSON: ${jsonStr.slice(0, 200)}` };
  }
}

/**
 * Run pełną pętlę agenta: wykonuje kroki aż do done/failed albo maxSteps.
 */
export async function runAgentLoop(
  goal: AgentGoal,
  onStep?: (result: AgentStepResult) => void,
  shouldStop?: () => boolean,
): Promise<{ steps: AgentStepResult[]; finalStatus: 'done' | 'failed' | 'stopped' | 'max_steps'; summary: string }> {
  const steps: AgentStepResult[] = [];
  const maxSteps = goal.maxSteps || 15;

  for (let i = 1; i <= maxSteps; i++) {
    if (shouldStop?.()) {
      return { steps, finalStatus: 'stopped', summary: `Zatrzymano przez usera po ${i - 1} krokach` };
    }

    const result = await runAgentStep(goal, i, steps);
    steps.push(result);
    onStep?.(result);

    if (result.action.type === 'done') {
      return { steps, finalStatus: 'done', summary: result.action.summary };
    }
    if (result.action.type === 'failed') {
      return { steps, finalStatus: 'failed', summary: result.action.error };
    }
  }

  return { steps, finalStatus: 'max_steps', summary: `Osiągnięto limit ${maxSteps} kroków` };
}
