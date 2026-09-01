'use client';

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { EDGE_TTS_VOICES, DEFAULT_VOICE_ID, type TTSProvider } from '@/lib/tts-voices';

// ═══════════════════════════════════════════
// BOKA — TTS Hook v5
// FIXED: analyserNode and micAnalyserNode are now React state,
// so they trigger re-renders and BokaFace can see them.
// Previously, getter-based refs never triggered re-renders.
// v5: Added burp/fart sound effects (Web Audio API synthesis)
// ═══════════════════════════════════════════

interface BrowserVoice {
  id: string;
  name: string;
  lang: string;
  voice: SpeechSynthesisVoice;
}

// Hydration-safe TTS support detection
const emptySubscribe = () => () => {};
function useTtsSupported() {
  return useSyncExternalStore(
    emptySubscribe,
    () => typeof Audio !== 'undefined',
    () => false
  );
}

// ═══════════════════════════════════════════
// BĄKI & BEKNIĘCIA — Sound effect synthesis
// Web Audio API: oscillators + noise = realistic body sounds
// ═══════════════════════════════════════════
type SoundEffectType = 'burp' | 'fart' | 'sneeze';

/**
 * Synthesize a body sound effect using Web Audio API
 * Burps: short, pitch-dropping, resonant
 * Farts: longer, low rumble with noise texture
 * Each call randomizes parameters for variety
 */
function synthesizeSoundEffect(
  ctx: AudioContext,
  type: SoundEffectType,
  destination?: AudioNode,
): void {
  const now = ctx.currentTime;
  const dest = destination || ctx.destination;

  if (type === 'burp') {
    // Pick a random burp variant
    const variant = Math.floor(Math.random() * 5);
    const configs = [
      { freq: 120, endFreq: 60, duration: 0.25, gain: 0.4, resonance: 300 },
      { freq: 150, endFreq: 50, duration: 0.3, gain: 0.35, resonance: 400 },
      { freq: 90, endFreq: 40, duration: 0.35, gain: 0.45, resonance: 250 },
      { freq: 180, endFreq: 70, duration: 0.2, gain: 0.3, resonance: 500 },   // high short belch
      { freq: 80, endFreq: 30, duration: 0.5, gain: 0.5, resonance: 200 },   // deep long belch
    ];
    const c = configs[variant];

    // Main oscillator — the "voice" of the burp
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(c.freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(c.endFreq, 20), now + c.duration);

    // Resonance filter — makes it sound hollow/bodily
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = c.resonance;
    filter.Q.value = 3 + Math.random() * 5;

    // Gain envelope — attack + decay
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(c.gain, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + c.duration);

    // Noise layer for texture
    const noiseLen = Math.floor(ctx.sampleRate * c.duration);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.15;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(c.gain * 0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + c.duration);

    // Connect: osc → filter → gain → dest, noise → noiseGain → dest
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.connect(noiseGain);
    noiseGain.connect(dest);

    osc.start(now);
    osc.stop(now + c.duration + 0.05);
    noise.start(now);
    noise.stop(now + c.duration + 0.05);

  } else if (type === 'fart') {
    // FART — longer, lower, with more noise and rumble
    const variant = Math.floor(Math.random() * 6);
    const configs = [
      { freq: 70, endFreq: 35, duration: 0.6, gain: 0.35, noiseMix: 0.4 },
      { freq: 50, endFreq: 25, duration: 0.8, gain: 0.4, noiseMix: 0.5 },
      { freq: 90, endFreq: 40, duration: 0.4, gain: 0.3, noiseMix: 0.3 },   // quick squeaker
      { freq: 40, endFreq: 20, duration: 1.2, gain: 0.45, noiseMix: 0.6 },  // deep rumble
      { freq: 100, endFreq: 30, duration: 0.5, gain: 0.35, noiseMix: 0.35 }, // descending trump
      { freq: 60, endFreq: 45, duration: 0.7, gain: 0.3, noiseMix: 0.25 },  // modest puff
    ];
    const c = configs[variant];

    // Main oscillator
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(c.freq, now);
    // Add vibrato for flapping texture
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 15 + Math.random() * 25;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = c.freq * 0.15;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);
    vibrato.start(now);
    vibrato.stop(now + c.duration + 0.1);

    osc.frequency.exponentialRampToValueAtTime(Math.max(c.endFreq, 15), now + c.duration);

    // Low-pass filter for muffled body sound
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300 + Math.random() * 200;
    filter.Q.value = 1;

    // Gain envelope — quick attack, sustained, then fade
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(c.gain, now + 0.03);
    gain.gain.setValueAtTime(c.gain, now + c.duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.01, now + c.duration);

    // Noise layer — the "air" component
    const noiseLen = Math.floor(ctx.sampleRate * c.duration);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      noiseData[i] = (Math.random() * 2 - 1);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    // Noise filter — only low freq noise passes
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 400;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(c.gain * c.noiseMix, now + 0.05);
    noiseGain.gain.setValueAtTime(c.gain * c.noiseMix, now + c.duration * 0.5);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + c.duration);

    // Connect
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(dest);

    osc.start(now);
    osc.stop(now + c.duration + 0.1);
    noise.start(now);
    noise.stop(now + c.duration + 0.1);

  } else if (type === 'sneeze') {
    // SNEEZE — sharp intake + explosive burst
    // Phase 1: Quick inhale (rising noise)
    // Phase 2: Explosive "A-CHOO!" burst
    const variant = Math.floor(Math.random() * 4);
    const configs = [
      { inhaleDur: 0.15, burstDur: 0.2, burstFreq: 800, burstGain: 0.5, noiseGain: 0.6 },   // quick sharp
      { inhaleDur: 0.2, burstDur: 0.3, burstFreq: 600, burstGain: 0.45, noiseGain: 0.5 },    // medium
      { inhaleDur: 0.25, burstDur: 0.25, burstFreq: 1000, burstGain: 0.55, noiseGain: 0.65 }, // high sneeze
      { inhaleDur: 0.18, burstDur: 0.35, burstFreq: 500, burstGain: 0.4, noiseGain: 0.45 },   // deep wet
    ];
    const c = configs[variant];
    const totalDur = c.inhaleDur + c.burstDur;

    // Phase 1: Inhale — short rising noise burst
    const inhaleLen = Math.floor(ctx.sampleRate * c.inhaleDur);
    const inhaleBuf = ctx.createBuffer(1, inhaleLen, ctx.sampleRate);
    const inhaleData = inhaleBuf.getChannelData(0);
    for (let i = 0; i < inhaleLen; i++) {
      const t = i / inhaleLen;
      inhaleData[i] = (Math.random() * 2 - 1) * t * 0.3; // Rising noise
    }
    const inhale = ctx.createBufferSource();
    inhale.buffer = inhaleBuf;
    const inhaleFilter = ctx.createBiquadFilter();
    inhaleFilter.type = 'bandpass';
    inhaleFilter.frequency.setValueAtTime(1000, now);
    inhaleFilter.frequency.linearRampToValueAtTime(3000, now + c.inhaleDur);
    inhaleFilter.Q.value = 2;
    const inhaleGain = ctx.createGain();
    inhaleGain.gain.setValueAtTime(0, now);
    inhaleGain.gain.linearRampToValueAtTime(0.3, now + c.inhaleDur * 0.5);
    inhaleGain.gain.exponentialRampToValueAtTime(0.01, now + c.inhaleDur);

    // Phase 2: Explosive burst — "CHOO!"
    const burstLen = Math.floor(ctx.sampleRate * c.burstDur);
    const burstBuf = ctx.createBuffer(1, burstLen, ctx.sampleRate);
    const burstData = burstBuf.getChannelData(0);
    for (let i = 0; i < burstLen; i++) {
      burstData[i] = (Math.random() * 2 - 1); // Full noise
    }
    const burst = ctx.createBufferSource();
    burst.buffer = burstBuf;
    // Burst oscillator — adds tonal quality to the "CHOO"
    const burstOsc = ctx.createOscillator();
    burstOsc.type = 'sawtooth';
    burstOsc.frequency.setValueAtTime(c.burstFreq, now + c.inhaleDur);
    burstOsc.frequency.exponentialRampToValueAtTime(Math.max(c.burstFreq * 0.3, 80), now + totalDur);
    const burstOscGain = ctx.createGain();
    burstOscGain.gain.setValueAtTime(0, now + c.inhaleDur);
    burstOscGain.gain.linearRampToValueAtTime(c.burstGain, now + c.inhaleDur + 0.01);
    burstOscGain.gain.exponentialRampToValueAtTime(0.01, now + totalDur);
    // Burst noise filter
    const burstFilter = ctx.createBiquadFilter();
    burstFilter.type = 'bandpass';
    burstFilter.frequency.value = 2000 + Math.random() * 1000;
    burstFilter.Q.value = 1.5;
    const burstNoiseGain = ctx.createGain();
    burstNoiseGain.gain.setValueAtTime(0, now + c.inhaleDur);
    burstNoiseGain.gain.linearRampToValueAtTime(c.noiseGain, now + c.inhaleDur + 0.01);
    burstNoiseGain.gain.exponentialRampToValueAtTime(0.01, now + totalDur);

    // Connect inhale
    inhale.connect(inhaleFilter);
    inhaleFilter.connect(inhaleGain);
    inhaleGain.connect(dest);
    // Connect burst
    burst.connect(burstFilter);
    burstFilter.connect(burstNoiseGain);
    burstNoiseGain.connect(dest);
    burstOsc.connect(burstOscGain);
    burstOscGain.connect(dest);

    // Schedule
    inhale.start(now);
    inhale.stop(now + c.inhaleDur + 0.05);
    burst.start(now + c.inhaleDur);
    burst.stop(now + totalDur + 0.05);
    burstOsc.start(now + c.inhaleDur);
    burstOsc.stop(now + totalDur + 0.05);
  }
}

export function useBokaTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [provider, setProvider] = useState<TTSProvider>('edge-tts');
  const [selectedVoiceId, setSelectedVoiceId] = useState(DEFAULT_VOICE_ID);
  const [browserVoices, setBrowserVoices] = useState<BrowserVoice[]>([]);
  const [micActive, setMicActive] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const isSupported = useTtsSupported();

  // CRITICAL FIX: Use STATE for analyserNodes so React re-renders when they change
  // Previously used getter on ref which never triggered re-renders → BokaFace always got null
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [micAnalyserNode, setMicAnalyserNode] = useState<AnalyserNode | null>(null);

  // Refs for TTS audio pipeline (internal use only)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const currentSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const speechSynthesisUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Refs for microphone pipeline
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);

  /**
   * Ensure AudioContext + AnalyserNode are ready.
   * Must be called from a user-gesture (click/tap) context.
   */
  const ensureAudioContext = useCallback(() => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      return;
    }

    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      const gain = ctx.createGain();
      gain.gain.value = 1.0;

      // analyser → gain → destination (speakers)
      analyser.connect(gain);
      gain.connect(ctx.destination);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      gainNodeRef.current = gain;

      // CRITICAL: Set state so React re-renders and BokaFace gets the analyser
      setAnalyserNode(analyser);
    } catch (e) {
      console.warn('[BOKA TTS] Failed to create AudioContext:', e);
    }
  }, []);

  // Load browser voices
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const plVoices = voices
        .filter(v => v.lang.startsWith('pl'))
        .map(v => ({
          id: `browser-${v.name}`,
          name: v.name,
          lang: v.lang,
          voice: v,
        }));
      setBrowserVoices(plVoices);
    };

    loadVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);

    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  // Load saved voice preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('boka-tts-voice');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.provider) setProvider(parsed.provider);
        if (parsed.voiceId) setSelectedVoiceId(parsed.voiceId);
      }
    } catch { /* ignore */ }
  }, []);

  const savePreference = useCallback((prov: TTSProvider, voiceId: string) => {
    try {
      localStorage.setItem('boka-tts-voice', JSON.stringify({ provider: prov, voiceId }));
    } catch { /* ignore */ }
  }, []);

  // ── Stop all speech ──
  const stop = useCallback(() => {
    // Stop browser TTS
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speechSynthesisUtteranceRef.current = null;

    // Stop audio element
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }

    // Disconnect source from analyser (but don't destroy the analyser)
    if (currentSourceRef.current) {
      try { currentSourceRef.current.disconnect(); } catch { /* ignore */ }
      currentSourceRef.current = null;
    }

    setIsSpeaking(false);
  }, []);

  // ── Edge TTS (backend API) — primary method with retry ──
  const speakEdgeTTS = useCallback(async (text: string, voice: string, _attempt: number = 1) => {
    stop();
    ensureAudioContext();
    setIsSpeaking(true);

    const MAX_RETRIES = 2;

    try {
      const controller = new AbortController();
      const timeoutMs = _attempt === 1 ? 15000 : 20000; // longer timeout on retry
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.substring(0, 2000), voice }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`[BOKA TTS] API error: ${res.status} (attempt ${_attempt}/${MAX_RETRIES})`);
        if (_attempt < MAX_RETRIES) {
          return speakEdgeTTS(text, voice, _attempt + 1);
        }
        console.warn('[BOKA TTS] All retries exhausted, falling back to browser TTS');
        setFallbackReason(`Edge TTS błąd ${res.status}`);
        setIsSpeaking(false);
        speakBrowser(text);
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('audio')) {
        console.warn(`[BOKA TTS] Non-audio response (attempt ${_attempt}/${MAX_RETRIES})`);
        if (_attempt < MAX_RETRIES) {
          return speakEdgeTTS(text, voice, _attempt + 1);
        }
        setFallbackReason('Edge TTS zła odpowiedź');
        setIsSpeaking(false);
        speakBrowser(text);
        return;
      }

      const blob = await res.blob();
      if (blob.size < 100) {
        console.warn(`[BOKA TTS] Audio too small (${blob.size}B, attempt ${_attempt}/${MAX_RETRIES})`);
        if (_attempt < MAX_RETRIES) {
          return speakEdgeTTS(text, voice, _attempt + 1);
        }
        setFallbackReason('Edge TTS puste audio');
        setIsSpeaking(false);
        speakBrowser(text);
        return;
      }

      // SUCCESS — clear fallback notification
      setFallbackReason(null);

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.crossOrigin = 'anonymous';
      audioElementRef.current = audio;

      // Connect audio to analyser for waveform visualization
      const ctx = audioContextRef.current;
      const analyser = analyserRef.current;
      if (ctx && analyser) {
        try {
          const source = ctx.createMediaElementSource(audio);
          source.connect(analyser);
          currentSourceRef.current = source;

          // Ensure AudioContext is running
          if (ctx.state === 'suspended') {
            try { await ctx.resume(); } catch { /* ignore */ }
          }
        } catch (e) {
          console.warn('[BOKA TTS] Could not connect audio to analyser:', e);
          // Still play audio directly even without analyser
        }
      }

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioElementRef.current = null;
        if (currentSourceRef.current) {
          try { currentSourceRef.current.disconnect(); } catch { /* */ }
          currentSourceRef.current = null;
        }
      };

      audio.onerror = (e) => {
        console.warn('[BOKA TTS] Audio playback error, falling back to browser TTS:', e);
        setFallbackReason('Błąd odtwarzania Edge TTS');
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioElementRef.current = null;
        if (currentSourceRef.current) {
          try { currentSourceRef.current.disconnect(); } catch { /* */ }
          currentSourceRef.current = null;
        }
        speakBrowser(text);
      };

      await audio.play();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[BOKA TTS] Edge TTS error: ${msg} (attempt ${_attempt}/${MAX_RETRIES})`);
      if (_attempt < MAX_RETRIES) {
        return speakEdgeTTS(text, voice, _attempt + 1);
      }
      setFallbackReason('Edge TTS niedostępny');
      setIsSpeaking(false);
      speakBrowser(text);
    }
  }, [stop, ensureAudioContext]);

  // ── Browser SpeechSynthesis fallback ──
  const speakBrowser = useCallback((text: string, voiceName?: string) => {
    stop();
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    ensureAudioContext();
    setIsSpeaking(true);

    const utterance = new SpeechSynthesisUtterance(text.substring(0, 2000));
    utterance.lang = 'pl-PL';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Try to find a Polish voice
    if (voiceName) {
      const voiceId = voiceName.replace('browser-', '');
      const voice = browserVoices.find(v => v.name === voiceId)?.voice;
      if (voice) utterance.voice = voice;
    }

    if (!utterance.voice || utterance.voice.lang === '') {
      const voices = window.speechSynthesis.getVoices();
      const plVoice = voices.find(v => v.lang.startsWith('pl'));
      if (plVoice) utterance.voice = plVoice;
    }

    speechSynthesisUtteranceRef.current = utterance;

    utterance.onend = () => {
      setIsSpeaking(false);
      speechSynthesisUtteranceRef.current = null;
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      speechSynthesisUtteranceRef.current = null;
    };

    window.speechSynthesis.speak(utterance);
  }, [stop, ensureAudioContext, browserVoices]);

  // ── Main speak function ──
  const speak = useCallback((text: string) => {
    const cleanText = text
      .replace(/\[.*?\]/g, '')
      .replace(/\*\*.*?\*\*/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .trim();
    if (!cleanText) return;

    if (provider === 'edge-tts') {
      speakEdgeTTS(cleanText, selectedVoiceId);
    } else {
      speakBrowser(cleanText, selectedVoiceId);
    }
  }, [provider, selectedVoiceId, speakEdgeTTS, speakBrowser]);

  // Change voice
  const setVoice = useCallback((prov: TTSProvider, voiceId: string) => {
    setProvider(prov);
    setSelectedVoiceId(voiceId);
    savePreference(prov, voiceId);
  }, [savePreference]);

  // ── MICROPHONE: Connect mic to separate analyser for voice-reactive waveform ──
  const startMic = useCallback(async () => {
    try {
      ensureAudioContext();
      const ctx = audioContextRef.current;
      if (!ctx) return;

      // Already running
      if (micStreamRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      // Create a SEPARATE analyser for mic (we don't want mic audio going to speakers)
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyser.smoothingTimeConstant = 0.8;

      const micSource = ctx.createMediaStreamSource(stream);
      micSource.connect(micAnalyser);
      // Do NOT connect micAnalyser to destination — no feedback!

      micAnalyserRef.current = micAnalyser;
      micSourceRef.current = micSource;

      // CRITICAL: Set state so React re-renders and BokaFace gets the mic analyser
      setMicAnalyserNode(micAnalyser);
      setMicActive(true);
    } catch (e) {
      console.warn('[BOKA TTS] Could not start microphone:', e);
    }
  }, [ensureAudioContext]);

  const stopMic = useCallback(() => {
    if (micSourceRef.current) {
      try { micSourceRef.current.disconnect(); } catch { /* ignore */ }
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    micAnalyserRef.current = null;

    // Clear state so BokaFace stops trying to use mic analyser
    setMicAnalyserNode(null);
    setMicActive(false);
  }, []);

  // ── Sound effects: burps & farts ──
  const playBurp = useCallback(() => {
    ensureAudioContext();
    const ctx = audioContextRef.current;
    if (!ctx) return;
    // Route through analyser for waveform visualization
    const analyser = analyserRef.current;
    if (analyser) {
      synthesizeSoundEffect(ctx, 'burp', analyser);
    } else {
      synthesizeSoundEffect(ctx, 'burp');
    }
  }, [ensureAudioContext]);

  const playFart = useCallback(() => {
    ensureAudioContext();
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const analyser = analyserRef.current;
    if (analyser) {
      synthesizeSoundEffect(ctx, 'fart', analyser);
    } else {
      synthesizeSoundEffect(ctx, 'fart');
    }
  }, [ensureAudioContext]);

  /** Play a random body sound — burp or fart, with slight burp bias */
  const playRandomBodySound = useCallback(() => {
    ensureAudioContext();
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const analyser = analyserRef.current;
    const type: SoundEffectType = Math.random() < 0.5 ? 'burp' : 'fart';
    if (analyser) {
      synthesizeSoundEffect(ctx, type, analyser);
    } else {
      synthesizeSoundEffect(ctx, type);
    }
  }, [ensureAudioContext]);

  /** Play a sneeze sound — for rainy days in Rozprza! */
  const playSneeze = useCallback(() => {
    ensureAudioContext();
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const analyser = analyserRef.current;
    if (analyser) {
      synthesizeSoundEffect(ctx, 'sneeze', analyser);
    } else {
      synthesizeSoundEffect(ctx, 'sneeze');
    }
  }, [ensureAudioContext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMic();
      stop();
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch { /* ignore */ }
        audioContextRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // All available voices
  const allVoices = [
    ...EDGE_TTS_VOICES.map(v => ({
      id: v.id,
      name: `${v.name} (${v.gender === 'male' ? 'męski' : 'żeński'}) — Edge TTS`,
      provider: 'edge-tts' as TTSProvider,
      description: v.description,
      gender: v.gender,
    })),
    ...browserVoices.map(v => ({
      id: v.id,
      name: `${v.name} — Przeglądarka`,
      provider: 'browser' as TTSProvider,
      description: 'Wbudowany głos przeglądarki',
      gender: 'unknown' as const,
    })),
  ];

  // Auto-clear fallback notification after 8 seconds
  useEffect(() => {
    if (!fallbackReason) return;
    const timer = setTimeout(() => setFallbackReason(null), 8000);
    return () => clearTimeout(timer);
  }, [fallbackReason]);

  return {
    isSpeaking,
    isSupported,
    speak,
    stop,
    provider,
    selectedVoiceId,
    setVoice,
    allVoices,
    analyserNode,       // Now a state value, triggers re-renders!
    micAnalyserNode,    // Now a state value, triggers re-renders!
    micActive,
    startMic,
    stopMic,
    playBurp,
    playFart,
    playSneeze,
    playRandomBodySound,
    fallbackReason,    // Non-null = browser voice fallback active (reason string)
  };
}
