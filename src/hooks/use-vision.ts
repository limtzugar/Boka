'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ═══════════════════════════════════════════
// BOKA — Vision / Multimodal Hook
// Upload and analyze images using /api/vision
// ═══════════════════════════════════════════

interface VisionResult {
  /** Text description of the image */
  description: string;
  /** Detected emotion from the image content */
  emotion: string;
}

/**
 * Hook for uploading and analyzing images via the Vision API
 */
export function useVision() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<VisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Send a data URL to the vision API for analysis
   * This is the core function that both public methods delegate to
   */
  const analyzeFromDataUrl = useCallback(
    async (
      dataUrl: string,
      prompt?: string,
    ): Promise<VisionResult | null> => {
      setIsAnalyzing(true);
      setError(null);

      try {
        const res = await fetch('/api/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: dataUrl,
            prompt,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const message =
            errorData.error ||
            `Błąd serwera (${res.status})`;
          setError(message);
          setIsAnalyzing(false);
          return null;
        }

        const data = await res.json();

        if (!data.description) {
          setError('Nie udało się uzyskać opisu obrazu');
          setIsAnalyzing(false);
          return null;
        }

        const result: VisionResult = {
          description: data.description,
          emotion: data.emotion || 'neutral',
        };

        setLastResult(result);
        setIsAnalyzing(false);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Błąd połączenia z serwerem';
        console.error('[BOKA Vision] analyze error:', err);
        setError(message);
        setIsAnalyzing(false);
        return null;
      }
    },
    [],
  );

  // Keep analyzeFromDataUrl in a ref so analyzeImage can call it without circular deps
  const analyzeFromDataUrlRef = useRef(analyzeFromDataUrl);
  useEffect(() => {
    analyzeFromDataUrlRef.current = analyzeFromDataUrl;
  }, [analyzeFromDataUrl]);

  /**
   * Analyze an image from a File object
   * Reads the file as base64 and delegates to analyzeFromDataUrl
   */
  const analyzeImage = useCallback(
    async (file: File): Promise<VisionResult | null> => {
      setIsAnalyzing(true);
      setError(null);

      try {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          setError('Przesłany plik nie jest obrazem. Wybierz plik graficzny.');
          setIsAnalyzing(false);
          return null;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          setError('Obraz jest za duży. Maksymalny rozmiar to 10 MB.');
          setIsAnalyzing(false);
          return null;
        }

        // Read file as base64 data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result;
            if (typeof result === 'string') {
              resolve(result);
            } else {
              reject(new Error('Nie udało się odczytać pliku'));
            }
          };
          reader.onerror = () => reject(new Error('Błąd odczytu pliku'));
          reader.readAsDataURL(file);
        });

        return await analyzeFromDataUrlRef.current(dataUrl);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Nieznany błąd analizy obrazu';
        console.error('[BOKA Vision] analyzeImage error:', err);
        setError(message);
        setIsAnalyzing(false);
        return null;
      }
    },
    [],
  );

  /**
   * Analyze an image from a data URL string
   * Useful when you already have a base64-encoded image
   */
  const analyzeImageFromUrl = useCallback(
    async (dataUrl: string, prompt?: string): Promise<VisionResult | null> => {
      return analyzeFromDataUrl(dataUrl, prompt);
    },
    [analyzeFromDataUrl],
  );

  /**
   * Clear the last result and error
   */
  const clearResult = useCallback(() => {
    setLastResult(null);
    setError(null);
  }, []);

  return {
    isAnalyzing,
    lastResult,
    error,
    analyzeImage,
    analyzeImageFromUrl,
    clearResult,
  };
}
