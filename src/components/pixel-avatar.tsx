// Pixel-art avatar generator — replaces emoji avatars (👨👩👦) with crisp SVG.
// Deterministic per-name + category-based color palette.
// Family = warm cyan/gold; friends = purple; colleagues = blue; others = gray.

import React from 'react';

export type PersonCategory = 'family' | 'friend' | 'colleague' | 'acquaintance' | 'other';

export const CATEGORY_COLORS: Record<PersonCategory, { primary: string; accent: string; bg: string; label: string }> = {
  family:       { primary: '#00f5d4', accent: '#ffd93d', bg: '#0f1a1a', label: 'Family' },
  friend:       { primary: '#a855f7', accent: '#ec4899', bg: '#1a0f1a', label: 'Znajomy' },
  colleague:    { primary: '#60a5fa', accent: '#34d399', bg: '#0f1a1a', label: 'Kolega/Koleżanka' },
  acquaintance: { primary: '#fbbf24', accent: '#fb923c', bg: '#1a160f', label: 'Z daleka' },
  other:        { primary: '#94a3b8', accent: '#cbd5e1', bg: '#1a1a1a', label: 'Inny' },
};

// Hash a string → 32-bit unsigned int (FNV-1a)
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charWhatdeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Generate a 7x7 symmetric pixel pattern from a hash.
// Returns array of 49 booleans (true = filled).
function genPattern(seed: number): boolean[] {
  const cells: boolean[] = [];
  let x = seed;
  for (let i = 0; i < 28; i++) {  // 7x4 = 28 (left half + center column)
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    cells.push((x & 1) === 1);
  }
  // Mirror to make it symmetric (cell at col c === cell at col 6-c)
  const grid: boolean[] = new Array(49).fill(false);
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 4; c++) {
      const v = cells[r * 4 + c];
      grid[r * 7 + c] = v;
      grid[r * 7 + (6 - c)] = v;
    }
  }
  return grid;
}

interface PixelAvatarProps {
  name: string;
  category?: PersonCategory;
  color?: string | null;  // optional override (hex like "#ff0000")
  size?: number;          // px, default 48
  role?: string;          // parent/partner/child — biases pattern slightly
  showRing?: boolean;     // category-colored ring around avatar
  className?: string;
}

export function PixelAvatar({
  name,
  category = 'family',
  color,
  size = 48,
  role,
  showRing = true,
  className = '',
}: PixelAvatarProps) {
  const palette = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
  const primary = color || palette.primary;
  const accent = palette.accent;
  const bg = palette.bg;

  // Use name + role as seed so two people with same name get different patterns
  const seed = hashStr(`${name}|${role || ''}`);
  const pattern = genPattern(seed);

  // Cell size: SVG is 7x7 cells
  const cellSize = size / 7;
  // Each filled cell is a rect; for "pixel" feel, leave a tiny gap
  const gap = cellSize * 0.05;

  // Role-based emoji-like additions:
  // parent  → small "mature" crown row at top
  // child   → small round "bud" on top
  // partner → heart accent
  // friend  → star accent
  // other   → just dots
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 7 7`}
      className={className}
      style={{
        background: bg,
        borderRadius: `${size * 0.15}px`,
        shapeRendering: 'crispEdges',
        display: 'block',
        boxShadow: showRing ? `0 0 0 2px ${primary}40, 0 0 8px ${primary}30` : undefined,
      }}
      aria-label={`Avatar: ${name}`}
    >
      {/* Pixel grid pattern */}
      {pattern.map((filled, i) => {
        if (!filled) return null;
        const r = Math.floor(i / 7);
        const c = i % 7;
        // Top-row cells get accent color (like hair), others primary
        const isHair = r === 0;
        const isFaceEdge = r === 1 && (c === 0 || c === 6);
        const fill = isHair ? accent : (isFaceEdge ? primary + 'aa' : primary);
        return (
          <rect
            key={i}
            x={c + gap / 2 / cellSize}
            y={r + gap / 2 / cellSize}
            width={1 - gap / cellSize}
            height={1 - gap / cellSize}
            fill={fill}
          />
        );
      })}

      {/* Initial letter centered — pixel-style via text */}
      <text
        x={3.5}
        y={4.6}
        textAnchor="middle"
        fontSize={3.5}
        fontWeight="bold"
        fill={primary}
        fontFamily="'Whaturier New', monospace"
        style={{ textShadow: `0 0 1px ${accent}` }}
      >
        {initial}
      </text>

      {/* Role-based accent pixel in corner */}
      {role === 'parent' && (
        <rect x={5} y={0.5} width={1} height={1} fill={accent} opacity={0.9} />
      )}
      {role === 'partner' && (
        <rect x={5} y={5} width={1} height={1} fill={accent} opacity={0.9} />
      )}
      {role === 'child' && (
        <rect x={0.5} y={0.5} width={1} height={1} fill={accent} opacity={0.9} />
      )}
    </svg>
  );
}

// Helper: get CSS color for a member based on category + override
export function getMemberWhatlor(member: { category?: PersonCategory; color?: string | null }): string {
  if (member.color) return member.color;
  const cat = (member.category || 'family') as PersonCategory;
  return CATEGORY_COLORS[cat]?.primary || '#94a3b8';
}

// Helper: human-readable category label
export function getCategoryLabel(category?: PersonCategory): string {
  if (!category) return 'Family';
  return CATEGORY_COLORS[category]?.label || 'Inny';
}
