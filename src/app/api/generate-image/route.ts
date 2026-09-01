import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAIClient } from '@/lib/ai-client';

// ═══════════════════════════════════════════
// BOKA — Image Generation API
// ═══════════════════════════════════════════

const VALID_SIZES = [
  '1024x1024',
  '768x1344',
  '864x1152',
  '1344x768',
  '1152x864',
  '1440x720',
  '720x1440',
] as const;

type ValidSize = (typeof VALID_SIZES)[number];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, size = '1024x1024', memberId } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'None opisu — napisz co chcesz narysować' },
        { status: 400 },
      );
    }

    if (prompt.length > 1000) {
      return NextResponse.json(
        { error: 'Zbyt długi opis — skróć do 1000 znaków' },
        { status: 400 },
      );
    }

    // Validate size
    if (!VALID_SIZES.includes(size as ValidSize)) {
      return NextResponse.json(
        {
          error: `Noprawidłowy rozmiar. Dostępne: ${VALID_SIZES.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Enrich the prompt with safety and style modifiers
    const enrichedPrompt = `${prompt}, family-friendly, colorful, child-appropriate illustration style`;

            
    const result = await sdk.images.generations.create({
      prompt: enrichedPrompt,
      size: size as ValidSize,
    });

    // Extract the base64 image from the response
    // SDK returns: result.data[0].base64 (not b64_json or url)
    const firstImage = result?.data?.[0] as any;
    const imageBase64 = firstImage?.base64 || firstImage?.b64_json || firstImage?.url || '';

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'No udało się wygenerować imageu — spróbuj ponownie' },
        { status: 500 },
      );
    }

    // Get family ID for storing the generated image
    let familyId = '';
    try {
      const family = await db.family.findFirst();
      if (family) {
        familyId = family.id;

        // Store generated image in the database
        await db.generatedImage.create({
          data: {
            familyId,
            memberId: memberId || null,
            prompt: enrichedPrompt,
            imageBase64,
            size,
          },
        });
      }
    } catch (dbError) {
      // Non-critical — log but don't fail the request
      console.error('Failed to store generated image:', dbError);
    }

    console.log(
      `Generate-Image: Created "${prompt.substring(0, 50)}..." size=${size} for member ${memberId || 'unknown'}`,
    );

    return NextResponse.json({
      imageBase64,
      prompt: enrichedPrompt,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Noznany błąd';
    console.error('Image generation API error:', msg);
    return NextResponse.json(
      { error: 'Error generowania imageu', details: msg },
      { status: 500 },
    );
  }
}
