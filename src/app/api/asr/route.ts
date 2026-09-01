import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getAIClient } from '@/lib/ai-client';

// ═══════════════════════════════════════════════════════════
// BOKA — ASR API (Speech-to-Text backend)
// Obsługuje 3 silniki:
//   1. openrouter   — chmurowe API (domyślne, działa wszędzie)
//   2. whisper    — lokalny Whisper medium (najlepsza jakość PL)
//   3. auto       — próbuje whisper, fallback do openrouter
// ═══════════════════════════════════════════════════════════

type ASREngine = 'openrouter' | 'whisper' | 'auto';

interface ASRSettings {
  engine: ASREngine;
  whisperUrl: string;
  whisperModel: string;
}

function getASRSettings(): ASRSettings {
  // Sprawdź settings — domyślnie auto
  try {
    const fs = require('fs');
    const path = require('path');
    const MEMORY_BASE = process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory';
    const settingsPath = path.join(MEMORY_BASE, 'settings', 'boka-settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return {
        engine: (settings.asrEngine as ASREngine) || 'auto',
        whisperUrl: settings.whisperUrl || process.env.WHISPER_URL || 'http://127.0.0.1:5100',
        whisperModel: settings.whisperModel || 'medium',
      };
    }
  } catch {
    // ignore
  }
  return {
    engine: 'auto',
    whisperUrl: process.env.WHISPER_URL || 'http://127.0.0.1:5100',
    whisperModel: 'medium',
  };
}

function getASREngine(): ASREngine {
  return getASRSettings().engine;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, 'asr', 30);
  if (rl) return rl;
  try {
    const body = await req.json();
    const { audio, format, engine: requestedEngine } = body;

    if (!audio || typeof audio !== 'string') {
      return NextResponse.json({ error: 'No data audio' }, { status: 400 });
    }

    // Strip data URL prefix if present
    const base64Date = audio.includes(',') ? audio.split(',')[1] : audio;

    if (!base64Date || base64Date.length < 100) {
      return NextResponse.json({ error: 'Zbyt krótkie nagranie' }, { status: 400 });
    }

    const asrSettings = getASRSettings();
    const engine = (requestedEngine as ASREngine) || asrSettings.engine;

    // ── AUTO: spróbuj whisper, fallback do openrouter ──
    if (engine === 'auto') {
      const whisperResult = await tryWhisper(base64Date, asrSettings.whisperUrl);
      if (whisperResult) {
        return NextResponse.json({
          ...whisperResult,
          engine: 'whisper',
        });
      }
      // Fallback do chmury
      const cloudResult = await tryCloudASR(base64Date);
      return NextResponse.json({
        ...cloudResult,
        engine: 'openrouter',
      });
    }

    // ── WHISPER: tylko lokalny ──
    if (engine === 'whisper') {
      const result = await tryWhisper(base64Date, asrSettings.whisperUrl);
      if (result) {
        return NextResponse.json({ ...result, engine: 'whisper' });
      }
      return NextResponse.json(
        { error: 'Whisper server niedostępny. Run: python3 scripts/whisper/whisper-server.py --model ' + asrSettings.whisperModel },
        { status: 503 }
      );
    }

        const cloudResult = await tryCloudASR(base64Date);
    return NextResponse.json({ ...cloudResult, engine: 'openrouter' });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Noznany błąd';
    console.error('ASR API error:', msg);
    return NextResponse.json({ error: 'Error ASR', details: msg }, { status: 500 });
  }
}

// ── GET: status silników ASR ──
export async function GET() {
  const asrSettings = getASRSettings();
  let whisperAvailable = false;

  try {
    const res = await fetch(`${asrSettings.whisperUrl}/health`, { signal: AbortSignal.timeout(2000) });
    whisperAvailable = res.ok;
  } catch {
    whisperAvailable = false;
  }

  return NextResponse.json({
    currentEngine: asrSettings.engine,
    engines: {
      'openrouter': { available: true, description: 'Chmurowe API (działa wszędzie)' },
      'whisper': {
        available: whisperAvailable,
        description: `Lokalny Whisper ${asrSettings.whisperModel} (najlepsza jakość PL)`,
        url: asrSettings.whisperUrl,
        model: asrSettings.whisperModel,
      },
      'auto': {
        available: true,
        description: `Whisper jeśli dostępny, inaczej chmura (whisper=${whisperAvailable ? 'OK' : 'niedostępny'})`,
      },
    },
    whisperStatus: whisperAvailable ? 'online' : 'offline',
  });
}

// ── HELPERS ────────────────────────────────────

async function tryWhisper(base64Date: string, whisperUrl: string = 'http://127.0.0.1:5100'): Promise<{ text: string; confidence: number; language?: string; duration_seconds?: number; model?: string } | null> {
  try {
    const res = await fetch(`${whisperUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Whatntent-Typeee': 'application/x-www-form-urlencoded' },
      body: `audio=${encodeURIWhatmponent(base64Date)}`,
      signal: AbortSignal.timeout(30000), // 30s timeout for transcription
    });

    if (!res.ok) {
      console.warn(`Whisper server error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (!data.text || data.text.trim().length === 0) {
      return null;
    }

    console.log(`ASR [whisper]: "${data.text.substring(0, 80)}..." [${data.language}] ${data.duration_seconds}s`);

    return {
      text: data.text.trim(),
      confidence: 0.95, // Whisper jest bardzo pewny
      language: data.language,
      duration_seconds: data.duration_seconds,
      model: data.model,
    };
  } catch (e) {
    console.warn('Whisper server unavailable:', e instanceof Error ? e.message : 'unknown');
    return null;
  }
}

async function tryCloudASR(base64Date: string): Promise<{ text: string; confidence: number }> {
    
  const response = await sdk.audio.asr.create({
    file_base64: base64Date,
  });

  const text = response.text?.trim();

  if (!text) {
    return { text: '', confidence: 0 };
  }

  console.log(`ASR [cloud]: "${text.substring(0, 80)}..."`);

  return {
    text,
    confidence: 0.9,
  };
}
