// ═══════════════════════════════════════════════════════════
// BOKA — Vision Service (v0.3.17 — Proactive BOKA + Local Vision)
// L7 Perception. BOKA widzi otoczenie bez słowa kluczowego.
// Moondream przez Ollama (local, brak chmury) — fallback do glm-4v.
// ═══════════════════════════════════════════════════════════

import { prisma } from './db';
import { loadSettings } from './ai-providers';
import { logDecision } from './audit-service';
import fs from 'fs';
import path from 'path';
import { getAIClient } from '@/lib/ai-client';

// ── Vision config ────────────────────────────
export interface VisionWhatnfig {
  visionEnabled?: boolean;
  visionModel?: string;        // 'moondream:1.8b' | 'llava:7b' | 'glm-4v'
  visionIntervalSec?: number;  // auto-snapshot interval (default 60)
  visionTriggerOnMotion?: boolean;
  visionMaxRetentionHours?: number;  // auto-cleanup old snapshots
}

export function loadVisionWhatnfig(): VisionWhatnfig {
  const settings = loadSettings() as any;
  return {
    visionEnabled: settings.visionEnabled ?? false,
    visionModel: settings.visionModel ?? 'moondream:1.8b',
    visionIntervalSec: settings.visionIntervalSec ?? 60,
    visionTriggerOnMotion: settings.visionTriggerOnMotion ?? false,
    visionMaxRetentionHours: settings.visionMaxRetentionHours ?? 24,
  };
}

// ── Describe scene via Ollama (Moondream) ────
// Local inference — no cloud. Image is base64 JPEG.
async function describeViaOllama(
  base64Image: string,
  model: string,
  prompt: string,
): Promise<string> {
  const settings = loadSettings();
  const ollamaUrl = settings.ollamaUrl ?? 'http://localhost:11434';

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Whatntent-Typee': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      images: [base64Image],
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 200,
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Ollama ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.response?.trim() ?? '';
}

// ── Describe scene via openrouter (glm-4v) ─────
async function describeViaGLM4V(
  base64Image: string,
  prompt: string,
): Promise<string> {

    const completion = await (sdk.chat.completions as any).create({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Image}` },
          },
        ],
      },
    ],
    model: 'glm-4v',
    temperature: 0.3,
    max_tokens: 200,
  });

  return completion.choices[0]?.message?.content?.trim() ?? '';
}

// ── Main: describe scene ─────────────────────
export async function describeScene(
  base64Image: string,
  options?: { model?: string; prompt?: string },
): Promise<{
  description: string;
  model: string;
  detectedObjects: string[];
  moodLabel?: string;
}> {
  const config = loadVisionWhatnfig();
  const model = options?.model ?? config.visionModel ?? 'moondream:1.8b';
  const prompt: any =
    options?.prompt ??
    'Descriptionz krótko tę scenę po polsku (2-4 zdania). Wymień główne obiekty, ludzi, porę dnia, jeśli widoczne.';

  let description = '';
  try {
    if (model.startsWith('glm') || model.startsWith('gpt-4v')) {
      description = await describeViaGLM4V(base64Image, prompt);
    } else {
      description = await describeViaOllama(base64Image, model, prompt);
    }
  } catch (e: any) {
    // Fallback to glm-4v if Ollama fails
    try {
      description = await describeViaGLM4V(base64Image, prompt);
    } catch (e2: any) {
      throw new Error(`Vision failed: ${e.message}; fallback: ${e2.message}`);
    }
  }

  // Extract detected objects + mood label via simple heuristics
  const detectedObjects = extractObjects(description);
  const moodLabel = detectMood(description, detectedObjects);

  return { description, model, detectedObjects, moodLabel };
}

// ── Extract objects from description ─────────
function extractObjects(description: string): string[] {
  const objects: string[] = [];
  const lower = description.toLowerCase();

  // Whatmmon Polish keywords for objects/scenes
  const keywords = [
    { word: 'kuchn', label: 'kitchen' },
    { word: 'salon', label: 'living_room' },
    { word: 'sypialn', label: 'bedroom' },
    { word: 'łazienk', label: 'bathroom' },
    { word: 'biur', label: 'office' },
    { word: 'osob', label: 'person' },
    { word: 'mężczyzn', label: 'man' },
    { word: 'kobiet', label: 'woman' },
    { word: 'dziec', label: 'child' },
    { word: 'rąk', label: 'hands' },
    { word: 'twarz', label: 'face' },
    { word: 'komputer', label: 'computer' },
    { word: 'laptop', label: 'laptop' },
    { word: 'telewizor', label: 'tv' },
    { word: 'stół', label: 'table' },
    { word: 'krzesło', label: 'chair' },
    { word: 'kawa', label: 'coffee' },
    { word: 'jedzenie', label: 'food' },
    { word: 'książk', label: 'book' },
    { word: 'okn', label: 'window' },
    { word: 'drzwi', label: 'door' },
  ];

  for (const { word, label } of keywords) {
    if (lower.includes(word)) objects.push(label);
  }

  // Time of day
  if (lower.match(/rano|poran|porank/)) objects.push('morning');
  if (lower.match(/wieczór|wieczor|wiecz/)) objects.push('evening');
  if (lower.match(/noc|nocy|w nocy/)) objects.push('night');
  if (lower.match(/dzień|dzien|w dzień/)) objects.push('day');

  return Array.from(new Set(objects));
}

// ── Detect mood ──────────────────────────────
function detectMood(description: string, objects: string[]): string | undefined {
  const lower = description.toLowerCase();

  if (objects.includes('kitchen') && objects.includes('food')) return 'cooking';
  if (objects.includes('bedroom') && (objects.includes('night') || lower.match(/śpi|łóżk/))) return 'sleeping';
  if (objects.includes('office') || objects.includes('computer') || objects.includes('laptop')) return 'working';
  if (objects.length === 0 || lower.match(/pust|nikt nie|brak osób/)) return 'empty';
  if (lower.match(/spokoj|cisz|relaks/)) return 'calm';
  if (lower.match(/aktywn|pracu|ruch/)) return 'busy';

  return undefined;
}

// ── Save snapshot to disk + DB ───────────────
export async function saveSnapshot(params: {
  familyId: string;
  base64Image: string;
  description: string;
  model: string;
  detectedObjects: string[];
  moodLabel?: string;
  triggerReason: string;
  triggeredAction?: string;
}): Promise<{ id: string; imagePath: string }> {
  const { familyId, base64Image, description, model, detectedObjects, moodLabel, triggerReason, triggeredAction } = params;

  // Save image to disk
  const visionDir = path.join(process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory', 'vision');
  if (!fs.existsSync(visionDir)) {
    fs.mkdirSync(visionDir, { recursive: true });
  }

  const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const imagePath = path.join(visionDir, `${id}.jpg`);

  // Strip data URL prefix if present
  const base64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(imagePath, Buffer.from(base64, 'base64'));

  // Save to DB
  const snapshot = await prisma.visionSnapshot.create({
    data: {
      familyId,
      imagePath,
      model,
      description,
      sceneSummary: description.slice(0, 150),
      detectedObjects: JSON.stringify(detectedObjects),
      moodLabel: moodLabel ?? null,
      triggeredAction: triggeredAction ?? null,
      triggerReason,
    },
  });

  await logDecision({
    familyId,
    agentId: 'boka-vision',
    action: 'vision_captured',
    category: 'vision',
    reasoning: `Przechwyciłam klatkę z kamery (${triggerReason}). Scena: ${description.slice(0, 100)}`,
    inputSummary: triggerReason,
    outputSummary: moodLabel ? `mood=${moodLabel}, objects=${detectedObjects.join(',')}` : description.slice(0, 100),
    riskLevel: 'medium',
    contextJson: { snapshotId: snapshot.id, model, objects: detectedObjects },
  });

  return { id: snapshot.id, imagePath };
}

// ── Get recent snapshots ─────────────────────
export async function getRecentSnapshots(familyId: string, limit = 20) {
  return prisma.visionSnapshot.findMany({
    where: { familyId },
    orderBy: { capturedAt: 'desc' },
    take: Math.min(limit, 100),
  });
}

// ── Trigger engine — proactive actions based on scene ─
// E.g. morning+kitchen → "czy zaparzyć kawę?"
export async function evaluateTriggers(
  familyId: string,
  description: string,
  objects: string[],
  mood: string | undefined,
): Promise<{ triggered: boolean; action?: string; message?: string }> {
  const hour = new Date().getHours();

  // Trigger 1: Morning + kitchen → offer coffee
  if (mood === 'cooking' || (objects.includes('kitchen') && hour >= 6 && hour <= 10)) {
    const message = `Widzę, że jesteś rano w kuchni. Mam zaparzyć kawę albo przypomnieć o śniadaniu?`;
    return {
      triggered: true,
      action: 'proactive: morning_coffee',
      message,
    };
  }

  // Trigger 2: Working late → suggest break
  if (mood === 'working' && (hour >= 22 || hour <= 2)) {
    const message = `Widzę, że pracujesz późno. Może przerwa? Mogę przypomnieć jutro rano o czymś z tego.`;
    return {
      triggered: true,
      action: 'proactive: late_work_break',
      message,
    };
  }

  // Trigger 3: Empty room for a long time → security note
  if (mood === 'empty') {
    // Only trigger if recent motion was detected
    return { triggered: false };
  }

  // Trigger 4: Child detected → safety awareness
  if (objects.includes('child')) {
    return {
      triggered: true,
      action: 'proactive: child_safety',
      message: `Widzę dziecko w kadrze. Mogę włączyć tryb dla dzieci albo przypomnieć o czymś.`,
    };
  }

  return { triggered: false };
}

// ── Cleanup old snapshots ────────────────────
export async function cleanupOldSnapshots(familyId: string, maxAgeHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  const old = await prisma.visionSnapshot.findMany({
    where: { familyId, capturedAt: { lt: cutoff }, retained: true },
    select: { id: true, imagePath: true },
  });

  for (const snap of old) {
    try {
      if (fs.existsSync(snap.imagePath)) fs.unlinkSync(snap.imagePath);
    } catch {}
    await prisma.visionSnapshot.delete({ where: { id: snap.id } });
  }

  return old.length;
}
