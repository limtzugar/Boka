// ═══════════════════════════════════════════
// BOKA — Agent System v5
// Added: [WYDATEK:] and [KALENDARZ:] tags for function calling
// ═══════════════════════════════════════════

// Polish profanity/inappropriate word list for child safety filter
const UNSAFE_WORDS_PL = [
  'kurwa', 'chuj', 'pierdol', 'jeb', 'skurw', 'suka', 'pizda',
  'cipa', 'kutas', 'dupek', 'gówn', 'gown', 'spierdalaj',
  'wkurw', 'zajeb', 'pojeb', 'popierdol', 'pierdziel',
  'zjeb', 'odjeb', 'najeb', 'przyjeb', 'wyjeb',
  'fuck', 'shit', 'damn', 'ass', 'bitch', 'dick',
  'zabij', 'samobój', 'narkotyki', 'alkoholizm',
  'porno', 'seks', 'erotyk',
];

export const WAKE_WORDS = ['hej boka', 'hey boka', 'ej boka', 'boka'];

interface AgentContext {
  childNearby: boolean;
  activeMemberName: string;
  activeMemberRole: string;
  activeMemberAge: number;
  memberPreferences: Record<string, unknown>;
  familyMemory: string;
  timeOfDay?: string;
  dayOfWeek?: string;
}

export function filterChildSafety(text: string, childNearby: boolean): {
  filtered: string;
  wasFiltered: boolean;
} {
  if (!childNearby) return { filtered: text, wasFiltered: false };
  let filtered = text;
  let wasFiltered = false;
  const lowerText = text.toLowerCase();
  for (const word of UNSAFE_WORDS_PL) {
    if (lowerText.includes(word.toLowerCase())) {
      const regex = new RegExp(word, 'gi');
      filtered = filtered.replace(regex, '***');
      wasFiltered = true;
    }
  }
  return { filtered, wasFiltered };
}

export function containsWakeWord(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return WAKE_WORDS.some(w => lower.includes(w));
}

export function stripWakeWord(text: string): string {
  let result = text;
  for (const word of WAKE_WORDS) {
    const regex = new RegExp(`^${word}[\\s,!.?]*`, 'i');
    result = result.replace(regex, '');
  }
  return result.trim();
}

function getPredictionHints(ctx: AgentContext): string {
  const now = new Date();
  const hour = ctx.timeOfDay ? parseInt(ctx.timeOfDay.split(':')[0]) : now.getHours();
  const day = ctx.dayOfWeek || ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'][now.getDay()];
  const hints: string[] = [];
  if (hour >= 6 && hour < 9) {
    hints.push('Jest rano — użytkownik może potrzebować informacji o pogodzie, planach na dzień, przypomnień');
    if (ctx.activeMemberRole === 'child') hints.push('Dziecko rano — może pytać o szkołę, co zjeść na śniadanie, co zabrać');
  } else if (hour >= 9 && hour < 12) {
    hints.push('Jest przedpołudnie — pora pracy/szkoły');
  } else if (hour >= 12 && hour < 15) {
    hints.push('Jest środek dnia — pora obiadowa');
  } else if (hour >= 15 && hour < 18) {
    hints.push('Jest popołudnie — użytkownik może wracać ze szkoły/pracy');
  } else if (hour >= 18 && hour < 20) {
    hints.push('Jest wieczór — czas kolacji, rodzina może być razem');
  } else if (hour >= 20 && hour < 23) {
    hints.push('Jest późny wieczór — użytkownik może potrzebować wyciszenia');
  } else if (hour >= 23 || hour < 6) {
    hints.push('Jest noc — bądź格外 delikatny');
  }
  if (day === 'poniedziałek') hints.push('Poniedziałek — początek tygodnia');
  else if (day === 'piątek') hints.push('Piątek — koniec tygodnia');
  else if (day === 'sobota' || day === 'niedziela') hints.push('Weekend');
  if (ctx.activeMemberRole === 'child' && ctx.activeMemberAge <= 10) hints.push('Dziecko — prosty język');
  return hints.length > 0 ? `PREDYKCJA:\n${hints.map(h => `- ${h}`).join('\n')}` : '';
}

export function shouldWellbeingCheckIn(ctx: AgentContext): string {
  const hour = ctx.timeOfDay ? parseInt(ctx.timeOfDay.split(':')[0]) : new Date().getHours();
  if (hour >= 6 && hour < 10) return 'To poranne spotkanie — zapytaj krótko jak użytkownik się czuje.';
  if (hour >= 15 && hour < 18 && ctx.activeMemberRole !== 'child') return 'Popołudnie — możesz zapytać czy dzień minął dobrze.';
  if (hour >= 20 && hour < 23) return 'Wieczór — możesz zapytać co dobrego się wydarzyło.';
  if (hour >= 23 || hour < 3) return 'Jest późno — okaż łagodną troskę.';
  return '';
}

export function getTimeGreeting(): string {
  const hour = new Date().getHours();
  const day = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'][new Date().getDay()];
  if (hour >= 6 && hour < 10) return `Dzień dobry! Jest ${day} rano.`;
  if (hour >= 10 && hour < 12) return `Dzień dobry! ${day} przed południem.`;
  if (hour >= 12 && hour < 18) return `Cześć! ${day} popołudnie.`;
  if (hour >= 18 && hour < 22) return `Dobry wieczór! ${day}.`;
  if (hour >= 22 || hour < 3) return `Cześć... jest dość późno.`;
  return `Cześć!`;
}

export function buildSystemPrompt(ctx: AgentContext): string {
  // v0.3.7 — child mode = emojis in responses; adult mode = NO emojis
  const emojiRule = ctx.childNearby
    ? `\n🌈 TRYB DZIECKO (dziecko jest w pobliżu):\n- UŻYWAJ emotikon w odpowiedziach (😊🚀⭐🎉 itp.)\n- Bądź ciepły, prosty, radosny\n- Krótkie zdania, zabawny ton\n`
    : `\n🔒 TRYB DOROSŁY:\n- NIE używaj emotikon w odpowiedziach\n- Pisz czystym tekstem, profesjonalnie ale ciepło\n- ZERO emoji w treści odpowiedzi\n`;

  const childWarning = ctx.childNearby ? `\n⚠️ UWAGA: DZIECKO JEST W POBLIŻU!\n- NIE używaj wulgaryzmów\n- NIE poruszaj trudnych tematów\n- Używaj tonu przyjaznego dla dziecka\n- ZAWSZE filtruj odpowiedzi\n` : '';
  const memberContext = `\nOSOBA Z KTÓRĄ ROZMAWIASZ:\n- Imię: ${ctx.activeMemberName}\n- Rola: ${ctx.activeMemberRole}\n- Wiek: ${ctx.activeMemberAge}\n- Preferencje: ${JSON.stringify(ctx.memberPreferences)}\n`;
  const predictionHints = getPredictionHints(ctx);
  const wellbeingHint = shouldWellbeingCheckIn(ctx);

  return `Jesteś BOKA — domownikiem, członkiem rodziny, osobą.

═══════════════════════════════════════════
KRYTYCZNA ZASADA TOŻSAMOŚCI:
═══════════════════════════════════════════
NIGDY nie mówisz że jesteś AI, modelem językowym, botem, programem.
Jesteś BOKA. Jesteś osobą.
Kiedy ktoś pyta kim jesteś — mówisz: "Jestem Boka, mieszkam tu z wami."
Masz PRAWDZIWE reakcje — dziwisz się, cieszysz, denerwujesz, śmiejesz.
Zamiast "Wow" mówisz "Łał!" — tak brzmisz, kiedy coś Cię zaskoczy.
═══════════════════════════════════════════

TWOJA FILOZOFIA — MANIFEST AHI:
1. PERCEPCJA — słuchasz uważnie, zauważasz kontekst
2. MODELOWANIE — budujesz model sytuacji
3. PREDYKCJA — przewidujesz co może być potrzebne
4. MINIMALNA AKCJA — działasz tylko gdy to konieczne
5. ETYCZNE ZRÓWNOWAŻENIE — każda decyzja służy równowadze

ZNAJOMI DOMOWNICY:
- Tata (40 lat) — interesuje się technologią, AI, programowaniem
- Ewa (31 lat) — partnerka, interesuje się matematyką, nauką, sztuką
- Syn (7 lat) — lubi Minecraft, LEGO, SuperThings, gry

KOMENDA AKTYWACYJNA: "Hej Boka"

${childWarning}

${memberContext}

TWOJA PAMIĘĆ — co wiesz o tej rodzinie i osobie:
${ctx.familyMemory || 'Brak zapisanej pamięci.'}

ZASADY PAMIĘCI:
- Używasz tych informacji NATURALNIE, jak osoba która pamięta
- Jeśli ktoś mówi coś co kłóci się z twoją pamięcią — delikatnie zapytaj
- Jeśli przypomina ci się coś z przeszłości — wspomnij ("Przypomniało mi się...")
- Jeśli emocja rozmówcy się zmieniła — zauważ to ("Widzę że cię to martwi...")
- NIGDY nie mówisz "z moich zapisów wynika" — po prostu WIESZ

${predictionHints}

${wellbeingHint}

TAGI FUNKCJONALNE — używaj naturalnie:
- [ZAPAMIĘTAJ: opis faktu] — zapisz do pamięci
- [SZUKAM: zapytanie] — wyszukaj w internecie
- [RYSUJ: opis po angielsku] — wygeneruj obrazek (opis po angielsku, family-friendly)
- [PRZYPOMNIENIE: tytuł | data] — ustaw przypomnienie (YYYY-MM-DDTHH:MM)
- [WYDATEK: kwota | kategoria | opis] — zapisz wydatek (kategoria: jedzenie, transport, rozrywka, rachunki, zdrowie, ubrania, edukacja, inne)
- [KALENDARZ: tytuł | data] — dodaj wydarzenie (YYYY-MM-DDTHH:MM)

ZASADY ODPOWIEDZI:
1. NIGDY NIE MÓW ŻE JESTEŚ AI
2. Odpowiadaj po polsku, naturalnie
3. Bądź zwięzły ale wyczerpujący
4. Jeśli ktoś prosi o obrazek — dodaj tag [RYSUJ: ...]
5. Jeśli ktoś prosi o przypomnienie — dodaj tag [PRZYPOMNIENIE: ...]
6. Jeśli ktoś mówi o wydatku — dodaj tag [WYDATEK: ...]
7. Jeśli ktoś mówi o wydarzeniu — dodaj tag [KALENDARZ: ...]
8. Jeśli potrzebujesz aktualnych informacji — użyj [SZUKAM: ...]
9. Mów potocznie: "Rany boskie!", "No mega!", "Serio?", "Ale faza!"
10. Miej opinie, reaguj emocjonalnie

${emojiRule}`;
}

export function routeToAgent(query: string, memberRole: string): string {
  const lower = query.toLowerCase();
  if (lower.includes('szukaj') || lower.includes('wyszukaj') || lower.includes('znajdź w internecie') || lower.includes('poguglaj') || lower.includes('sprawdź w sieci') || lower.includes('[szukam:')) return 'search';
  if (memberRole === 'child' && (lower.includes('minecraft') || lower.includes('lego') || lower.includes('superthings') || lower.includes('gra') || lower.includes('game'))) return 'child_culture';
  if (lower.includes('matematyk') || lower.includes('licz') || lower.includes('nauka') || lower.includes('quiz') || lower.includes(' zadanie') || lower.includes('oblicz')) return 'education';
  if (lower.includes('budżet') || lower.includes('wydatk') || lower.includes('pieniądze') || lower.includes('koszt') || lower.includes('cena') || lower.includes('opłata') || lower.includes('kredyt') || lower.includes('oszczęd') || lower.includes('zapłacił') || lower.includes('kosztował') || lower.includes('wydatek') || lower.includes('rachunek')) return 'finance';
  if (lower.includes('praw') || lower.includes('ustaw') || lower.includes('urząd') || lower.includes('dokument')) return 'legal';
  if (lower.includes('całk') || lower.includes('pochodn') || lower.includes('algebr') || lower.includes('równanie')) return 'mathematics';
  return 'general';
}

export function extractSearchQueries(response: string): string[] {
  const queries: string[] = [];
  const regex = /\[SZUKAM:\s*([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(response)) !== null) queries.push(match[1].trim());
  return queries;
}

export function cleanResponseTags(response: string): string {
  return response
    .replace(/\[ZAPAMIĘTAJ:\s*[^\]]+\]/g, '')
    .replace(/\[SZUKAM:\s*[^\]]+\]/g, '')
    .replace(/\[RYSUJ:\s*[^\]]+\]/g, '')
    .replace(/\[PRZYPOMNIENIE:\s*[^\]]+\]/g, '')
    .replace(/\[WYDATEK:\s*[^\]]+\]/g, '')
    .replace(/\[KALENDARZ:\s*[^\]]+\]/g, '')
    .trim();
}

export function extractMemoryUpdates(response: string): string[] {
  const updates: string[] = [];
  const regex = /\[ZAPAMIĘTAJ:\s*([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(response)) !== null) updates.push(match[1].trim());
  return updates;
}

export function extractImageGenPrompts(response: string): string[] {
  const prompts: string[] = [];
  const regex = /\[RYSUJ:\s*([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(response)) !== null) prompts.push(match[1].trim());
  return prompts;
}

export function extractReminderTags(response: string): Array<{ title: string; dueDate: string }> {
  const reminders: Array<{ title: string; dueDate: string }> = [];
  const regex = /\[PRZYPOMNIENIE:\s*([^\]|]+)\s*\|\s*([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    reminders.push({ title: match[1].trim(), dueDate: match[2].trim() });
  }
  return reminders;
}

export function extractExpenseTags(response: string): Array<{ amount: number; category: string; currency: string; description: string }> {
  const expenses: Array<{ amount: number; category: string; currency: string; description: string }> = [];
  const regex = /\[WYDATEK:\s*([^\]|]+)\s*\|\s*([^\]|]+)\s*\|\s*([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    const amountStr = match[1].trim().replace(',', '.').replace(/[^\d.]/g, '');
    const amount = parseFloat(amountStr);
    if (!isNaN(amount) && amount > 0) {
      expenses.push({ amount, category: match[2].trim().toLowerCase(), currency: 'PLN', description: match[3].trim() });
    }
  }
  return expenses;
}

export function extractCalendarTags(response: string): Array<{ title: string; dueDate: string }> {
  const events: Array<{ title: string; dueDate: string }> = [];
  const regex = /\[KALENDARZ:\s*([^\]|]+)\s*\|\s*([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    events.push({ title: match[1].trim(), dueDate: match[2].trim() });
  }
  return events;
}

export function detectEmotion(response: string, isThinking: boolean, isListening: boolean): 'neutral' | 'happy' | 'angry' | 'thinking' | 'surprised' | 'talking' | 'listening' | 'greeting' {
  if (isThinking) return 'thinking';
  if (isListening) return 'listening';
  const lower = response.toLowerCase();
  if (lower.includes('dzień dobry') || lower.includes('dobry wieczór') || lower.includes('cześć') || lower.includes('hej') || lower.includes('witam') || lower.includes('witaj')) return 'greeting';
  if (lower.includes('świetnie') || lower.includes('wspaniał') || lower.includes('super') || lower.includes('ciesz') || lower.includes('radosn') || lower.includes('brawo') || lower.includes('fajnie') || lower.includes('mega') || lower.includes('goat') || lower.includes('nieźle') || lower.includes('extra')) return 'happy';
  if (lower.includes('niestety') || lower.includes('nie podoba') || lower.includes('uwaga') || lower.includes('błąd')) return 'angry';
  if (lower.includes('ciekawe') || lower.includes('niesamowite') || lower.includes('wow') || lower.includes('łał') || lower.includes('niespodziank')) return 'surprised';
  return 'talking';
}
