'use client';

import { useState, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import {
  downsampleSpectrum,
  combinedSimilarity,
  normalizeSpectrum,
} from '@/lib/speaker-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A stored voice fingerprint for one family member. */
export interface VoiceProfile {
  memberId: string;
  memberName: string;
  /** Average frequency magnitudes across SPECTRAL_BINS bins (0-1 range) */
  spectralFingerprint: number[];
  /** How many sample windows contributed to this fingerprint */
  sampleCount: number;
  /** Unix timestamp of last update */
  lastUpdated: number;
}

/** Result of attempting to identify the current speaker. */
export interface SpeakerMatch {
  memberId: string;
  memberName: string;
  /** Confidence score 0-1; only set when above MATCH_THRESHOLD */
  confidence: number;
}

export interface UseSpeakerIdReturn {
  /** Best guess for who is currently speaking, or null */
  currentSpeaker: SpeakerMatch | null;
  /** True while the identification loop is running */
  isIdentifying: boolean;

  /** All stored voice profiles */
  profiles: VoiceProfile[];

  /** Learn: record voice samples for a known member (they selected their profile) */
  learnVoice: (memberId: string, memberName: string, analyserNode: AnalyserNode) => void;
  /** Stop learning and persist the accumulated profile */
  stopLearning: () => void;

  /** Identify: start real-time matching of an unknown speaker against stored profiles */
  startIdentifying: (analyserNode: AnalyserNode) => void;
  /** Stop the identification loop */
  stopIdentifying: () => void;

  /** Delete a single member's voice profile */
  deleteProfile: (memberId: string) => void;
  /** Delete all stored voice profiles */
  clearAllProfiles: () => void;

  /** Number of stored profiles */
  profileCount: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Number of spectral bins stored per profile */
const SPECTRAL_BINS = 32;

/** How often (ms) we sample the analyser node during learning */
const LEARN_SAMPLE_INTERVAL_MS = 200;

/** How often (ms) we sample during identification */
const IDENTIFY_SAMPLE_INTERVAL_MS = 500;

/** Minimum total learning time (ms) before a profile is persisted */
const MIN_LEARN_DURATION_MS = 3000;

/** Minimum number of samples before a profile is persisted */
const MIN_LEARN_SAMPLES = 10;

/** Cosine-similarity threshold above which we consider a match valid */
const MATCH_THRESHOLD = 0.5;

/** localStorage key for persisting voice profiles */
const STORAGE_KEY = 'boka-voice-profiles';

/** FFT size used when we create our own AnalyserNode config recommendation */
export const RECOMMENDED_FFT_SIZE = 256;

// ─── Persistence helpers ─────────────────────────────────────────────────────

function parseProfiles(raw: string | null): VoiceProfile[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p: unknown): p is VoiceProfile =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as VoiceProfile).memberId === 'string' &&
        typeof (p as VoiceProfile).memberName === 'string' &&
        Array.isArray((p as VoiceProfile).spectralFingerprint),
    );
  } catch {
    return [];
  }
}

function loadProfiles(): VoiceProfile[] {
  if (typeof window === 'undefined') return [];
  return parseProfiles(localStorage.getItem(STORAGE_KEY));
}

function saveProfiles(profiles: VoiceProfile[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    console.warn('[BOKA SpeakerId] Failed to persist voice profiles to localStorage');
  }
}

// ─── useSyncExternalStore for localStorage profiles (SSR-safe, no effect) ────

/**
 * Minimal external store backed by localStorage.
 * Uses an in-memory version counter so subscribers are notified only when
 * we actually write (not on every read or unrelated storage events).
 */
let storeVersion = 0;
const storeListeners = new Set<() => void>();

function subscribeToStore(cb: () => void): () => void {
  storeListeners.add(cb);
  return () => storeListeners.delete(cb);
}

function notifyStoreListeners() {
  storeVersion++;
  storeListeners.forEach(cb => cb());
}

// Cached snapshot: only create a new reference when the data actually changes.
// Without this, loadProfiles() returns a new array every call, causing
// useSyncExternalStore to think the store changed → infinite re-renders.
let cachedSnapshot: VoiceProfile[] = [];
let cachedRaw: string | undefined;

function getStoreSnapshot(): VoiceProfile[] {
  const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (raw !== cachedRaw) {
    cachedRaw = raw ?? undefined;
    cachedSnapshot = parseProfiles(raw);
  }
  return cachedSnapshot;
}

const SERVER_SNAPSHOT: VoiceProfile[] = [];
function getServerSnapshot(): VoiceProfile[] {
  return SERVER_SNAPSHOT;
}

// ─── Spectrum extraction ─────────────────────────────────────────────────────

/**
 * Capture a single spectral snapshot from an AnalyserNode.
 * Returns a downsampled, normalized 32-bin fingerprint.
 */
function captureSpectrum(analyserNode: AnalyserNode): number[] {
  const bufferLength = analyserNode.frequencyBinCount; // fftSize / 2
  const dataArray = new Uint8Array(bufferLength);
  analyserNode.getByteFrequencyData(dataArray);

  const downsampled = downsampleSpectrum(dataArray, SPECTRAL_BINS);
  return normalizeSpectrum(downsampled);
}

/**
 * Compute an incremental running average for a spectral fingerprint.
 * Blends the new sample into the existing profile with decreasing weight
 * so that early samples have proportionally more influence.
 *
 * α = 1 / (n + 1) gives the same result as a true arithmetic mean.
 *
 * @param existing  - Current average fingerprint (or null for first sample)
 * @param newSample - New spectral snapshot
 * @param sampleCount - How many samples have already been averaged into `existing`
 * @returns Updated average fingerprint and new sample count
 */
function incrementalAverage(
  existing: number[] | null,
  newSample: number[],
  sampleCount: number,
): { fingerprint: number[]; newCount: number } {
  if (!existing || sampleCount === 0) {
    return { fingerprint: [...newSample], newCount: 1 };
  }

  const alpha = 1 / (sampleCount + 1);
  const blended = existing.map((val, i) => val + alpha * ((newSample[i] ?? 0) - val));

  return { fingerprint: blended, newCount: sampleCount + 1 };
}

// ─── The Hook ────────────────────────────────────────────────────────────────

export function useSpeakerId(): UseSpeakerIdReturn {
  // ── Hydration-safe profile loading via useSyncExternalStore ─────────────
  // This avoids calling setState in an effect (which triggers cascading renders)
  // and correctly handles SSR by returning [] on the server.
  const profiles = useSyncExternalStore(
    subscribeToStore,
    getStoreSnapshot,
    getServerSnapshot,
  );

  // ── Local state ────────────────────────────────────────────────────────
  const [currentSpeaker, setCurrentSpeaker] = useState<SpeakerMatch | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);

  // ── Refs (not rendered, just for interval/bookkeeping) ─────────────────
  const learnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const identifyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Accumulator for the learning phase
  const learnAccumulatorRef = useRef<{
    memberId: string;
    memberName: string;
    fingerprint: number[] | null;
    sampleCount: number;
    startTime: number;
  } | null>(null);

  // Keep a live ref to profiles so callbacks always see the latest
  const profilesRef = useRef<VoiceProfile[]>([]);

  // ── Sync the ref whenever profiles change ───────────────────────────────
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (learnIntervalRef.current) clearInterval(learnIntervalRef.current);
      if (identifyIntervalRef.current) clearInterval(identifyIntervalRef.current);
    };
  }, []);

  // ── Learn voice ────────────────────────────────────────────────────────
  const learnVoice = useCallback(
    (memberId: string, memberName: string, analyserNode: AnalyserNode) => {
      // Stop any previous learning session first
      if (learnIntervalRef.current) {
        clearInterval(learnIntervalRef.current);
      }

      // Initialize accumulator
      learnAccumulatorRef.current = {
        memberId,
        memberName,
        fingerprint: null,
        sampleCount: 0,
        startTime: Date.now(),
      };

      learnIntervalRef.current = setInterval(() => {
        const acc = learnAccumulatorRef.current;
        if (!acc) return;

        const snapshot = captureSpectrum(analyserNode);

        // Check if the snapshot has enough energy (someone is actually speaking)
        const energy = snapshot.reduce((sum, v) => sum + v, 0);
        if (energy < 0.1) return; // Silence or very quiet — skip

        const result = incrementalAverage(acc.fingerprint, snapshot, acc.sampleCount);
        acc.fingerprint = result.fingerprint;
        acc.sampleCount = result.newCount;
      }, LEARN_SAMPLE_INTERVAL_MS);
    },
    [],
  );

  // ── Stop learning & persist ────────────────────────────────────────────
  const stopLearning = useCallback(() => {
    if (learnIntervalRef.current) {
      clearInterval(learnIntervalRef.current);
      learnIntervalRef.current = null;
    }

    const acc = learnAccumulatorRef.current;
    if (!acc) return;
    learnAccumulatorRef.current = null;

    const elapsed = Date.now() - acc.startTime;

    // Only persist if we have enough data
    if (!acc.fingerprint || acc.sampleCount < MIN_LEARN_SAMPLES || elapsed < MIN_LEARN_DURATION_MS) {
      console.warn(
        `[BOKA SpeakerId] Learning session too short (${acc.sampleCount} samples, ${elapsed}ms). Profile not saved.`,
      );
      return;
    }

    const currentProfiles = profilesRef.current;
    const existingIdx = currentProfiles.findIndex(p => p.memberId === acc.memberId);
    let updated: VoiceProfile[];

    const newProfile: VoiceProfile = {
      memberId: acc.memberId,
      memberName: acc.memberName,
      spectralFingerprint: acc.fingerprint,
      sampleCount: acc.sampleCount,
      lastUpdated: Date.now(),
    };

    if (existingIdx >= 0) {
      // Merge with existing profile — weighted average based on sample counts
      const existing = currentProfiles[existingIdx]!;
      const totalSamples = existing.sampleCount + newProfile.sampleCount;
      const weightNew = newProfile.sampleCount / totalSamples;
      const weightOld = 1 - weightNew;

      const mergedFingerprint = existing.spectralFingerprint.map(
        (val, i) => val * weightOld + (newProfile.spectralFingerprint[i] ?? 0) * weightNew,
      );

      const mergedProfile: VoiceProfile = {
        memberId: acc.memberId,
        memberName: acc.memberName,
        spectralFingerprint: mergedFingerprint,
        sampleCount: totalSamples,
        lastUpdated: Date.now(),
      };

      updated = [...currentProfiles];
      updated[existingIdx] = mergedProfile;
    } else {
      updated = [...currentProfiles, newProfile];
    }

    saveProfiles(updated);
    notifyStoreListeners(); // Trigger re-render via useSyncExternalStore
  }, []);

  // ── Start identifying ──────────────────────────────────────────────────
  const startIdentifying = useCallback((analyserNode: AnalyserNode) => {
    // Stop any previous identification session
    if (identifyIntervalRef.current) {
      clearInterval(identifyIntervalRef.current);
    }

    setIsIdentifying(true);
    setCurrentSpeaker(null);

    identifyIntervalRef.current = setInterval(() => {
      const currentProfiles = profilesRef.current;
      if (currentProfiles.length === 0) {
        setCurrentSpeaker(null);
        return;
      }

      const snapshot = captureSpectrum(analyserNode);

      // Check if the snapshot has enough energy (someone is actually speaking)
      const energy = snapshot.reduce((sum, v) => sum + v, 0);
      if (energy < 0.1) {
        // Silence — don't clear the speaker, just skip this frame
        return;
      }

      // Compare against all stored profiles and find the best match
      let bestMatch: { memberId: string; memberName: string; score: number } | null = null;

      for (const profile of currentProfiles) {
        const score = combinedSimilarity(snapshot, profile.spectralFingerprint);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { memberId: profile.memberId, memberName: profile.memberName, score };
        }
      }

      if (bestMatch && bestMatch.score >= MATCH_THRESHOLD) {
        setCurrentSpeaker({
          memberId: bestMatch.memberId,
          memberName: bestMatch.memberName,
          confidence: bestMatch.score,
        });
      } else {
        // Below threshold — unknown speaker
        setCurrentSpeaker(null);
      }
    }, IDENTIFY_SAMPLE_INTERVAL_MS);
  }, []);

  // ── Stop identifying ───────────────────────────────────────────────────
  const stopIdentifying = useCallback(() => {
    if (identifyIntervalRef.current) {
      clearInterval(identifyIntervalRef.current);
      identifyIntervalRef.current = null;
    }
    setIsIdentifying(false);
    setCurrentSpeaker(null);
  }, []);

  // ── Delete a single profile ────────────────────────────────────────────
  const deleteProfile = useCallback((memberId: string) => {
    const updated = profilesRef.current.filter(p => p.memberId !== memberId);
    saveProfiles(updated);
    notifyStoreListeners();
  }, []);

  // ── Clear all profiles ─────────────────────────────────────────────────
  const clearAllProfiles = useCallback(() => {
    saveProfiles([]);
    notifyStoreListeners();
  }, []);

  return {
    currentSpeaker,
    isIdentifying,
    profiles,
    learnVoice,
    stopLearning,
    startIdentifying,
    stopIdentifying,
    deleteProfile,
    clearAllProfiles,
    profileCount: profiles.length,
  };
}
