// ═══════════════════════════════════════════
// BOKA — Automatic Memory Extractor
// Analyzes conversations and extracts memorable facts
// ═══════════════════════════════════════════

import { chatCompletion } from '@/lib/ai-providers';

interface ExtractedFact {
  content: string;
  domain: string;
  importance: number;
  tags: string[];
  aboutMember: string; // member name
}

/**
 * Extract memorable facts from a conversation using LLM analysis.
 * This runs after every chat exchange to build persistent memory.
 * Works with ANY configured AI provider.
 */
export async function extractFactsFromConversation(params: {
  userMessage: string;
  assistantResponse: string;
  memberName: string;
  memberRole: string;
  memberAge: number;
  existingMemory: string;
}): Promise<ExtractedFact[]> {
  try {
    const extractionPrompt = `Jesteś systemem ekstrakcji pamięci asystenta domowego BOKA.

Zadanie: Przeanalizuj poniższą rozmowę i wyciągnij WSZYSTKIE zapamiętalne fakty.

ROZMOWA:
Użytkownik (${params.memberName}, ${params.memberAge} lat, rola: ${params.memberRole}):
${params.userMessage}

Asystent:
${params.assistantResponse}

ISTNIEJĄCA PAMIĘĆ (nie powtarzaj tych samych faktów):
${params.existingMemory || 'Brak'}

ZASADY EKSTRAKCJI:
1. Wyciągnij KAŻDY fakt, który warto zapamiętać o tej osobie lub rodzinie
2. Przykłady: preferencje, wydarzenia, plany, relacje, zainteresowania, zdrowie, szkoła, praca, hobby
3. Nawet drobne rzeczy są ważne ("lubi pić herbatę z cytryną", "ma kota o imieniu Mruczek")
4. Ocenij ważność: 0.1 (błahe) do 1.0 (krytyczne)
5. Przypisz domenę: general, health, education, finance, food, hobby, social, family, work, child_culture
6. Dodaj tagi po polsku (małe litery)

ODPOWIEDZ W FORMACIE JSON (tablica faktów):
[
  {
    "content": "opis faktu po polsku",
    "domain": "nazwa_domeny",
    "importance": 0.7,
    "tags": ["tag1", "tag2"],
    "aboutMember": "${params.memberName}"
  }
]

Jeśli nie ma żadnych faktów do zapamiętania, zwróć pustą tablicę: []

Zwróć TYLKO JSON, bez dodatkowego tekstu.`;

    const responseText = await chatCompletion([
      { role: 'system', content: extractionPrompt },
      { role: 'user', content: 'Ekstrahuj fakty z tej rozmowy.' },
    ]);

    // Parse JSON from response (handle potential markdown code blocks)
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const facts: ExtractedFact[] = JSON.parse(jsonStr);

    // Validate each fact
    return facts.filter(f =>
      f.content &&
      f.content.length > 5 &&
      f.content.length < 500 &&
      f.domain &&
      f.importance >= 0 &&
      f.importance <= 1
    );
  } catch (error) {
    console.error('Memory extraction error:', error);
    return [];
  }
}

/**
 * Build a compact memory context string from memory entries.
 * Used for injection into prompts.
 */
export function buildMemoryContext(entries: Array<{
  title?: string | null;
  content: string;
  domain?: string | null;
  importance: number;
  memberId?: string | null;
}>): string {
  if (entries.length === 0) return '';

  // Sort by importance descending, take top 15
  const sorted = [...entries]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 15);

  return sorted
    .map(e => `[${e.domain || 'ogólne'}${e.importance >= 0.8 ? ' ★' : ''}] ${e.content}`)
    .join('\n');
}
