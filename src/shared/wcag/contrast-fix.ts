/**
 * Contrast-fix solver — pure, no figma.*, importable by UI and CLI.
 *
 * Given a foreground hex, a background hex, and a target ratio, finds the
 * nearest hex (along the lightness axis in HSL) that meets the target.
 * Preserves hue and saturation so the brand color stays recognisable.
 *
 * Returns null if no solution exists in [0, 1] lightness (e.g. target
 * background is mid-gray and target ratio is impossible against it).
 */

import type { RGB } from "../types/NodeShape";
import { contrastRatio, hexToRgb, rgbToHex } from "../color/srgb";

export interface ContrastFixResult {
  hex: string;
  ratio: number;
  /** Lightness delta vs the original (in HSL units, 0..1). */
  lightnessDelta: number;
}

export function suggestContrastFix(
  fgHex: string,
  bgHex: string,
  targetRatio: number,
): ContrastFixResult | null {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  const hsl = rgbToHsl(fg);

  // Try both directions: darker first (most common ask), then lighter.
  // Pick whichever direction yields a valid solution closer to the original.
  const darker = solveDirection(hsl, bg, targetRatio, "darker");
  const lighter = solveDirection(hsl, bg, targetRatio, "lighter");

  const candidates = [darker, lighter].filter(
    (c): c is ContrastFixResult => c !== null,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.lightnessDelta - b.lightnessDelta);
  return candidates[0]!;
}

function solveDirection(
  start: HSL,
  bg: RGB,
  targetRatio: number,
  direction: "darker" | "lighter",
): ContrastFixResult | null {
  // Binary search the lightness axis.
  let lo: number;
  let hi: number;
  if (direction === "darker") {
    lo = 0;
    hi = start.l;
  } else {
    lo = start.l;
    hi = 1;
  }

  // Sanity check: does the extreme end of the search satisfy?
  const extreme = direction === "darker" ? lo : hi;
  if (contrastRatio(hslToRgb({ ...start, l: extreme }), bg) < targetRatio) {
    return null;
  }

  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const ratio = contrastRatio(hslToRgb({ ...start, l: mid }), bg);
    if (ratio >= targetRatio) {
      // Move toward the original lightness (away from the extreme).
      if (direction === "darker") lo = mid;
      else hi = mid;
    } else {
      if (direction === "darker") hi = mid;
      else lo = mid;
    }
  }

  // Use the side that's guaranteed to satisfy the ratio.
  const answerL = direction === "darker" ? lo : hi;
  const rgb = hslToRgb({ ...start, l: answerL });
  const ratio = contrastRatio(rgb, bg);
  if (ratio < targetRatio) return null;
  return {
    hex: rgbToHex(rgb),
    ratio,
    lightnessDelta: Math.abs(answerL - start.l),
  };
}

// ---------- HSL helpers (channel range 0..1) ----------

interface HSL {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToChan(p, q, h + 1 / 3),
    g: hueToChan(p, q, h),
    b: hueToChan(p, q, h - 1 / 3),
  };
}

function hueToChan(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}
