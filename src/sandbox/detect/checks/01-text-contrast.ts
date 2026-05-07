/**
 * Check 01 — Text Contrast (WCAG 1.4.3 AA).
 *
 * Pure function. NO figma.* imports. Receives NodeShape, returns Issues.
 * The runner is responsible for feeding text segments via NodeShape.textSegments
 * when the underlying node has fills === "MIXED".
 */

import type {
  FontNameShape,
  NodeShape,
  PaintShape,
  RGB,
  TextSegmentShape,
} from "@shared/types/NodeShape";
import type { Issue, Severity } from "@shared/types/Issue";
import {
  BOLD_STYLE_TOKENS,
  CONTRAST_THRESHOLD_LARGE,
  CONTRAST_THRESHOLD_NORMAL,
  LARGE_TEXT_BOLD_PX,
  LARGE_TEXT_PX,
} from "@shared/constants";
import { wcagFor } from "@shared/wcag/criteria";
import {
  blendOver,
  contrastRatio,
  effectiveAlpha,
  rgbToHex,
} from "../primitives/color";
import {
  getEffectiveBackground,
  type BackgroundLookup,
  type EffectiveBackground,
} from "../primitives/background";

export interface ScanContext {
  /** Stable lookup so checks can reach parents without holding figma.* refs. */
  lookup: BackgroundLookup;
  /** Path of human-readable names from page root to the current node. */
  nodePath: string[];
}

const CHECK_ID = "01-text-contrast";
const WCAG = wcagFor(CHECK_ID);

export function checkTextContrast(
  node: NodeShape,
  ctx: ScanContext,
): Issue[] {
  if (node.type !== "TEXT") return [];
  if (node.visible === false) return [];

  const bg = getEffectiveBackground(node, ctx.lookup);

  // Mixed-fill text: iterate per-segment.
  if (node.fills === "MIXED") {
    if (!node.textSegments || node.textSegments.length === 0) return [];
    return node.textSegments.flatMap((seg) =>
      evaluateSegment(node, ctx, bg, seg),
    );
  }

  // Uniform fill: build a synthetic single-segment from node-level props.
  const fontSize = typeof node.fontSize === "number" ? node.fontSize : NaN;
  const fontName =
    node.fontName && node.fontName !== "MIXED" ? node.fontName : null;
  if (!fontName || !Number.isFinite(fontSize)) return [];
  if (!node.fills || node.fills.length === 0) return [];

  return evaluateSegment(node, ctx, bg, {
    start: 0,
    end: (node.characters ?? "").length,
    characters: node.characters ?? "",
    fills: node.fills,
    fontSize,
    fontName,
  });
}

function evaluateSegment(
  node: NodeShape,
  ctx: ScanContext,
  bg: EffectiveBackground,
  seg: TextSegmentShape,
): Issue[] {
  const fg = resolveTextColor(seg.fills, node.opacity ?? 1, bg);
  if (!fg) return [];

  // Non-uniform background: surface as a moderate warning. We can't compute
  // a deterministic ratio against an image/gradient.
  if (bg.kind === "non-uniform") {
    return [
      makeIssue({
        node,
        ctx,
        seg,
        severity: "moderate",
        ratio: null,
        threshold: thresholdFor(seg),
        fg,
        bg: null,
        bgReason: bg.reason,
        message: `Text over ${bg.reason} — verify contrast manually`,
      }),
    ];
  }

  const threshold = thresholdFor(seg);
  const ratio = contrastRatio(fg, bg.color);
  if (ratio >= threshold) return [];

  const severity: Severity = ratio < threshold * 0.7 ? "critical" : "serious";
  const ratioStr = ratio.toFixed(2);
  const thresholdStr = threshold.toFixed(1);

  return [
    makeIssue({
      node,
      ctx,
      seg,
      severity,
      ratio,
      threshold,
      fg,
      bg: bg.color,
      bgReason: null,
      message: `Contrast ${ratioStr}:1 below ${thresholdStr}:1 minimum`,
    }),
  ];
}

interface MakeIssueArgs {
  node: NodeShape;
  ctx: ScanContext;
  seg: TextSegmentShape;
  severity: Severity;
  ratio: number | null;
  threshold: number;
  fg: RGB;
  bg: RGB | null;
  bgReason: "image" | "gradient" | "mixed" | null;
  message: string;
}

function makeIssue(args: MakeIssueArgs): Issue {
  const { node, ctx, seg, severity, ratio, threshold, fg, bg, bgReason, message } = args;
  const segSuffix = node.fills === "MIXED" ? `::seg-${seg.start}-${seg.end}` : "";
  return {
    id: `${CHECK_ID}::${node.id}${segSuffix}`,
    checkId: CHECK_ID,
    severity,
    message,
    nodeId: node.id,
    nodePath: ctx.nodePath,
    wcagCriterion: WCAG.number,
    wcagLevel: WCAG.level,
    details: {
      ratio,
      threshold,
      isLarge: threshold === CONTRAST_THRESHOLD_LARGE,
      textColor: rgbToHex(fg),
      backgroundColor: bg ? rgbToHex(bg) : null,
      backgroundKind: bg ? "solid" : (bgReason ?? "non-uniform"),
      fontSize: seg.fontSize,
      fontStyle: seg.fontName.style,
      ...(node.fills === "MIXED"
        ? { segmentStart: seg.start, segmentEnd: seg.end, characters: seg.characters }
        : {}),
    },
    fix: {
      type: "manual",
      suggestion:
        bg === null
          ? "Place a solid backing behind the text or pick a color that contrasts with the underlying media."
          : `Darken or lighten the text until the ratio reaches ${threshold.toFixed(1)}:1.`,
    },
    status: "open",
  };
}

/** Phase-1 simplification: we use the first SOLID fill as the text color. */
function resolveTextColor(
  fills: PaintShape[],
  layerOpacity: number,
  bg: EffectiveBackground,
): RGB | null {
  for (const paint of fills) {
    if (paint.visible === false) continue;
    if (paint.type !== "SOLID" || !paint.color) continue;
    const a = effectiveAlpha(paint.opacity, paint.visible, layerOpacity);
    if (a <= 0) return null;
    if (a >= 1) return paint.color;
    if (bg.kind === "solid") return blendOver({ ...paint.color, a }, bg.color);
    return paint.color;
  }
  return null;
}

function thresholdFor(seg: TextSegmentShape): number {
  return isLargeText(seg.fontSize, seg.fontName)
    ? CONTRAST_THRESHOLD_LARGE
    : CONTRAST_THRESHOLD_NORMAL;
}

function isLargeText(fontSize: number, fontName: FontNameShape): boolean {
  const bold = isBoldStyle(fontName.style);
  if (bold && fontSize >= LARGE_TEXT_BOLD_PX) return true;
  if (!bold && fontSize >= LARGE_TEXT_PX) return true;
  return false;
}

function isBoldStyle(style: string): boolean {
  return BOLD_STYLE_TOKENS.some((tok) =>
    style.toLowerCase().includes(tok.toLowerCase()),
  );
}
