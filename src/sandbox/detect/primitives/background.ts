/**
 * Effective-background resolution — pure function, NO figma.* imports.
 *
 * Walks the parent chain bottom-to-top, accumulating solid fills via alpha
 * compositing. If any ancestor has an image or gradient fill we cannot
 * statically reason about, returns "non-uniform".
 */

import type { NodeShape, PaintShape, RGB } from "@shared/types/NodeShape";
import { blendOver, effectiveAlpha, hexToRgb } from "./color";

/** Default page background (Figma's canvas is white). */
export const PAGE_BG_DEFAULT: RGB = hexToRgb("#FFFFFF");

export type EffectiveBackground =
  | { kind: "solid"; color: RGB }
  | { kind: "non-uniform"; reason: "image" | "gradient" | "mixed" };

export interface BackgroundLookup {
  /** Resolve a node's parent NodeShape, or undefined if root. */
  getParent: (node: NodeShape) => NodeShape | undefined;
}

/**
 * Compute the effective background underneath `node` by walking ancestors.
 *
 * Algorithm:
 *   - Start with PAGE_BG_DEFAULT (white).
 *   - Walk ancestors top-down (root first), so we composite each ancestor's
 *     fill stack OVER the running result.
 *   - For each ancestor, iterate its fills front-to-back (Figma's array order
 *     is bottom-to-top in the layer panel; iterating reverse paints lower
 *     fills first onto the running color, mimicking what the user sees).
 *   - SOLID -> alpha-blend over running.
 *   - IMAGE / GRADIENT_*: bail with "non-uniform".
 */
export function getEffectiveBackground(
  node: NodeShape,
  lookup: BackgroundLookup,
): EffectiveBackground {
  const ancestors: NodeShape[] = [];
  let cursor = lookup.getParent(node);
  while (cursor) {
    ancestors.push(cursor);
    cursor = lookup.getParent(cursor);
  }
  ancestors.reverse(); // root-first

  let running: RGB = PAGE_BG_DEFAULT;

  for (const a of ancestors) {
    if (a.visible === false) continue;
    if (a.fills === "MIXED" || a.fills === undefined) continue;

    const layerOpacity = a.opacity ?? 1;

    // Figma stores fills bottom-to-top; paint each lower fill before upper.
    for (const paint of a.fills) {
      if (paint.visible === false) continue;

      switch (paint.type) {
        case "IMAGE":
          return { kind: "non-uniform", reason: "image" };
        case "GRADIENT_LINEAR":
        case "GRADIENT_RADIAL":
          return { kind: "non-uniform", reason: "gradient" };
        case "SOLID":
          running = blendSolid(paint, layerOpacity, running);
          break;
      }
    }
  }

  return { kind: "solid", color: running };
}

function blendSolid(
  paint: PaintShape,
  layerOpacity: number,
  running: RGB,
): RGB {
  if (!paint.color) return running;
  const a = effectiveAlpha(paint.opacity, paint.visible, layerOpacity);
  if (a <= 0) return running;
  if (a >= 1) return paint.color;
  return blendOver({ ...paint.color, a }, running);
}
