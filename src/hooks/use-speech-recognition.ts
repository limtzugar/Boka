'use client';

import { useState, useCallback, useRef, useSyncExternalStore } from 'react';
import { useAppStore } from '@/lib/store';

// Extend Window for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// Type declarations for Web Speech API (not in standard TS lib)
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

// Hydration-safe ASR support detection
const emptySubscribe = () => () => {};
function useAsrSupported() {
  return useSyncExternalStore(
    emptySubscribe,
    () => !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    () => false
  );
}

// Hydration-safe MediaRecorder detection
function useMediaRecorderSupported() {
  return useSyncExternalStore(
    emptySubscribe,
    () => typeof MediaRecorder !== 'undefined',
    () => false
  );
}

export function useSpeechRecognition() {
  const { isListening, setListening, activeMemberId } = useAppStore();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [continuousMode, setContinuousMode] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const nativeAsrSupported = useAsrSupported();
  const mediaRecorderSupported = useMediaRecorderSupported();
  // ASR is "supported" if either native SpeechRecognition or MediaRecorder is available
  const isSupported = nativeAsrSupported || mediaRecorderSupported;
  const onSpeechResultRef = useRef<((text: string, isFinal: boolean) => void) | null>(null);

  // MediaRecorder refs for backend ASR fallback
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Allow external code to set a callback for speech results
  const setOnSpeechResult = useCallback((cb: (text: string, isFinal: boolean) => void) => {
    onSpeechResultRef.current = cb;
  }, []);

  // ── BACKEND ASR: Record audio → send to /api/asr → get text ──
  const startBackendListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      // Choose best available MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(1000); // collect chunks every second
      setListening(true);
      setMicError(null);
    } catch (e) {
      console.error('[BOKA ASR] MediaRecorder error:', e);
      setMicError('Brak dostępu do mikrofonu. Zezwól na mikrofon w ustawieniach przeglądarki.');
      setListening(false);
    }
  }, [setListening]);

  const stopBackendListening = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setListening(false);
      return;
    }

    // Stop recording and wait for final data
    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        audioChunksRef.current = [];

        // Stop the mic stream
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }
        mediaRecorderRef.current = null;

        setListening(false);

        // If recording is too short, skip transcription
        if (blob.size < 1000) {
          console.warn('[BOKA ASR] Recording too short, skipping transcription');
          resolve();
          return;
        }

        // Send to backend ASR
        try {
          const base64Audio = await new Promise<string>((resolveReader, rejectReader) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result;
              if (typeof result === 'string' && result.length > 0) {
                resolveReader(result);
              } else {
                rejectReader(new Error('FileReader returned empty result'));
              }
            };
            reader.onerror = () => rejectReader(new Error('FileReader error'));
            reader.readAsDataURL(blob);
          });

          const res = await fetch('/api/asr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: base64Audio, format: recorder.mimeType }),
          });

          if (!res.ok) {
            console.error('[BOKA ASR] API error:', res.status);
            setMicError('Błąd rozpoznawania mowy. Spróbuj ponownie.');
            resolve();
            return;
          }

          const data = await res.json();
          if (data.text && onSpeechResultRef.current) {
            onSpeechResultRef.current(data.text, true);
          }
          resolve();
        } catch (e) {
          console.error('[BOKA ASR] Transcription error:', e);
          setMicError('Błąd transkrypcji. Spróbuj ponownie.');
          resolve();
        }
      };

      recorder.stop();
    });
  }, [setListening]);

  // ── NATIVE ASR: Web Speech API (Chrome/Edge) ──
  const startNativeListening = useCallback(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return false;

    setMicError(null);

    const recognition = new SpeechRecognition();
    recognition.lang = 'pl-PL';
    recognition.continuous = continuousMode;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setMicError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      const isFinal = event.results[event.results.length - 1].isFinal;

      // Call the external callback (e.g., sendMessage)
      if (onSpeechResultRef.current && transcript.trim()) {
        onSpeechResultRef.current(transcript.trim(), isFinal);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setMicError('Brak dostępu do mikrofonu. Zezwól na mikrofon w ustawieniach przeglądarki.');
        setListening(false);
      } else if (event.error === 'service-not-allowed') {
        setMicError('Usługa rozpoznawania mowy niedostępna. Sprawdź połączenie internetowe.');
        setListening(false);
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setMicError(`Błąd mikrofonu: ${event.error}`);
        setListening(false);
      }
    };

    recognition.onend = () => {
      // In continuous mode, restart automatically
      if (continuousMode && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    return true;
  }, [setListening, continuousMode]);

  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Try native Web Speech API first (better: real-time, free, local)
    if (nativeAsrSupported) {
      const started = startNativeListening();
      if (started) return;
    }

    // Fallback: MediaRecorder + backend ASR (works in ALL browsers with mic)
    if (mediaRecorderSupported) {
      startBackendListening();
      return;
    }

    // Neither available
    setMicError('Mikrofon nie jest dostępny. Użyj pola tekstowego.');
  }, [nativeAsrSupported, mediaRecorderSupported, startNativeListening, startBackendListening]);

  const stopListening = useCallback(() => {
    // Stop native SpeechRecognition
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      try { rec.stop(); } catch { /* already stopped */ }
    }

    // Stop backend MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopBackendListening();
      return; // stopBackendListening handles setListening(false)
    }

    setListening(false);
  }, [setListening, stopBackendListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const toggleContinuousMode = useCallback(() => {
    setContinuousMode(prev => {
      if (prev) {
        // Turning off continuous mode
        stopListening();
      }
      return !prev;
    });
  }, [stopListening]);

  return {
    isListening,
    startListening,
    stopListening,
    toggleListening,
    isSupported,
    nativeAsrSupported,
    continuousMode,
    toggleContinuousMode,
    setOnSpeechResult,
    micError,
  };
}
