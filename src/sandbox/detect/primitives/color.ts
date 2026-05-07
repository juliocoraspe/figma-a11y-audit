/**
 * Color primitives — pure functions, NO figma.* imports.
 * Channels are linear-srgb 0..1 unless noted.
 */

import type { RGB, RGBA } from "@shared/types/NodeShape";

/** WCAG 2.1 relative luminance for an sRGB triplet in 0..1. */
export function relativeLuminance({ r, g, b }: RGB): number {
  const linear = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.1 contrast ratio between two sRGB colors (always >= 1). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Composite a translucent foreground over an opaque background using
 * "source-over" alpha blending in straight-alpha (non-premultiplied) sRGB.
 * Returns an opaque RGB.
 */
export function blendOver(fg: RGBA, bg: RGB): RGB {
  const a = clamp01(fg.a);
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

/**
 * Resolve the effective alpha of a paint stack honoring:
 *   - paint.opacity      (per-paint)
 *   - layerOpacity       (the node's own opacity, if any)
 *   - paint.visible      (treated as alpha=0 if false)
 */
export function effectiveAlpha(
  paintOpacity: number | undefined,
  paintVisible: boolean | undefined,
  layerOpacity: number,
): number {
  if (paintVisible === false) return 0;
  const po = paintOpacity ?? 1;
  return clamp01(po * layerOpacity);
}

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Convert {r,g,b} 0..1 to "#RRGGBB" uppercase. */
export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (c: number): string => {
    const v = Math.round(clamp01(c) * 255);
    return v.toString(16).padStart(2, "0").toUpperCase();
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Convert "#RRGGBB" or "#RGB" to {r,g,b} 0..1. Throws on invalid input. */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}
