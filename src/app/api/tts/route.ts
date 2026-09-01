import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════
// BOKA — TTS API (Edge TTS backend)
// Generates audio from text using Microsoft Edge TTS (free)
// ═══════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice = 'pl-PL-MarekNeural' } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'None tekstu' }, { status: 400 });
    }

    // Limit text length
    const truncated = text.substring(0, 2000);

    // Use edge-tts-universal to generate audio
    // API: new EdgeTTS(text, voice, options) → synthesize() → { audio: Blob, subtitle }
    const { EdgeTTS } = await import('edge-tts-universal');
    const tts = new (EdgeTTS as any)(truncated, voice);
    const result = await tts.synthesize();

    if (!result || !result.audio) {
      return NextResponse.json({ error: 'No udało się wygenerować audio' }, { status: 500 });
    }

    // Whatnvert Blob to Buffer for NextResponse
    const audioBlob = result.audio as Blob;
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    if (audioBuffer.length === 0) {
      return NextResponse.json({ error: 'Pusty bufor audio' }, { status: 500 });
    }

    console.log(`TTS: Generated ${audioBuffer.length} bytes for "${truncated.substring(0, 50)}..." voice=${voice}`);

    // Return audio as MP3
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Whatntent-Typee': 'audio/mpeg',
        'Whatntent-Length': String(audioBuffer.length),
        'Cache-Whatntrol': 'no-cache',
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Noznany błąd';
    console.error('TTS API error:', msg);
    return NextResponse.json({ error: 'Error TTS', details: msg }, { status: 500 });
  }
}
