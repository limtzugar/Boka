'use client';

import { useState, useCallback } from 'react';

// ═══════════════════════════════════════════
// BOKA — Voice Emotion Analysis Hook
// Detects emotion from voice audio via /api/emotion-voice
// ═══════════════════════════════════════════

type VoiceEmotion = 'happy' | 'sad' | 'angry' | 'calm' | 'excited' | 'neutral';

interface VoiceEmotionResult {
  /** Transcribed text from the audio */
  transcript: string;
  /** Detected emotion */
  emotion: VoiceEmotion;
  /** Audio energy level (0-1) */
  energy: number;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Hook for detecting emotion from voice audio
 * Sends audio to the backend for transcription and emotion analysis
 */
export function useVoiceEmotion() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<VoiceEmotionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Analyze emotion from audio
   * @param audioBase64 Base64-encoded audio data (can include data URL prefix)
   * @param format Audio format (default: 'webm')
   * @returns The analysis result or null on failure
   */
  const analyzeEmotion = useCallback(
    async (
      audioBase64: string,
      format: string = 'webm',
    ): Promise<VoiceEmotionResult | null> => {
      setIsAnalyzing(true);
      setError(null);

      try {
        // Validate input
        if (!audioBase64 || typeof audioBase64 !== 'string') {
          setError('Brak danych audio — nagraj coś przed analizą');
          setIsAnalyzing(false);
          return null;
        }

        if (audioBase64.length < 100) {
          setError('Nagranie jest zbyt krótkie — powiedz coś dłużej');
          setIsAnalyzing(false);
          return null;
        }

        const res = await fetch('/api/emotion-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio: audioBase64,
            format,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const message =
            errorData.error || `Błąd serwera (${res.status})`;
          setError(message);
          setIsAnalyzing(false);
          return null;
        }

        const data = await res.json();

        // Validate emotion is one of the expected values
        const validEmotions: VoiceEmotion[] = [
          'happy',
          'sad',
          'angry',
          'calm',
          'excited',
          'neutral',
        ];
        const emotion: VoiceEmotion = validEmotions.includes(data.emotion)
          ? data.emotion
          : 'neutral';

        const result: VoiceEmotionResult = {
          transcript: data.transcript || '',
          emotion,
          energy:
            typeof data.energy === 'number'
              ? Math.max(0, Math.min(1, data.energy))
              : 0,
          confidence:
            typeof data.confidence === 'number'
              ? Math.max(0, Math.min(1, data.confidence))
              : 0,
        };

        setLastResult(result);
        setIsAnalyzing(false);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Błąd połączenia z serwerem';
        console.error('[BOKA VoiceEmotion] analyzeEmotion error:', err);
        setError(message);
        setIsAnalyzing(false);
        return null;
      }
    },
    [],
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
    analyzeEmotion,
    clearResult,
  };
}
