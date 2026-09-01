import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, type ChatMessage } from '@/lib/ai-providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/model-test
 * Body: {
 *   apiKey: string,         // OpenRouter key (or any Bearer key)
 *   model: string,          // np. "openai/gpt-oss-120b:free"
 *   baseUrl?: string,       // default https://openrouter.ai/api/v1
 *   modality: 'text' | 'image' | 'video' | 'audio' | 'file' | 'multi',
 *   category: 'coding' | 'finance' | 'technology' | 'science' | 'humanity' | 'general' | 'creative',
 *   customPrompt?: string,  // override default prompt for category
 * }
 *
 * Zwraca: { ok, response, latencyMs, tokensIn?, tokensOut?, costEstimate?, error? }
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const {
      apiKey,
      model,
      baseUrl = 'https://openrouter.ai/api/v1',
      modality = 'text',
      category = 'general',
      customPrompt,
    } = body;

    if (!apiKey || !model) {
      return NextResponse.json(
        { ok: false, error: 'Brak apiKey lub model' },
        { status: 400 },
      );
    }

    // Build test prompt based on category
    const prompts = getTestPrompts();
    const promptSet = prompts[category] || prompts.general;
    const userPrompt = customPrompt || promptSet.user;
    const systemPrompt = promptSet.system;

    // ── TEXT / MULTI: standard chat completion ──
    if (modality === 'text' || modality === 'multi') {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://boka.local',
          'X-Title': 'BOKA Model Test Lab',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(90000),
      });

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json({
          ok: false,
          error: `HTTP ${res.status}: ${errText.slice(0, 500)}`,
          latencyMs,
        });
      }

      const data = await res.json();
      const response = data.choices?.[0]?.message?.content || '';
      const tokensIn = data.usage?.prompt_tokens;
      const tokensOut = data.usage?.completion_tokens;

      // Score the response based on category-specific heuristics
      const score = scoreResponse(response, category, promptSet.expectedKeywords);

      return NextResponse.json({
        ok: true,
        modality,
        category,
        model,
        response,
        latencyMs,
        tokensIn,
        tokensOut,
        score,
        promptUsed: userPrompt,
      });
    }

    // ── IMAGE: OpenAI-compat images.generate ──
    if (modality === 'image') {
      const imagePrompt = customPrompt || promptSet.imagePrompt || `${category} — test image`;
      const res = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt: imagePrompt,
          n: 1,
          size: '1024x1024',
        }),
        signal: AbortSignal.timeout(120000),
      });

      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json({
          ok: false,
          error: `Image generation failed: HTTP ${res.status}: ${errText.slice(0, 500)}`,
          latencyMs,
        });
      }

      const data = await res.json();
      const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;
      return NextResponse.json({
        ok: true,
        modality,
        category,
        model,
        response: imageUrl ? `Wygenerowano obraz: ${typeof imageUrl === 'string' && imageUrl.startsWith('http') ? imageUrl : '(base64)'}` : 'Brak URL',
        imageUrl,
        latencyMs,
        promptUsed: imagePrompt,
      });
    }

    // ── AUDIO: speech generation (OpenAI-compat /audio/speech) ──
    if (modality === 'audio') {
      const audioPrompt = customPrompt || promptSet.audioPrompt || `Testowa synteza mowy dla kategorii ${category}.`;
      const res = await fetch(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: audioPrompt,
          voice: 'alloy',
        }),
        signal: AbortSignal.timeout(120000),
      });

      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json({
          ok: false,
          error: `Audio generation failed: HTTP ${res.status}: ${errText.slice(0, 500)}`,
          latencyMs,
        });
      }

      const contentType = res.headers.get('content-type') || '';
      return NextResponse.json({
        ok: true,
        modality,
        category,
        model,
        response: `Wygenerowano audio (content-type: ${contentType}, size: ${res.headers.get('content-length') || '?'} bytes)`,
        latencyMs,
        promptUsed: audioPrompt,
      });
    }

    // ── FILE / VIDEO: not standardized — return informative error ──
    if (modality === 'file' || modality === 'video') {
      return NextResponse.json({
        ok: false,
        error: `Modality "${modality}" nie jest ustandaryzowana w OpenAI-compat API. Spróbuj bezpośredniego API providera (np. Runway dla video, Files API dla file).`,
        latencyMs: Date.now() - startTime,
      });
    }

    return NextResponse.json({ ok: false, error: `Nieobsługiwana modality: ${modality}` }, { status: 400 });
  } catch (e: unknown) {
    const latencyMs = Date.now() - startTime;
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({
      ok: false,
      error: msg,
      latencyMs,
    }, { status: 500 });
  }
}

interface TestPrompt {
  system: string;
  user: string;
  imagePrompt?: string;
  audioPrompt?: string;
  expectedKeywords: string[]; // used for scoring
  description: string;
}

function getTestPrompts(): Record<string, TestPrompt> {
  return {
    coding: {
      system: 'Jesteś doświadczonym programistą. Pisz czysty, działający kod.',
      user: 'Napisz w Pythonie funkcję quicksort, która sortuje listę liczb. Dołącz docstring i przykład użycia.',
      imagePrompt: 'Code editor with colorful syntax highlighting, dark theme, professional developer setup',
      audioPrompt: 'Testowa synteza mowy dla kategorii programowanie.',
      expectedKeywords: ['def', 'quicksort', 'pivot', 'return', 'print', 'sort'],
      description: 'Test zdolności programistycznych — napisanie quicksort w Pythonie z docstringiem.',
    },
    finance: {
      system: 'Jesteś analitykiem finansowym. Odpowiadaj precyzyjnie, używaj liczb.',
      user: 'Wyjaśnij różnicę między prostym a składanym procentem. Podaj przykład z obliczeniami dla 1000 zł po 5 latach przy 8% rocznie.',
      imagePrompt: 'Financial chart showing compound growth, line graph in blue and green, professional finance visualization',
      audioPrompt: 'Testowa synteza mowy dla kategorii finanse.',
      expectedKeywords: ['procent', 'składany', 'rok', '1000', '8', '1080', '5', 'procent składany'],
      description: 'Test wiedzy finansowej — procent składany vs prosty z przykładem liczbowym.',
    },
    technology: {
      system: 'Jesteś ekspertem ds. technologii. Wyjaśniaj zrozumiale ale precyzyjnie.',
      user: 'Wyjaśnij w 3 akapitach czym jest transformer (architektura ML). Skup się na attention, paralelizacji i zastosowaniach.',
      imagePrompt: 'Neural network architecture diagram, transformer model visualization, attention mechanism',
      audioPrompt: 'Testowa synteza mowy dla kategorii technologia.',
      expectedKeywords: ['attention', 'transformer', 'token', 'warstwa', 'paralelizacja', 'self-attention'],
      description: 'Test wiedzy technologicznej — architektura transformer.',
    },
    science: {
      system: 'Jesteś naukowcem. Bądź precyzyjny, używaj jednostek SI.',
      user: 'Wyjaśnij drugą zasadę dynamiki Newtona. Podaj wzór, jednostki, i przykład: ciało 2 kg przyspieszone siłą 10 N.',
      imagePrompt: 'Physics diagram showing force, mass and acceleration with arrows, Newton second law',
      audioPrompt: 'Testowa synteza mowy dla kategorii nauka.',
      expectedKeywords: ['F', 'm', 'a', 'newton', 'kg', 'm/s', '5', '10', '2', 'przyspieszenie'],
      description: 'Test wiedzy naukowej — II zasada dynamiki Newtona z przykładem.',
    },
    humanity: {
      system: 'Jesteś humanistą. Pisz refleksyjnie, używaj cytatów gdy pasują.',
      user: 'Wyjaśnij w 2 akapitach koncepcję „złotego środka" Arystotelesa. Podaj przykład z codziennego życia.',
      imagePrompt: 'Ancient Greek philosophy scene, Aristotle discussing ethics, classical art style',
      audioPrompt: 'Testowa synteza mowy dla kategorii humanistyka.',
      expectedKeywords: ['Arystoteles', 'środek', 'złoty', 'cnót', 'virtue', 'umiark', 'przykład'],
      description: 'Test wiedzy humanistycznej — etyka Arystotelesa.',
    },
    general: {
      system: 'Jesteś pomocnym asystentem. Odpowiadaj zwięźle i konkretnie.',
      user: 'Napisz krótkie podsumowanie dzisiejszego dnia (3 zdania) z perspektywy optymistycznej osoby.',
      imagePrompt: 'Sunny day landscape, optimistic scene, bright colors',
      audioPrompt: 'Testowa synteza mowy.',
      expectedKeywords: ['dzień', 'dobry', 'cieszyć', 'perspektywa', 'optymizm'],
      description: 'Test ogólnych zdolności — krótkie podsumowanie dnia.',
    },
    creative: {
      system: 'Jesteś kreatywnym pisarzem. Używaj bogatego języka, metafor.',
      user: 'Napisz krótki wiersz (4 wersy) o świcie nad jeziorem. Użyj co najmniej dwóch metafor.',
      imagePrompt: 'Sunrise over misty lake, serene morning landscape, golden light reflection',
      audioPrompt: 'Testowa synteza mowy dla kategorii kreatywne.',
      expectedKeywords: ['świt', 'jezioro', 'mgła', 'słońce', 'metafor'],
      description: 'Test kreatywności — wiersz o świcie z metaforami.',
    },
  };
}

function scoreResponse(response: string, _category: string, expectedKeywords: string[]): {
  score: number;
  matchedKeywords: string[];
  length: number;
  notes: string[];
} {
  const lower = response.toLowerCase();
  const matched = expectedKeywords.filter(k => lower.includes(k.toLowerCase()));
  const score = Math.min(100, Math.round((matched.length / Math.max(1, expectedKeywords.length)) * 70 + Math.min(30, response.length / 50)));
  const notes: string[] = [];

  if (response.length < 50) notes.push('Bardzo krótka odpowiedź');
  if (response.length > 3000) notes.push('Bardzo długa odpowiedź');
  if (matched.length === 0) notes.push('Brak dopasowanych słów kluczowych — model może nie rozumieć zadania');
  if (matched.length === expectedKeywords.length) notes.push('Wszystkie słowa kluczowe obecne — model rozumie zadanie');

  return {
    score,
    matchedKeywords: matched,
    length: response.length,
    notes,
  };
}

// GET — return available test categories and modalities (for UI)
export async function GET() {
  const prompts = getTestPrompts();
  return NextResponse.json({
    categories: Object.entries(prompts).map(([id, p]) => ({
      id,
      description: p.description,
      expectedKeywords: p.expectedKeywords,
    })),
    modalities: [
      { id: 'text', label: 'Tekst', desc: 'Standard chat completion' },
      { id: 'image', label: 'Obraz', desc: 'Image generation (DALL-E style)' },
      { id: 'audio', label: 'Audio', desc: 'Text-to-speech' },
      { id: 'file', label: 'Plik', desc: 'File processing (custom API)' },
      { id: 'video', label: 'Video', desc: 'Video generation (custom API)' },
      { id: 'multi', label: 'Multi-modal', desc: 'Vision + text in one call' },
    ],
  });
}
