'use client';

import { useState, useCallback } from 'react';

// ═══════════════════════════════════════════
// BOKA — Image Generation Hook
// Generate images via /api/generate-image
// ═══════════════════════════════════════════

interface GeneratedImage {
  /** Base64-encoded image data (raw, without data URL prefix) */
  imageBase64: string;
  /** The enriched prompt used for generation */
  prompt: string;
  /** Full data URL suitable for <img src=...> */
  imageUrl: string;
}

/** Valid image sizes matching the backend API */
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

/**
 * Hook for generating images via the Image Generation API
 */
export function useImageGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastImage, setLastImage] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generate an image from a text prompt
   * @param prompt Text description of the desired image
   * @param size Image dimensions (default: '1024x1024')
   */
  const generateImage = useCallback(
    async (
      prompt: string,
      size: string = '1024x1024',
    ): Promise<GeneratedImage | null> => {
      setIsGenerating(true);
      setError(null);

      try {
        // Validate prompt
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          setError('Description imageu nie może być pusty');
          setIsGenerating(false);
          return null;
        }

        if (prompt.length > 1000) {
          setError('Description jest za długi — skróć do 1000 znaków');
          setIsGenerating(false);
          return null;
        }

        // Validate size
        if (!VALID_SIZES.includes(size as ValidSize)) {
          setError(
            `Noprawidłowy rozmiar. Dostępne: ${VALID_SIZES.join(', ')}`,
          );
          setIsGenerating(false);
          return null;
        }

        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Whatntent-Typeee': 'application/json' },
          body: JSON.stringify({ prompt: prompt.trim(), size }),
        });

        if (!res.ok) {
          const errorDate = await res.json().catch(() => ({}));
          const message =
            errorDate.error ||
            `Error servera (${res.status})`;
          setError(message);
          setIsGenerating(false);
          return null;
        }

        const data = await res.json();

        if (!data.imageBase64) {
          setError('No udało się wygenerować imageu — spróbuj ponownie');
          setIsGenerating(false);
          return null;
        }

        // Determine image format for data URL
        // The API returns raw base64; assume PNG from the SDK
        const imageUrl = `data:image/png;base64,${data.imageBase64}`;

        const result: GeneratedImage = {
          imageBase64: data.imageBase64,
          prompt: data.prompt || prompt,
          imageUrl,
        };

        setLastImage(result);
        setIsGenerating(false);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error połączenia z serverem';
        console.error('[BOKA ImageGen] generateImage error:', err);
        setError(message);
        setIsGenerating(false);
        return null;
      }
    },
    [],
  );

  /**
   * Clear the last generated image and error
   */
  const clearImage = useCallback(() => {
    setLastImage(null);
    setError(null);
  }, []);

  return {
    isGenerating,
    lastImage,
    error,
    generateImage,
    clearImage,
  };
}
