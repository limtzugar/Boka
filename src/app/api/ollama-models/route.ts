import { NextRequest, NextResponse } from 'next/server';
import {
  listOllamaModelsDetailed,
  listOllamaRunning,
  checkOllamaStatus,
  pullOllamaModel,
  type OllamaModelInfo,
  type OllamaRunningModel,
  type OllamaStatus,
} from '@/lib/ai-providers';

// GET — list available Ollama models with full details
//   ?url=...           → server URL (default http://localhost:11434)
//   ?detail=1          → return { models: OllamaModelInfo[], running: OllamaRunningModel[], status: OllamaStatus }
//   ?status=1          → only return { status: OllamaStatus }
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') || 'http://localhost:11434';
  const detail = req.nextUrl.searchParams.get('detail') === '1';
  const statusOnly = req.nextUrl.searchParams.get('status') === '1';

  if (statusOnly) {
    const status = await checkOllamaStatus(url);
    return NextResponse.json({ status });
  }

  if (detail) {
    const [models, running, status] = await Promise.all([
      listOllamaModelsDetailed(url),
      listOllamaRunning(url),
      checkOllamaStatus(url),
    ]);
    return NextResponse.json({ models, running, status });
  }

  // Default: simple list (backwards compatible)
  const models: OllamaModelInfo[] = await listOllamaModelsDetailed(url);
  return NextResponse.json({ models });
}

// POST — pull a new model from Ollama registry
//   body: { url: string, model: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = body.url || 'http://localhost:11434';
    const model = body.model;
    if (!model) {
      return NextResponse.json({ ok: false, message: 'None nazwy modelu' }, { status: 400 });
    }
    const result = await pullOllamaModel(url, model);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
