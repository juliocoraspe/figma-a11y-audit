/**
 * Check 03 — Tap target / Touch target size (WCAG 2.5.8 AA).
 *
 * Pure function. NO figma.* imports. Receives NodeShape, returns Issues.
 *
 * Algorithm:
 *   For every node classified as interactive (see primitives/interactive):
 *     1. Read its absolute bounding box (skip if missing).
 *     2. min = min(width, height)
 *     3. Compute spacing to the nearest *interactive* sibling (axis-aligned
 *        gap, not center-to-center). Decorative siblings don't compete for
 *        the finger, so they don't count (WCAG 2.5.8 talks about adjacent
 *        targets).
 *     4. Severity:
 *          critical  if min < 16
 *          serious   if 16 <= min < 24            (fails AA)
 *          moderate  if min >= 24 but spacing < 24 (crowded targets)
 *          minor     if 24 <= min < 44            (passes AA, AAA advisory)
 *          (>= 44 with adequate spacing: no issue)
 *     5. Skip pure children of interactive ancestors (we don't want both the
 *        button frame and its icon counted as separate small targets).
 */

import type { Issue, Severity } from "@shared/types/Issue";
import type { BoundingBox, NodeShape } from "@shared/types/NodeShape";
import { wcagFor } from "@shared/wcag/criteria";
import type { ScanContext } from "../types/scan-context";
import { isInteractive } from "../primitives/interactive";

const CHECK_ID = "03-tap-target";
const WCAG = wcagFor(CHECK_ID);

const MIN_AA = 24;
const MIN_AAA = 44;
const CRITICAL_BELOW = 16;

export function checkTapTarget(node: NodeShape, ctx: ScanContext): Issue[] {
  if (node.visible === false) return [];
  if (!node.absoluteBoundingBox) return [];

  if (!isInteractive(node, ctx.nodePath)) return [];

  // Skip nodes whose interactive-ness comes solely from an ancestor; the
  // ancestor is the real target. We only audit a node when its *own* name
  // looks interactive, OR it's an interactive component.
  if (!nodeOwnsInteractivity(node)) return [];

  const { width, height } = node.absoluteBoundingBox;
  const min = Math.min(width, height);

  if (min >= MIN_AAA) return []; // perfect, no issue

  const spacing = nearestSiblingSpacing(node, ctx);
  const effectiveMin = spacing == null ? min : Math.min(min, spacing + min);

  const severity = severityFor(min, spacing);
  if (!severity) return [];

  const friendlyName = node.name || "Unnamed element";
  const sizeStr = `${round(width)}×${round(height)}px`;
  const spacingStr = spacing == null ? "no neighbors" : `${round(spacing)}px`;
  const requirement = min < MIN_AA ? `${MIN_AA}px` : `${MIN_AAA}px (AAA)`;

  return [
    {
      id: `${CHECK_ID}::${node.id}`,
      checkId: CHECK_ID,
      severity,
      message: `${quote(friendlyName)} is ${sizeStr}, needs ${requirement} minimum. Spacing to neighbors: ${spacingStr}.`,
      nodeId: node.id,
      nodePath: ctx.nodePath,
      wcagCriterion: WCAG.number,
      wcagLevel: WCAG.level,
      details: {
        width: round(width),
        height: round(height),
        minDimension: round(min),
        effectiveMinDimension: round(effectiveMin),
        spacing: spacing == null ? null : round(spacing),
        thresholdAA: MIN_AA,
        thresholdAAA: MIN_AAA,
      },
      fix: {
        type: "manual",
        suggestion: `Resize ${quote(friendlyName)} to at least ${requirement}, or add padding so the hit area reaches that size.`,
      },
      status: "open",
    },
  ];
}

function severityFor(min: number, spacing: number | null): Severity | null {
  if (min < CRITICAL_BELOW) return "critical";
  if (min < MIN_AA) return "serious";
  // min >= 24: AA passes. Crowding against another target is the real risk;
  // size alone between 24 and 44 is only an AAA advisory.
  if (spacing != null && spacing < MIN_AA) return "moderate";
  if (min < MIN_AAA) return "minor";
  return null;
}

function nodeOwnsInteractivity(node: NodeShape): boolean {
  // The check is defensive: it asks isInteractive without ancestors and sees
  // if the node alone trips a token. We don't import the helper directly to
  // avoid leaking ancestor logic; instead we re-check with an empty path.
  return isInteractive(node, []);
}

function nearestSiblingSpacing(
  node: NodeShape,
  ctx: ScanContext,
): number | null {
  if (!node.absoluteBoundingBox) return null;
  const parent = ctx.lookup.getParent(node);
  if (!parent) return null;

  // Only other *targets* matter for spacing: a decorative divider next to a
  // button doesn't make the button harder to hit.
  const siblings = ctx.lookup
    .getChildren(parent)
    .filter(
      (s) =>
        s.id !== node.id &&
        s.visible !== false &&
        s.absoluteBoundingBox &&
        isInteractive(s, []),
    );

  if (siblings.length === 0) return null;

  let best = Infinity;
  for (const s of siblings) {
    const gap = axisAlignedGap(node.absoluteBoundingBox, s.absoluteBoundingBox!);
    if (gap < best) best = gap;
  }
  return Number.isFinite(best) ? best : null;
}

/**
 * Axis-aligned gap between two boxes. If they overlap on both axes, return 0.
 * If they only overlap on one axis, return the gap on the other. Otherwise
 * return the diagonal-ish minimum: max of the two per-axis gaps (the gap a
 * neighboring finger would need to clear).
 */
function axisAlignedGap(a: BoundingBox, b: BoundingBox): number {
  const dx = horizontalGap(a, b);
  const dy = verticalGap(a, b);
  if (dx <= 0 && dy <= 0) return 0;
  if (dx <= 0) return dy;
  if (dy <= 0) return dx;
  return Math.max(dx, dy);
}

function horizontalGap(a: BoundingBox, b: BoundingBox): number {
  const aRight = a.x + a.width;
  const bRight = b.x + b.width;
  if (aRight <= b.x) return b.x - aRight;
  if (bRight <= a.x) return a.x - bRight;
  return -1; // overlap
}

function verticalGap(a: BoundingBox, b: BoundingBox): number {
  const aBottom = a.y + a.height;
  const bBottom = b.y + b.height;
  if (aBottom <= b.y) return b.y - aBottom;
  if (bBottom <= a.y) return a.y - bBottom;
  return -1;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function quote(s: string): string {
  return `'${s}'`;
}
