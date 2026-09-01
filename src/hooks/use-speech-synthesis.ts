'use client';

import { useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import { useAppStore } from '@/lib/store';

function subscribe() { return () => {}; }
function getSnapshot() {
  if (typeof window === 'undefined') return false;
  return !!window.speechSynthesis;
}
function getServerSnapshot() { return false; }

export function useSpeechSynthesis() {
  const isSpeaking = useAppStore(s => s.isSpeaking);
  const setSpeaking = useAppStore(s => s.setSpeaking);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isSupported = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Clean text for speech (remove markdown)
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/[-*]\s/g, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;

    // Try to find a Polish voice
    const voices = window.speechSynthesis.getVoices();
    const polishVoice = voices.find(v => v.lang.startsWith('pl'));
    if (polishVoice) {
      utterance.voice = polishVoice;
    }

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [setSpeaking]);

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, [setSpeaking]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Load voices (some browsers load them async)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.getVoices(); // trigger load
    const handleVoicesChanged = () => {
      window.speechSynthesis.getVoices();
    };
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
    };
  }, []);

  return {
    isSpeaking,
    speak,
    stop,
    isSupported,
  };
}
