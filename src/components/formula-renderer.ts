// ═══════════════════════════════════════════════════════════
// BOKA — Formula Renderer (v0.3.19)
// Based on DESIGN≒FORMULA by ASOBOAD (https://amix-design.com/asoboad/tools/d-formula/)
// 8 formula types × 18 color palettes × line/dots × morph animation
// Adapted as BOKA orb visualization — responds to emotion state.
// ═══════════════════════════════════════════════════════════

import type { BokaEmotion } from './boka-face';

// ─── 6 Formula Types ───
export type FormulaType = 'lissajous' | 'rose' | 'spiro' | 'phyllo' | 'harmo' | 'dojon';

export const FORMULA_TYPES: { id: FormulaType; label: string }[] = [
  { id: 'lissajous', label: 'Lissajous' },
  { id: 'rose', label: 'Krzywa róż' },
  { id: 'spiro', label: 'Spirograf' },
  { id: 'phyllo', label: 'Filotaksja' },
  { id: 'harmo', label: 'Harmonograf' },
  { id: 'dojon', label: 'Dojon' },
];

// ─── 18 Color Palettes (from DESIGN≒FORMULA) ───
export const FORMULA_PALETTES: { id: string; label: string; colors: [number, number, number][] }[] = [
  { id: 'sunset', label: 'Sunset', colors: [[43,16,85],[117,151,222],[255,126,95],[254,180,123],[255,233,138]] },
  { id: 'ember', label: 'Ember', colors: [[25,10,5],[122,31,12],[224,71,11],[255,158,44],[255,233,176]] },
  { id: 'ocean', label: 'Ocean', colors: [[2,11,28],[10,61,98],[30,136,168],[95,208,197],[223,252,242]] },
  { id: 'aurora', label: 'Aurora', colors: [[3,0,30],[115,3,192],[236,56,188],[38,208,206],[174,252,255]] },
  { id: 'forest', label: 'Forest', colors: [[11,29,19],[30,86,49],[76,145,65],[164,198,57],[240,245,176]] },
  { id: 'mono', label: 'Mono', colors: [[10,10,10],[58,58,58],[122,122,122],[188,188,188],[245,245,245]] },
  { id: 'pastel', label: 'Pastel', colors: [[255,214,224],[193,240,246],[215,192,247],[198,246,193],[255,243,196]] },
  { id: 'neon', label: 'Neon', colors: [[13,2,33],[255,0,110],[251,86,7],[255,190,11],[58,134,255]] },
  { id: 'sakura', label: 'Sakura', colors: [[58,11,46],[142,45,86],[214,51,108],[247,131,172],[255,227,236]] },
  { id: 'copper', label: 'Copper', colors: [[26,18,11],[94,58,30],[168,96,46],[217,138,79],[243,217,177]] },
  { id: 'ice', label: 'Ice', colors: [[11,16,38],[35,57,93],[64,110,142],[142,168,195],[234,246,255]] },
  { id: 'spectrum', label: 'Spectrum', colors: [[255,0,0],[255,212,0],[33,212,0],[0,179,255],[162,0,255]] },
  { id: 'vapor', label: 'Vapor', colors: [[45,27,78],[93,47,158],[196,78,196],[54,197,216],[174,240,208]] },
  { id: 'citrus', label: 'Citrus', colors: [[20,41,10],[61,107,14],[138,184,0],[212,230,0],[251,255,208]] },
  { id: 'berry', label: 'Berry', colors: [[26,3,22],[94,11,75],[164,3,111],[232,74,138],[255,194,209]] },
  { id: 'royal', label: 'Royal', colors: [[10,10,46],[29,43,138],[108,92,231],[201,162,39],[255,233,168]] },
  { id: 'magma', label: 'Magma', colors: [[5,5,5],[59,10,10],[158,26,10],[240,78,15],[255,209,102]] },
  { id: 'slate', label: 'Slate', colors: [[14,17,22],[43,51,63],[92,107,122],[159,177,193],[232,238,243]] },
];

// ─── Formula settings interface ───
export interface FormulaSettings {
  type: FormulaType;
  palette: string;
  drawMode: 'line' | 'dots';
  lineWidth: number;
  opacity: number;
  density: number;
  scale: number;
  rotation: number;
  blend: boolean;
}

export const DEFAULT_FORMULA_SETTINGS: FormulaSettings = {
  type: 'lissajous',
  palette: 'sunset',
  drawMode: 'line',
  lineWidth: 1.5,
  opacity: 0.6,
  density: 4000,
  scale: 1.0,
  rotation: 0,
  blend: false,
};

// ─── Color interpolation ───
function lerpColor(c1: [number,number,number], c2: [number,number,number], t: number): [number,number,number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

function getPaletteColor(palette: [number,number,number][], t: number): [number,number,number] {
  // t in [0,1], interpolate across palette
  const n = palette.length;
  if (n === 1) return palette[0];
  const idx = t * (n - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  if (i >= n - 1) return palette[n - 1];
  return lerpColor(palette[i], palette[i + 1], f);
}

// ─── Formula generators: return [x, y] in [-1, 1] space ───

function lissajousPoint(t: number, params: { a: number; b: number; delta: number; harm: number }): [number, number] {
  const { a, b, delta, harm } = params;
  const x = Math.sin(a * t + delta) + harm * Math.sin(2 * a * t);
  const y = Math.sin(b * t) + harm * Math.sin(2 * b * t);
  return [x / (1 + harm), y / (1 + harm)];
}

function rosePoint(t: number, params: { k: number; n: number }): [number, number] {
  const { k, n } = params;
  const r = Math.cos(k * t);
  const x = r * Math.cos(n * t);
  const y = r * Math.sin(n * t);
  return [x, y];
}

function spiroPoint(t: number, params: { R: number; r: number; d: number }): [number, number] {
  const { R, r, d } = params;
  const ratio = (R - r) / r;
  const x = (R - r) * Math.cos(t) + d * Math.cos(ratio * t);
  const y = (R - r) * Math.sin(t) - d * Math.sin(ratio * t);
  const scale = 1 / (R + d);
  return [x * scale, y * scale];
}

function phylloPoint(n: number, params: { angle: number; c: number }): [number, number] {
  const { angle, c } = params;
  const r = c * Math.sqrt(n);
  const theta = n * angle;
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

function superFormulaPoint(t: number, params: { m: number; n1: number; n2: number; n3: number; a: number; b: number }): [number, number] {
  const { m, n1, n2, n3, a, b } = params;
  const term1 = Math.pow(Math.abs(Math.cos(m * t / 4) / a), n2);
  const term2 = Math.pow(Math.abs(Math.sin(m * t / 4) / b), n3);
  const r = Math.pow(term1 + term2, -1 / n1);
  return [r * Math.cos(t), r * Math.sin(t)];
}

function harmonographPoint(t: number, params: { f1: number; f2: number; f3: number; f4: number; d1: number; d2: number; p1: number; p2: number; p3: number; p4: number }): [number, number] {
  const { f1, f2, f3, f4, d1, d2, p1, p2, p3, p4 } = params;
  const decay1 = Math.exp(-d1 * t);
  const decay2 = Math.exp(-d2 * t);
  const x = decay1 * (Math.sin(f1 * t + p1) + Math.sin(f2 * t + p2)) / 2;
  const y = decay2 * (Math.sin(f3 * t + p3) + Math.sin(f4 * t + p4)) / 2;
  return [x, y];
}

function cliffordPoint(x: number, y: number, params: { a: number; b: number; c: number; d: number }): [number, number] {
  const { a, b, c, d } = params;
  const nx = Math.sin(a * y) + c * Math.cos(a * x);
  const ny = Math.sin(b * x) + d * Math.cos(b * y);
  return [nx / (1 + Math.abs(c)), ny / (1 + Math.abs(d))];
}

function dojonPoint(t: number, params: { a: number; b: number; mod: number }): [number, number] {
  const { a, b, mod } = params;
  const x = Math.sin(a * t) + mod * Math.sin(b * t * t);
  const y = Math.cos(b * t) + mod * Math.cos(a * t * t);
  return [x / (1 + mod), y / (1 + mod)];
}

// ─── Main renderer ───
export function drawFormulaFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  emotion: BokaEmotion,
  phase: number,
  isActive: boolean,
  isSleeping: boolean,
  settings: FormulaSettings,
  analyserNode?: AnalyserNode | null,
) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.45 * settings.scale;

  // ─── Audio analysis ───
  let audioEnergy = 0;
  if (analyserNode && isActive) {
    const data = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(data);
    audioEnergy = data.reduce((a, b) => a + b, 0) / data.length / 255;
  }

  // ─── Background ───
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, w, h);

  // ─── Get palette ───
  const paletteDef = FORMULA_PALETTES.find(p => p.id === settings.palette) || FORMULA_PALETTES[0];
  const palette = paletteDef.colors;

  // ─── Emotion-driven parameter modulation ───
  const speedMul = isSleeping ? 0.3 : isActive ? 1.5 : 1.0;
  const morphPhase = phase * speedMul;
  const energyBoost = audioEnergy * 0.3;

  // ─── Additive blending ───
  if (settings.blend) {
    ctx.globalCompositeOperation = 'lighter';
  } else {
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((settings.rotation * Math.PI) / 180 + morphPhase * 0.01);

  const N = Math.floor(settings.density);
  const lineWidth = settings.lineWidth * (1 + energyBoost);
  const opacity = settings.opacity * (0.7 + audioEnergy * 0.3);

  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  let prevX = 0, prevY = 0;
  let cliffordX = 0.1, cliffordY = 0.1;

  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2 * 10; // multiple cycles
    const tn = i; // for phyllotaxis

    let px = 0, py = 0;

    switch (settings.type) {
      case 'lissajous':
        [px, py] = lissajousPoint(t + morphPhase * 0.5, {
          a: 3 + Math.floor(morphPhase * 0.1) % 8,
          b: 4 + Math.floor(morphPhase * 0.08) % 8,
          delta: morphPhase * 0.3,
          harm: 0.1 + audioEnergy * 0.3,
        });
        break;
      case 'rose':
        [px, py] = rosePoint(t, {
          k: 5 + Math.sin(morphPhase * 0.2) * 3,
          n: 2 + Math.floor(morphPhase * 0.05) % 4,
        });
        break;
      case 'spiro':
        [px, py] = spiroPoint(t + morphPhase * 0.3, {
          R: 5,
          r: 3 + Math.sin(morphPhase * 0.1) * 0.5,
          d: 2 + Math.cos(morphPhase * 0.15) * 0.5,
        });
        break;
      case 'phyllo':
        [px, py] = phylloPoint(tn, {
          angle: 137.508 * Math.PI / 180,
          c: 0.03 + audioEnergy * 0.01,
        });
        break;
      case 'harmo':
        [px, py] = harmonographPoint(t * 0.5 + morphPhase * 0.1, {
          f1: 2.01 + audioEnergy * 0.1,
          f2: 3,
          f3: 3.01 + audioEnergy * 0.1,
          f4: 2,
          d1: 0.004,
          d2: 0.0065,
          p1: 0,
          p2: Math.PI / 2,
          p3: Math.PI / 3,
          p4: 0,
        });
        break;
      case 'dojon':
        [px, py] = dojonPoint(t + morphPhase * 0.3, {
          a: 3,
          b: 5,
          mod: 0.3 + audioEnergy * 0.4,
        });
        break;
    }

    // Scale to canvas
    const drawX = px * radius;
    const drawY = py * radius;

    // Color based on position in sequence
    const colorT = (i / N + morphPhase * 0.02) % 1;
    const [r, g, b] = getPaletteColor(palette, colorT);

    if (settings.drawMode === 'dots') {
      ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`;
      ctx.beginPath();
      ctx.arc(drawX, drawY, lineWidth * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Line mode
      if (i > 0) {
        ctx.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(drawX, drawY);
        ctx.stroke();
      }
      prevX = drawX;
      prevY = drawY;
    }
  }

  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}
