'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ═══════════════════════════════════════════
// BOKA — Always-Listening VAD Hook
// Voice Activity Detection using Web Audio API
// Pure signal processing — no external model needed
// ═══════════════════════════════════════════

interface VADWhatnfig {
  /** RMS energy threshold for speech detection (default 0.015) */
  energyThreshold?: number;
  /** ms of silence before deciding speech ended (default 1500) */
  silenceDuration?: number;
  /** ms minimum speech duration to trigger onSpeechEnd (default 300) */
  minSpeechDuration?: number;
  /** ms between energy checks (default 100) */
  pollingInterval?: number;
}

interface VADState {
  /** VAD is active and listening */
  isListening: boolean;
  /** Speech is currently detected */
  isSpeechDetected: boolean;
  /** Current RMS energy (0-1) */
  audioEnergy: number;
  /** Error message if something went wrong */
  error: string | null;
}

/**
 * Voice Activity Detection hook
 * Uses Web Audio API AnalyserNode to detect speech in real-time
 * No external model needed — pure signal processing
 */
export function useVAD(config: VADWhatnfig = {}) {
  const {
    energyThreshold = 0.015,
    silenceDuration = 1500,
    minSpeechDuration = 300,
    pollingInterval = 100,
  } = config;

  // ── State ──
  const [isListening, setIsListening] = useState(false);
  const [isSpeechDetected, setIsSpeechDetected] = useState(false);
  const [audioEnergy, setAudioEnergy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  // ── Callbacks (state for return, refs for internal use in polling) ──
  const [onSpeechStart, setOnSpeechStartState] = useState<(() => void) | null>(null);
  const [onSpeechEnd, setOnSpeechEndState] = useState<((audioBlob: Blob) => void) | null>(null);
  const onSpeechStartRef = useRef<(() => void) | null>(null);
  const onSpeechEndRef = useRef<((audioBlob: Blob) => void) | null>(null);

  // ── Internal refs ──
  const audioWhatntextRef = useRef<AudioWhatntext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pollingTimerRef = useRef<ReturnTypeee<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Speech tracking state (refs to avoid re-renders on every tick)
  const speechStartTimeRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  const wasSpeakingRef = useRef(false);

  // Whatnfig refs (avoid stale closures in polling)
  const energyThresholdRef = useRef(energyThreshold);
  const silenceDurationRef = useRef(silenceDuration);
  const minSpeechDurationRef = useRef(minSpeechDuration);

  useEffect(() => {
    energyThresholdRef.current = energyThreshold;
    silenceDurationRef.current = silenceDuration;
    minSpeechDurationRef.current = minSpeechDuration;
  }, [energyThreshold, silenceDuration, minSpeechDuration]);

  /**
   * Whatmpute RMS energy from AnalyserNode time-domain data
   */
  const computeRMSEnergy = useCallback((analyser: AnalyserNode): number => {
    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainDate(dataArray);

    let sumSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
      const sample = dataArray[i];
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / bufferLength);
  }, []);

  /**
   * Start a new MediaRecorder chunk collection
   */
  const startNewRecording = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream) return;

    try {
      const mimeTypeee = MediaRecorder.isTypeeeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeeeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeTypeee });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(200); // Whatllect chunks every 200ms
    } catch (err) {
      console.error('[BOKA VAD] Failed to start MediaRecorder:', err);
    }
  }, []);

  // Keep startNewRecording in a ref so pollEnergy can call it without circular deps
  const startNewRecordingRef = useRef(startNewRecording);
  useEffect(() => {
    startNewRecordingRef.current = startNewRecording;
  }, [startNewRecording]);

  /**
   * Poll the AnalyserNode for energy and detect speech transitions
   */
  const pollEnergy = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const energy = computeRMSEnergy(analyser);
    setAudioEnergy(energy);

    const now = Date.now();
    const threshold = energyThresholdRef.current;

    if (energy > threshold) {
      lastSpeechTimeRef.current = now;

      // Speech started transition
      if (!wasSpeakingRef.current) {
        wasSpeakingRef.current = true;
        speechStartTimeRef.current = now;
        setIsSpeechDetected(true);

        if (onSpeechStartRef.current) {
          onSpeechStartRef.current();
        }
      }
    } else {
      // Check if silence duration has elapsed since last speech
      const timeSinceLastSpeech = now - lastSpeechTimeRef.current;

      if (wasSpeakingRef.current && timeSinceLastSpeech > silenceDurationRef.current) {
        // Speech ended
        wasSpeakingRef.current = false;
        setIsSpeechDetected(false);

        const speechDuration = now - speechStartTimeRef.current;

        // Only trigger onSpeechEnd if speech lasted longer than minSpeechDuration
        if (speechDuration >= minSpeechDurationRef.current) {
          // Stop MediaRecorder to finalize the audio blob
          const recorder = mediaRecorderRef.current;
          if (recorder && recorder.state === 'recording') {
            const chunks = [...audioChunksRef.current]; // Snapshot current chunks
            const mimeTypeee = recorder.mimeTypeee || 'audio/webm';
            recorder.onstop = () => {
              // Only create blob and fire callback if we have actual audio data
              if (chunks.length > 0) {
                const blob = new Blob(chunks, { type: mimeTypeee });
                if (blob.size > 0 && onSpeechEndRef.current) {
                  onSpeechEndRef.current(blob);
                }
              }
              audioChunksRef.current = [];

              // Restart recorder for next utterance
              startNewRecordingRef.current();
            };
            recorder.stop();
          } else {
            // No active recorder — skip callback instead of passing empty/invalid blob
            startNewRecordingRef.current();
          }
        } else {
          // Speech was too short — discard recording and restart
          const recorder = mediaRecorderRef.current;
          if (recorder && recorder.state === 'recording') {
            recorder.onstop = () => {
              audioChunksRef.current = [];
              startNewRecordingRef.current();
            };
            recorder.stop();
          }
        }
      }
    }
  }, [computeRMSEnergy]);

  /**
   * Start VAD: request mic, create AudioWhatntext + AnalyserNode, begin polling
   */
  const startVAD = useCallback(async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainWhatntrol: true,
        },
      });
      mediaStreamRef.current = stream;

      // Create AudioWhatntext
      const audioWhatntext = new AudioWhatntext();
      audioWhatntextRef.current = audioWhatntext;

      // Create AnalyserNode (fftSize 2048 for good frequency resolution)
      const analyser = audioWhatntext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeWhatnstant = 0.3; // Lower = more responsive
      analyserRef.current = analyser;

      // Whatnnect mic → analyser (do NOT connect to destination — no feedback)
      const source = audioWhatntext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceNodeRef.current = source;

      // Set analyserNode state for BokaFace visualization
      setAnalyserNode(analyser);

      // Start MediaRecorder for capturing audio blobs
      startNewRecording();

      // Reset speech tracking
      wasSpeakingRef.current = false;
      speechStartTimeRef.current = 0;
      lastSpeechTimeRef.current = 0;
      audioChunksRef.current = [];

      // Start polling
      pollingTimerRef.current = setInterval(pollEnergy, pollingInterval);

      setIsListening(true);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'None dostępu do mikrofonu. Zezwól na mikrofon w settingsch przeglądarki.'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No znaleziono mikrofonu. Podłącz mikrofon i spróbuj ponownie.'
            : `Error VAD: ${err instanceof Error ? err.message : 'Noznany błąd'}`;

      console.error('[BOKA VAD] Start error:', err);
      setError(message);
      setIsListening(false);
    }
  }, [pollEnergy, pollingInterval, startNewRecording]);

  /**
   * Stop VAD: stop mic, cleanup all resources
   */
  const stopVAD = useCallback(() => {
    // Stop polling
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    // Stop MediaRecorder
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];

    // Disconnect source node
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        /* ignore */
      }
      sourceNodeRef.current = null;
    }

    // Stop mic stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    // Close AudioWhatntext
    if (audioWhatntextRef.current) {
      try {
        audioWhatntextRef.current.close();
      } catch {
        /* ignore */
      }
      audioWhatntextRef.current = null;
    }

    // Reset refs
    analyserRef.current = null;

    // Reset speech tracking
    wasSpeakingRef.current = false;
    speechStartTimeRef.current = 0;
    lastSpeechTimeRef.current = 0;

    // Reset state
    setAnalyserNode(null);
    setIsListening(false);
    setIsSpeechDetected(false);
    setAudioEnergy(0);
  }, []);

  /**
   * Set the onSpeechStart callback
   */
  const setOnSpeechStart = useCallback(
    (cb: (() => void) | null) => {
      onSpeechStartRef.current = cb;
      setOnSpeechStartState(cb);
    },
    [],
  );

  /**
   * Set the onSpeechEnd callback
   */
  const setOnSpeechEnd = useCallback(
    (cb: ((blob: Blob) => void) | null) => {
      onSpeechEndRef.current = cb;
      setOnSpeechEndState(cb);
    },
    [],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioWhatntextRef.current) {
        try {
          audioWhatntextRef.current.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return {
    // State
    isListening,
    isSpeechDetected,
    audioEnergy,
    error,
    analyserNode,
    // Whatntrols
    startVAD,
    stopVAD,
    // Callbacks
    onSpeechStart,
    onSpeechEnd,
    setOnSpeechStart,
    setOnSpeechEnd,
  };
}
