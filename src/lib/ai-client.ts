/**
 * Generic AI client wrapper.
 * Tries to load AI SDK if available, otherwise provides stubs.
 * All SDK calls in the codebase should use getAIClient() instead of direct imports.
 */

let _client: any = null;

export async function getAIClient(): Promise<any> {
  if (_client) return _client;
  try {
    const mod = await import('z-ai-web-dev-sdk');
    const ZAI = mod.default || mod;
    _client = await ZAI.create();
    return _client;
  } catch {
    return null;
  }
}

/** Check if the SDK is available */
export async function isAIAvailable(): Promise<boolean> {
  const client = await getAIClient();
  return client !== null;
}
