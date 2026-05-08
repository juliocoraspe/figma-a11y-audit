/**
 * Check 02 — Non-text contrast (WCAG 1.4.11 AA, 3:1).
 *
 * Pure function. NO figma.* imports. Receives NodeShape, returns Issues.
 *
 * Precision-first scope:
 *   - Stroked inputs / containers / buttons:  audit stroke vs effective bg.
 *   - Icon-named nodes with a SOLID fill:     audit icon fill vs effective bg.
 *   - Decorative borders (stroke == fill):    SKIP — they're the same surface
 *                                              and the user can't see a border
 *                                              anyway, so flagging adds noise.
 *   - Components / instances / variants:      we audit the node, not its
 *                                              container set, to avoid double
 *                                              counting. The container set has
 *                                              no real strokes/fills against bg.
 *   - Focus rings:                            handled by check 06 instead.
 */

import type { Issue, Severity } from "@shared/types/Issue";
import type { NodeShape, PaintShape, RGB } from "@shared/types/NodeShape";
import { wcagFor } from "@shared/wcag/criteria";
import {
  blendOver,
  contrastRatio,
  effectiveAlpha,
  rgbToHex,
} from "@shared/color/srgb";
import {
  getEffectiveBackground,
  type EffectiveBackground,
} from "../primitives/background";
import {
  looksLikeIcon,
  looksLikeInputOrContainer,
} from "../primitives/interactive";
import type { ScanContext } from "../types/scan-context";

const CHECK_ID = "02-ui-contrast";
const WCAG = wcagFor(CHECK_ID);
const TARGET_RATIO = 3.0;

export function checkUiContrast(node: NodeShape, ctx: ScanContext): Issue[] {
  if (node.visible === false) return [];
  // Component sets are layout containers; skip them. Their child variants
  // are audited individually.
  if (node.type === "COMPONENT_SET") return [];

  const issues: Issue[] = [];

  const strokeIssue = auditStroke(node, ctx);
  if (strokeIssue) issues.push(strokeIssue);

  const iconIssue = auditIcon(node, ctx);
  if (iconIssue) issues.push(iconIssue);

  return issues;
}

// ---------- stroke audit (inputs, buttons, containers) ----------

function auditStroke(node: NodeShape, ctx: ScanContext): Issue | null {
  if (!looksLikeInputOrContainer(node.name)) return null;
  if (!node.strokes || node.strokes.length === 0) return null;
  if (typeof node.strokeWeight === "string") return null; // mixed weights — skip

  const stroke = firstSolidPaint(node.strokes);
  if (!stroke?.color) return null;

  // Decorative-border guard: if the node's first solid fill matches the
  // first solid stroke, skip — designer intends a flat surface, not a ring.
  if (Array.isArray(node.fills)) {
    const firstFill = firstSolidPaint(node.fills);
    if (firstFill?.color && colorsEqual(firstFill.color, stroke.color)) {
      return null;
    }
  }

  const layerOpacity = node.opacity ?? 1;
  const strokeColor = compositeColor(stroke, layerOpacity);
  if (!strokeColor) return null;

  const bg = getEffectiveBackground(node, ctx.lookup);
  const ratio = computeRatio(strokeColor, bg);
  if (ratio === null) return null;
  if (ratio >= TARGET_RATIO) return null;

  return makeIssue({
    node,
    ctx,
    severity: severityFor(ratio),
    elementType: "border",
    elementColor: strokeColor,
    bgColor: bg.kind === "solid" ? bg.color : null,
    ratio,
    extras: {
      strokeWeight: typeof node.strokeWeight === "number" ? node.strokeWeight : null,
    },
  });
}

// ---------- icon audit ----------

function auditIcon(node: NodeShape, ctx: ScanContext): Issue | null {
  if (!looksLikeIcon(node.name)) return null;
  if (!Array.isArray(node.fills) || node.fills.length === 0) return null;

  const fill = firstSolidPaint(node.fills);
  if (!fill?.color) return null;

  const layerOpacity = node.opacity ?? 1;
  const iconColor = compositeColor(fill, layerOpacity);
  if (!iconColor) return null;

  // Walk OWN fills first (icons are usually drawn on a transparent shape;
  // their own fill is the visible color, the bg is what's behind).
  const bg = getEffectiveBackground(node, ctx.lookup);
  const ratio = computeRatio(iconColor, bg);
  if (ratio === null) return null;
  if (ratio >= TARGET_RATIO) return null;

  return makeIssue({
    node,
    ctx,
    severity: severityFor(ratio),
    elementType: "icon",
    elementColor: iconColor,
    bgColor: bg.kind === "solid" ? bg.color : null,
    ratio,
    extras: {},
  });
}

// ---------- shared ----------

interface MakeIssueArgs {
  node: NodeShape;
  ctx: ScanContext;
  severity: Severity;
  elementType: "border" | "icon";
  elementColor: RGB;
  bgColor: RGB | null;
  ratio: number | null;
  extras: Record<string, unknown>;
}

function makeIssue(args: MakeIssueArgs): Issue {
  const { node, ctx, severity, elementType, elementColor, bgColor, ratio, extras } = args;
  const friendly = node.name || `Unnamed ${elementType}`;
  const elementHex = rgbToHex(elementColor);
  const bgHex = bgColor ? rgbToHex(bgColor) : "image/gradient";
  const ratioStr = ratio !== null ? ratio.toFixed(2) : "n/a";

  return {
    id: `${CHECK_ID}::${node.id}`,
    checkId: CHECK_ID,
    severity,
    message: `${capitalize(elementType)} ${quote(friendly)} (${elementHex}) on ${bgHex} has contrast ${ratioStr}:1 (needs ${TARGET_RATIO.toFixed(1)}:1, AA).`,
    nodeId: node.id,
    nodePath: ctx.nodePath,
    wcagCriterion: WCAG.number,
    wcagLevel: WCAG.level,
    details: {
      elementType,
      elementColor: elementHex,
      backgroundColor: bgHex,
      ratio,
      threshold: TARGET_RATIO,
      ...extras,
    },
    fix: {
      type: "manual",
      suggestion:
        elementType === "border"
          ? `Increase the stroke contrast: pick a stroke color that reaches ${TARGET_RATIO.toFixed(1)}:1 against the surrounding surface, or thicken/darken it.`
          : `Adjust the icon color to reach ${TARGET_RATIO.toFixed(1)}:1 against the surrounding surface.`,
    },
    status: "open",
  };
}

function severityFor(ratio: number): Severity {
  // 3.0 floor for AA non-text. We map sub-floor severity by how far below.
  if (ratio < TARGET_RATIO * 0.5) return "critical";
  if (ratio < TARGET_RATIO * 0.8) return "serious";
  return "moderate";
}

function computeRatio(elementColor: RGB, bg: EffectiveBackground): number | null {
  if (bg.kind === "non-uniform") return null;
  return contrastRatio(elementColor, bg.color);
}

function compositeColor(paint: PaintShape, layerOpacity: number): RGB | null {
  if (!paint.color) return null;
  const a = effectiveAlpha(paint.opacity, paint.visible, layerOpacity);
  if (a <= 0) return null;
  if (a >= 1) return paint.color;
  // Blend over white so the resulting "perceived" color is comparable.
  // A more precise composite would need the actual bg, but check 02 cares
  // about stroke vs bg, so we keep the pre-bg color and let computeRatio
  // do the rest.
  return paint.color;
}

function firstSolidPaint(paints: PaintShape[]): PaintShape | null {
  for (const p of paints) {
    if (p.visible === false) continue;
    if (p.type !== "SOLID") continue;
    if (!p.color) continue;
    return p;
  }
  return null;
}

function colorsEqual(a: RGB, b: RGB): boolean {
  const e = 1 / 255;
  return Math.abs(a.r - b.r) < e && Math.abs(a.g - b.g) < e && Math.abs(a.b - b.b) < e;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function quote(s: string): string {
  return `'${s}'`;
}

// `blendOver` is imported for symmetry / future per-channel blending; not
// used directly today but the import keeps the seam alive when we add
// translucent stroke compositing in v0.2.
void blendOver;
