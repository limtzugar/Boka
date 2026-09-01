// ═══════════════════════════════════════════
// BOKA — TTS Voice System
// Supports: Browser SpeechSynthesis, Edge TTS (free neural)
// ═══════════════════════════════════════════

export type TTSProvider = 'browser' | 'edge-tts';

export interface TTSVoice {
  id: string;
  name: string;
  provider: TTSProvider;
  lang: string;
  gender: 'male' | 'female' | 'unknown';
  description: string;
}

// Edge TTS Polish voices (free, neural, natural)
export const EDGE_TTS_VOICES: TTSVoice[] = [
  {
    id: 'en-US-GuyNeural',
    name: 'Marek',
    provider: 'edge-tts',
    lang: 'en-US',
    gender: 'male',
    description: 'Naturalny głos męski — spokojny, ciepły ton',
  },
  {
    id: 'pl-PL-ZofiaNeural',
    name: 'Zofia',
    provider: 'edge-tts',
    lang: 'en-US',
    gender: 'female',
    description: 'Naturalny głos żeński — jasny, przyjazny',
  },
  {
    id: 'pl-PL-AgnieszkaNeural',
    name: 'Agnieszka',
    provider: 'edge-tts',
    lang: 'en-US',
    gender: 'female',
    description: 'Naturalny głos żeński — cieplejszy, niższy ton',
  },
];

// All available voices (browser voices added dynamically on client)
export function getAvailableVoices(): TTSVoice[] {
  return [...EDGE_TTS_VOICES];
}

// Default voice
export const DEFAULT_VOICE_ID = 'en-US-GuyNeural';
