import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion } from '@/lib/ai-providers';
import { getAIClient } from '@/lib/ai-client';

// ═══════════════════════════════════════════
// BOKA — Voice Emotion Analysis API
// Transcribes audio using ASR, then analyzes
// text for emotional content using LLM
// ═══════════════════════════════════════════

type EmotionType = 'happy' | 'sad' | 'angry' | 'calm' | 'excited' | 'neutral';

/**
 * Estimate audio energy level from base64 data size and format.
 * This is a heuristic — actual energy analysis would require
 * decoding the audio, which is not practical in a serverless context.
 */
function estimateAudioEnergy(base64Length: number): number {
  // Rough heuristic: longer audio = more energy potentially
  // Normalize to 0-1 range based on typical base64 sizes
  const approxBytes = (base64Length * 3) / 4;
  // A typical short phrase is ~10-50KB, energetic speech tends to be louder/larger
  const normalized = Math.min(approxBytes / 100000, 1);
  return Math.round(normalized * 100) / 100;
}

/**
 * Analyze text for emotional content using LLM
 */
async function analyzeEmotionFromText(
  transcript: string,
): Promise<{ emotion: EmotionType; confidence: number }> {
  const systemPrompt = `Analizuj emocje w tekście. Zwróć JSON: { "emotion": string, "confidence": number }. Emocje: happy, sad, angry, calm, excited, neutral. Confidence: 0.0 do 1.0. Zwróć TYLKO JSON, bez dodatkowego tekstu.`;

  const userPrompt = `Przeanalizuj emocje w tym tekście wypowiedzianym na głos:

"${transcript}"

Zwróć JSON z emocją i pewnością.`;

  try {
    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Extract JSON from potential surrounding text
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    const validEmotions: EmotionType[] = [
      'happy',
      'sad',
      'angry',
      'calm',
      'excited',
      'neutral',
    ];
    const emotion = validEmotions.includes(parsed.emotion)
      ? (parsed.emotion as EmotionType)
      : 'neutral';
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    return { emotion, confidence };
  } catch (parseError) {
    console.error('Emotion parsing error:', parseError);

    // Fallback: simple keyword-based emotion detection
    const lower = transcript.toLowerCase();
    if (
      lower.includes('super') ||
      lower.includes('świetni') ||
      lower.includes('hurra') ||
      lower.includes('ciesz') ||
      lower.includes('fajnie')
    ) {
      return { emotion: 'happy', confidence: 0.6 };
    }
    if (
      lower.includes('niestet') ||
      lower.includes('smut') ||
      lower.includes('płacz') ||
      lower.includes('źle')
    ) {
      return { emotion: 'sad', confidence: 0.6 };
    }
    if (
      lower.includes('kurw') ||
      lower.includes('wkurw') ||
      lower.includes('złości') ||
      lower.includes('nerw')
    ) {
      return { emotion: 'angry', confidence: 0.6 };
    }
    if (
      lower.includes('ekscyt') ||
      lower.includes('nie mogę się doczeka') ||
      lower.includes('wow') ||
      lower.includes('łał')
    ) {
      return { emotion: 'excited', confidence: 0.6 };
    }
    if (
      lower.includes('spokoj') ||
      lower.includes('cich') ||
      lower.includes('relaks')
    ) {
      return { emotion: 'calm', confidence: 0.6 };
    }

    return { emotion: 'neutral', confidence: 0.4 };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { audio, format = 'webm' } = body;

    if (!audio || typeof audio !== 'string') {
      return NextResponse.json(
        { error: 'Brak danych audio — nagraj coś' },
        { status: 400 },
      );
    }

    // Strip data URL prefix if present (e.g. "data:audio/webm;base64,")
    const base64Data = audio.includes(',') ? audio.split(',')[1] : audio;

    if (!base64Data || base64Data.length < 100) {
      return NextResponse.json(
        { error: 'Zbyt krótkie nagranie — powiedz coś dłużej' },
        { status: 400 },
      );
    }

            
    const asrResponse = await sdk.audio.asr.create({
      file_base64: base64Data,
    });

    const transcript = asrResponse?.text?.trim() || '';

    if (!transcript) {
      return NextResponse.json({
        transcript: '',
        emotion: 'neutral' as EmotionType,
        energy: 0,
        confidence: 0,
      });
    }

    // Step 2: Analyze the transcribed text for emotion using LLM
    const { emotion, confidence } = await analyzeEmotionFromText(transcript);

    // Step 3: Estimate audio energy level
    const energy = estimateAudioEnergy(base64Data.length);

    console.log(
      `Emotion-Voice: Transcribed "${transcript.substring(0, 50)}..." emotion=${emotion} confidence=${confidence} energy=${energy}`,
    );

    return NextResponse.json({
      transcript,
      emotion,
      energy,
      confidence,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Nieznany błąd';
    console.error('Emotion-voice API error:', msg);
    return NextResponse.json(
      { error: 'Błąd analizy emocji głosu', details: msg },
      { status: 500 },
    );
  }
}
