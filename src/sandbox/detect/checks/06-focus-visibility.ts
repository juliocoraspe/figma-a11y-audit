/**
 * Check 06 — Focus indicator visibility (WCAG 2.4.11 / 2.4.13).
 *
 * Pure function. NO figma.* imports. Receives NodeShape, returns Issues.
 *
 * Runs only when check 05 already passed (focus variant exists). Validates
 * the focus indicator is actually perceivable:
 *
 *   - Indicator thickness >= 2px (the focus stroke or shadow spread)
 *   - Indicator contrast  >= 3:1 against the surrounding background
 *
 * Precision-first: we only emit when we can compare a Default-like variant
 * against a Focus variant and both expose solid colors. Ambiguous cases
 * (gradient strokes, image fills, mixed strokes) are skipped.
 */

import type { Issue, Severity } from "@shared/types/Issue";
import type {
  EffectShape,
  NodeShape,
  PaintShape,
  RGB,
  VariantInfo,
} from "@shared/types/NodeShape";
import { wcagFor } from "@shared/wcag/criteria";
import { contrastRatio, rgbToHex } from "@shared/color/srgb";
import {
  getEffectiveBackground,
  type EffectiveBackground,
} from "../primitives/background";
import { looksInteractive } from "../primitives/interactive";
import type { ScanContext } from "../types/scan-context";

const CHECK_ID = "06-focus-visibility";
const WCAG = wcagFor(CHECK_ID);
const FOCUS_PATTERN = /focus(?:ed|-visible)?/i;
const DEFAULT_PATTERN = /default|rest|enabled|normal/i;
const MIN_THICKNESS = 2;
const MIN_RATIO = 3.0;

export function checkFocusVisibility(
  node: NodeShape,
  ctx: ScanContext,
): Issue[] {
  if (node.visible === false) return [];
  if (node.type !== "COMPONENT_SET") return [];
  if (!looksInteractive(node.name)) return [];

  const variants = node.variants ?? [];
  if (variants.length === 0) return [];

  const focusVariant = pickVariant(variants, FOCUS_PATTERN);
  if (!focusVariant) return []; // check 05 already covers "missing focus"

  const baselineVariant =
    pickVariant(variants, DEFAULT_PATTERN) ??
    variants.find((v) => v.id !== focusVariant.id) ??
    null;

  const focusNode = ctx.lookup.getById(focusVariant.id);
  if (!focusNode) return [];
  const baselineNode: NodeShape | null = baselineVariant
    ? ctx.lookup.getById(baselineVariant.id) ?? null
    : null;

  const bg = getEffectiveBackground(node, ctx.lookup);

  const indicator = computeIndicator(focusNode, baselineNode, bg);
  if (indicator.kind === "ambiguous") return []; // precision-first: skip

  if (indicator.kind === "ok") return [];

  // Build a single issue covering whichever signal failed (or both).
  const friendly = node.name || "Component set";
  const failures = indicator.failures;
  const message = `${quote(friendly)} focus variant is present but ${failures.join(" and ")}.`;

  return [
    {
      id: `${CHECK_ID}::${node.id}`,
      checkId: CHECK_ID,
      severity: indicator.severity,
      message,
      nodeId: node.id,
      nodePath: ctx.nodePath,
      wcagCriterion: WCAG.number,
      wcagLevel: WCAG.level,
      details: {
        focusVariant: focusVariant.rawName,
        baselineVariant: baselineVariant?.rawName ?? null,
        thickness: indicator.thickness,
        thicknessThreshold: MIN_THICKNESS,
        indicatorColor: indicator.colorHex,
        indicatorContrast: indicator.contrast,
        contrastThreshold: MIN_RATIO,
        backgroundColor: indicator.bgHex,
      },
      fix: {
        type: "manual",
        suggestion: `Make the focus indicator at least ${MIN_THICKNESS}px thick with ${MIN_RATIO.toFixed(1)}:1 contrast against the surrounding surface.`,
      },
      status: "open",
    },
  ];
}

// ---------- indicator computation ----------

type IndicatorResult =
  | { kind: "ok" }
  | { kind: "ambiguous" }
  | {
      kind: "failed";
      severity: Severity;
      failures: string[];
      thickness: number | null;
      colorHex: string | null;
      contrast: number | null;
      bgHex: string | null;
    };

function computeIndicator(
  focus: NodeShape,
  baseline: NodeShape | null,
  bg: EffectiveBackground,
): IndicatorResult {
  // Signal 1: stroke change between baseline and focus
  const strokeSignal = strokeIndicator(focus, baseline);
  // Signal 2: drop-shadow / outer glow appearing only in focus
  const shadowSignal = shadowIndicator(focus, baseline);

  const signals = [strokeSignal, shadowSignal].filter(
    (s): s is IndicatorSignal => s !== null,
  );

  if (signals.length === 0) {
    // No detectable indicator at all — but we don't double-flag (check 05
    // would have already fired if focus variant was missing). Treat the
    // "exists but invisible" case here.
    return {
      kind: "failed",
      severity: "serious",
      failures: ["no visible difference vs default variant"],
      thickness: null,
      colorHex: null,
      contrast: null,
      bgHex: bg.kind === "solid" ? rgbToHex(bg.color) : null,
    };
  }

  // Pick the strongest signal (thickest first) to evaluate.
  signals.sort((a, b) => b.thickness - a.thickness);
  const primary = signals[0]!;

  if (bg.kind === "non-uniform") {
    // We can't deterministically score contrast against media; bail.
    return { kind: "ambiguous" };
  }

  const ratio = contrastRatio(primary.color, bg.color);
  const failures: string[] = [];

  if (primary.thickness < MIN_THICKNESS) {
    failures.push(
      `indicator is ${primary.thickness}px thick (needs ${MIN_THICKNESS}px)`,
    );
  }
  if (ratio < MIN_RATIO) {
    failures.push(
      `indicator contrast is ${ratio.toFixed(2)}:1 (needs ${MIN_RATIO.toFixed(1)}:1)`,
    );
  }

  if (failures.length === 0) return { kind: "ok" };

  // Severity: both fails -> serious; one fails -> moderate.
  const severity: Severity = failures.length >= 2 ? "serious" : "moderate";

  return {
    kind: "failed",
    severity,
    failures,
    thickness: primary.thickness,
    colorHex: rgbToHex(primary.color),
    contrast: ratio,
    bgHex: rgbToHex(bg.color),
  };
}

interface IndicatorSignal {
  source: "stroke" | "shadow";
  color: RGB;
  thickness: number;
}

function strokeIndicator(
  focus: NodeShape,
  baseline: NodeShape | null,
): IndicatorSignal | null {
  const focusStroke = firstSolid(focus.strokes);
  if (!focusStroke?.color) return null;
  const focusWeight = numericWeight(focus.strokeWeight);
  if (focusWeight === null) return null;

  // If baseline already has the same stroke, the focus stroke is not the
  // indicator (some other signal is). Skip.
  if (baseline) {
    const baseStroke = firstSolid(baseline.strokes);
    const baseWeight = numericWeight(baseline.strokeWeight) ?? 0;
    if (
      baseStroke?.color &&
      colorsEqual(baseStroke.color, focusStroke.color) &&
      Math.abs(baseWeight - focusWeight) < 0.5
    ) {
      return null;
    }
  }

  return {
    source: "stroke",
    color: focusStroke.color,
    thickness: focusWeight,
  };
}

function shadowIndicator(
  focus: NodeShape,
  baseline: NodeShape | null,
): IndicatorSignal | null {
  const focusShadow = firstShadow(focus.effects);
  if (!focusShadow || !focusShadow.color) return null;

  if (baseline) {
    const baseShadow = firstShadow(baseline.effects);
    if (
      baseShadow &&
      baseShadow.color &&
      Math.abs((baseShadow.spread ?? 0) - (focusShadow.spread ?? 0)) < 0.5
    ) {
      return null;
    }
  }

  const spread = focusShadow.spread ?? 0;
  if (spread <= 0) return null;
  return {
    source: "shadow",
    color: { r: focusShadow.color.r, g: focusShadow.color.g, b: focusShadow.color.b },
    thickness: spread,
  };
}

// ---------- variant + paint helpers ----------

function pickVariant(
  variants: VariantInfo[],
  pattern: RegExp,
): VariantInfo | null {
  for (const v of variants) {
    if (pattern.test(v.rawName)) return v;
    for (const value of Object.values(v.properties)) {
      if (pattern.test(value)) return v;
    }
  }
  return null;
}

function firstSolid(paints: PaintShape[] | "MIXED" | undefined): PaintShape | null {
  if (!paints || paints === "MIXED") return null;
  for (const p of paints) {
    if (p.visible === false) continue;
    if (p.type !== "SOLID") continue;
    if (!p.color) continue;
    return p;
  }
  return null;
}

function firstShadow(effects: EffectShape[] | undefined): EffectShape | null {
  if (!effects) return null;
  for (const e of effects) {
    if (e.visible === false) continue;
    if (e.type !== "DROP_SHADOW" && e.type !== "INNER_SHADOW") continue;
    return e;
  }
  return null;
}

function numericWeight(weight: number | "MIXED" | undefined): number | null {
  if (weight === "MIXED" || weight === undefined) return null;
  return weight;
}

function colorsEqual(a: RGB, b: RGB): boolean {
  const e = 1 / 255;
  return Math.abs(a.r - b.r) < e && Math.abs(a.g - b.g) < e && Math.abs(a.b - b.b) < e;
}

function quote(s: string): string {
  return `'${s}'`;
}
