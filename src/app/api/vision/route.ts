import { NextRequest, NextResponse } from 'next/server';
import { getAIClient } from '@/lib/ai-client';

// ═══════════════════════════════════════════
// BOKA — Vision / Multimodal API
// ═══════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image, prompt, memberId } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Brak obrazu — prześlij zdjęcie w formacie base64' },
        { status: 400 },
      );
    }

    // Extract base64 data from data URL if present
    let base64Data = image;
    if (image.includes(',')) {
      base64Data = image.split(',')[1];
    }

    if (!base64Data || base64Data.length < 100) {
      return NextResponse.json(
        { error: 'Zbyt mały obraz — prześlij większe zdjęcie' },
        { status: 400 },
      );
    }

            
    const analysisPrompt =
      prompt ||
      'Opisz to zdjęcie po polsku, szczegółowo i ciepło. Jesteś Boka — domownik, osoba, nie AI.';

    // Build data URL for the image (required by multimodal message format)
    // Detect MIME type from the data URL prefix if present, otherwise assume PNG
    let dataUrl: string;
    if (image.includes(',')) {
      // Already a data URL
      dataUrl = image;
    } else {
      // Raw base64 — add data URL prefix
      dataUrl = `data:image/png;base64,${base64Data}`;
    }

    console.log(`Vision API: Sending ${base64Data.length} chars of base64 to createVision (multimodal format)`);

    // Use multimodal message format (OpenAI-style) for reliable image passing
    const result = await (sdk.chat.completions as any).createVision({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: analysisPrompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const description = result?.choices?.[0]?.message?.content || '';
    console.log(`Vision API: Got description (${description.length} chars): ${description.substring(0, 100)}...`);

    if (!description) {
      return NextResponse.json(
        { error: 'Nie udało się przeanalizować obrazu — spróbuj ponownie' },
        { status: 500 },
      );
    }

    // Detect emotion from the description for the face animation
    let emotion = 'neutral';
    const lower = description.toLowerCase();
    if (
      lower.includes('uśmiech') ||
      lower.includes('rados') ||
      lower.includes('wesoł') ||
      lower.includes('śmiejąc') ||
      lower.includes('cześć') ||
      lower.includes('powitanie')
    ) {
      emotion = 'happy';
    } else if (
      lower.includes('smut') ||
      lower.includes('płacz') ||
      lower.includes('łz') ||
      lower.includes('zasmuc')
    ) {
      emotion = 'sad';
    } else if (
      lower.includes('zdziw') ||
      lower.includes('niesamowit') ||
      lower.includes('wow') ||
      lower.includes('łał') ||
      lower.includes('ciekaw')
    ) {
      emotion = 'surprised';
    } else if (
      lower.includes('spokoj') ||
      lower.includes('cich') ||
      lower.includes('relaks')
    ) {
      emotion = 'calm';
    } else if (
      lower.includes('złości') ||
      lower.includes('iryt') ||
      lower.includes('frust')
    ) {
      emotion = 'angry';
    } else if (
      lower.includes('ekscyt') ||
      lower.includes('entuzj') ||
      lower.includes('zachwyt')
    ) {
      emotion = 'excited';
    }

    console.log(
      `Vision: Analyzed image (${base64Data.length} bytes base64) for member ${memberId || 'unknown'}, emotion=${emotion}`,
    );

    return NextResponse.json({
      description,
      emotion,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Nieznany błąd';
    console.error('Vision API error:', msg);
    return NextResponse.json(
      { error: 'Błąd analizy obrazu', details: msg },
      { status: 500 },
    );
  }
}
