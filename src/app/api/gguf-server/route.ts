import { NextRequest, NextResponse } from 'next/server';
import {
  startGgufServer,
  stopGgufServer,
  getGgufServerStatus,
  detectLlamaServer,
  loadSettings,
} from '@/lib/ai-providers';

// GET — status serwera GGUF + detekcja llama-server
export async function GET() {
  const settings = loadSettings();
  const status = getGgufServerStatus();
  const detectedPath = detectLlamaServer(settings.ggufServerPath);
  return NextResponse.json({
    running: status.running,
    model: status.model,
    port: status.port,
    llamaServerDetected: detectedPath,
    llamaServerPath: detectedPath,
    ggufFilePath: settings.ggufFilePath,
    ggufFileExists: settings.ggufFilePath ? true : false,  // nie sprawdzamy fs z API route tutaj
  });
}

// POST — start serwera GGUF
export async function POST(req: NextRequest) {
  try {
    const settings = loadSettings();
    const result = await startGgufServer(settings);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// DELETE — stop serwera GGUF
export async function DELETE() {
  stopGgufServer();
  return NextResponse.json({ ok: true, message: 'Server GGUF zatrzymany' });
}
