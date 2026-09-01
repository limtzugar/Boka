import { NextResponse } from 'next/server';
import { checkDesktopAgentCapabilities } from '@/lib/desktop-agent';
import { loadSettings } from '@/lib/ai-providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/desktop/status
 * Zwraca capabilities desktop agenta (czy screenshot i input działają)
 * oraz czy skonfigurowany model AI wspiera vision.
 */
export async function GET() {
  const caps = checkDesktopAgentCapabilities();
  const settings = loadSettings();

  // Sprawdź czy provider wspiera vision
  let visionSupport = false;
  let visionNote = '';

  switch (settings.provider) {
    case 'z-ai-sdk':
      visionSupport = true;
      visionNote = 'Z-AI SDK VLM (wbudowany)';
      break;
    case 'openrouter':
      // Sprawdź czy model ma vision w nazwie (heurystyka)
      const m = (settings.openrouterModel || '').toLowerCase();
      visionSupport = m.includes('vision') || m.includes('vl') || m.includes('gpt-4') || m.includes('claude') || m.includes('qwen') || m.includes('llama') || m.includes('pixtral');
      visionNote = visionSupport
        ? `OpenRouter: ${settings.openrouterModel} (heurystyka: może wspierać vision)`
        : `OpenRouter: ${settings.openrouterModel} — wybierz model z vision (Claude 3.5, GPT-4V, Qwen-VL)`;
      break;
    case 'ollama':
      const om = (settings.ollamaModel || '').toLowerCase();
      visionSupport = om.includes('llava') || om.includes('llama3.2-vision') || om.includes('minicpm') || om.includes('moondream');
      visionNote = visionSupport
        ? `Ollama: ${settings.ollamaModel}`
        : `Ollama: ${settings.ollamaModel} — zainstaluj: ollama pull llava`;
      break;
    case 'gguf':
      visionSupport = false;
      visionNote = 'GGUF/llama.cpp — brak wsparcia vision w tej konfiguracji';
      break;
    case 'custom':
      visionSupport = true;  // zakładamy że wspiera
      visionNote = `Custom API: ${settings.customModel || 'default'} (zakładamy vision)`;
      break;
  }

  return NextResponse.json({
    ok: true,
    capabilities: caps,
    vision: {
      supported: visionSupport,
      note: visionNote,
      provider: settings.provider,
      model: settings.openrouterModel || settings.ollamaModel || settings.customModel || 'z-ai-sdk',
    },
  });
}
