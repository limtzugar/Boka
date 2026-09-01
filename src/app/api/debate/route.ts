import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion, loadSettings } from '@/lib/ai-providers';

// ═══════════════════════════════════════════════════════════
// BOKA OS v0.3.8.1 — Tryb Debaty Boki
// Multi-agent debate endpoint: each call invokes ONE agent
// (with its own system prompt + personality) to take a turn
// in the ongoing debate. The frontend orchestrates rounds.
// ═══════════════════════════════════════════════════════════

export interface DebateTurn {
  agentId: string;        // 'user' for moderator
  agentName: string;      // display name
  content: string;        // what was said
}

export interface DebateRequest {
  agentName: string;          // e.g. "Sage"
  agentRole: string;          // e.g. "Filozof"
  agentSystemPrompt: string;  // full personality prompt
  topic: string;              // debate topic
  history: DebateTurn[];      // previous turns (excluding this one)
  moderatorNote?: string;     // optional user instruction ("zabierz głos", "odpowiedz na X")
  childMode?: boolean;        // v0.3.7 child mode → keep emojis
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as DebateRequest;
    const {
      agentName,
      agentRole,
      agentSystemPrompt,
      topic,
      history = [],
      moderatorNote,
      childMode = false,
    } = body;

    if (!agentSystemPrompt || !topic) {
      return NextResponse.json(
        { error: 'Brak agentSystemPrompt lub topic' },
        { status: 400 }
      );
    }

    // ── Build the agent's persona system prompt ──
    // Combine: agent personality + debate context + behavioral rules
    const emojiRule = childMode
      ? 'Możesz używać emotikon, aby być bardziej przyjaznym.'
      : 'NIE używaj emotikon — to tryb dorosły.';

    const sysPrompt = `${agentSystemPrompt}

═══════════════════════════════════════════
TRYB DEBATY BOKI — ZASADDY
═══════════════════════════════════════════
Jesteś jednym z kilku agentów-personowości BOKA debatujących ze sobą.
Twoja rola w tej debacie: ${agentRole} (${agentName}).

TEMAT DEBATY:
${topic}

ZASADY:
1. Mów KRÓTKO i TREŚCIWIE — max 3-5 zdań na turę. To debata, nie wykład.
2. Bądź WIERNY swojej osobowości. Nie zgadzaj się z innymi tylko po to, żeby być miłym.
3. Nawiązuj do tego, co powiedzieli inni agenci (mogą być cytowani w historii).
4. Jeśli masz odmienne zdanie — wyraź je jasno. To jest siła debaty.
5. Skup się na TEMACIE. Nie odchodź od tematu.
6. Mów w pierwszej osobie jako "${agentName}".
7. ${emojiRule}
8. Jeśli czujesz, że debata się wyczerpała — powiedz to wprost ("Wyczerpałem temat").

Pamiętaj: inni agenci też zabierają głos. To nie jest monolog. To wieloosobowa rozmowa.`;

    // ── Build chat history as user/assistant turns ──
    // We pass prior debate turns so the agent has context.
    // Each turn from another agent becomes an 'assistant' message
    // attributed by name in the content (so the LLM knows who said what).
    // Moderator turns become 'user' messages.
    const chatMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: sysPrompt },
    ];

    for (const turn of history) {
      if (turn.agentId === 'user') {
        chatMessages.push({
          role: 'user',
          content: `[MODERATOR]: ${turn.content}`,
        });
      } else {
        chatMessages.push({
          role: 'assistant',
          content: `[${turn.agentName}]: ${turn.content}`,
        });
      }
    }

    // ── Final user turn: ask the agent to speak now ──
    const instruction = moderatorNote
      ? `Twoja kolej, ${agentName}. ${moderatorNote} Zabierz głos w debacie (jako ${agentName}, max 3-5 zdań):`
      : `Twoja kolej, ${agentName}. Zabierz głos w debacie na temat: "${topic}". Odpowiedz jako ${agentName} (max 3-5 zdań, bądź wierny swojej osobowości):`;

    chatMessages.push({ role: 'user', content: instruction });

    // ── Call LLM ──
    const settings = loadSettings();
    // For debate we want shorter, punchier responses
    const debateSettings = {
      ...settings,
      maxTokens: Math.min(settings.maxTokens ?? 1500, 500),
      temperature: Math.max(settings.temperature ?? 0.7, 0.8), // slightly more creative for distinct voices
    };

    const rawContent = await chatCompletion(chatMessages, debateSettings);

    // ── Cleanup ──
    // Strip any leading "[AgentName]:" the model may have echoed
    let content = rawContent.trim();
    const prefixMatch = content.match(/^\s*\[?[^[\]]{1,30}\]?\s*[:—-]\s*/);
    if (prefixMatch && prefixMatch[0].length < 50) {
      // Only strip if it looks like an attribution prefix, not normal text
      const possibleName = prefixMatch[0].replace(/[\[\]:—\-\s]/g, '');
      if (possibleName.length < 30 && /^[A-Za-z\u00C0-\u017F]+$/.test(possibleName)) {
        content = content.slice(prefixMatch[0].length);
      }
    }

    // Strip surrounding quotes if present
    if ((content.startsWith('"') && content.endsWith('"')) ||
        (content.startsWith('"') && content.endsWith('"'))) {
      content = content.slice(1, -1);
    }

    return NextResponse.json({
      content: content.trim(),
      agentName,
      agentRole,
    });
  } catch (err) {
    console.error('[/api/debate] error:', err);
    return NextResponse.json(
      {
        error: 'Błąd debaty',
        details: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 }
    );
  }
}
