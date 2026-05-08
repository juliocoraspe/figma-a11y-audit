/**
 * Check 04 — Text size minimum (best practice; informs WCAG 1.4.4).
 *
 * Pure function. NO figma.* imports. Receives NodeShape, returns Issues.
 *
 * Rules:
 *   - Default minimum recommendation:        12px
 *   - Hard floor (unreadable on most UIs):   10px
 *   - Exceptions (legal/disclaimer/caption/footnote/label naming):
 *                                            allow down to 10px before warning
 *
 * For TEXT nodes with fills/fontSize MIXED, iterate text segments and emit
 * one issue per failing segment. Bold styling does not lower the threshold
 * here (this is a size check, not a contrast one).
 */

import type { Issue, Severity } from "@shared/types/Issue";
import type { NodeShape, TextSegmentShape } from "@shared/types/NodeShape";
import { wcagFor } from "@shared/wcag/criteria";
import type { ScanContext } from "../types/scan-context";

const CHECK_ID = "04-text-size";
const WCAG = wcagFor(CHECK_ID);

const RECOMMENDED_MIN = 12;
const HARD_FLOOR = 10;
const EXCEPTION_PATTERN = /(legal|disclaimer|caption|footnote|label)/i;

export function checkTextSize(node: NodeShape, ctx: ScanContext): Issue[] {
  if (node.type !== "TEXT") return [];
  if (node.visible === false) return [];

  const exceptionApplies = nameOrPathHasException(node, ctx);

  // Mixed fields: iterate segments
  if (node.fontSize === "MIXED" || node.fills === "MIXED") {
    if (!node.textSegments || node.textSegments.length === 0) return [];
    return node.textSegments.flatMap((seg) =>
      evaluateSize(node, ctx, seg.fontSize, seg, exceptionApplies),
    );
  }

  if (typeof node.fontSize !== "number") return [];
  return evaluateSize(node, ctx, node.fontSize, null, exceptionApplies);
}

function evaluateSize(
  node: NodeShape,
  ctx: ScanContext,
  fontSize: number,
  seg: TextSegmentShape | null,
  exceptionApplies: boolean,
): Issue[] {
  const minAllowed = exceptionApplies ? HARD_FLOOR : RECOMMENDED_MIN;
  if (fontSize >= minAllowed) return [];

  const severity: Severity = fontSize < HARD_FLOOR ? "serious" : "minor";
  const segSuffix = seg ? `::seg-${seg.start}-${seg.end}` : "";
  const sizeLabel = `${fontSize}px`;
  const reasonLabel = exceptionApplies
    ? `below ${HARD_FLOOR}px hard floor`
    : `below ${RECOMMENDED_MIN}px recommended minimum`;

  return [
    {
      id: `${CHECK_ID}::${node.id}${segSuffix}`,
      checkId: CHECK_ID,
      severity,
      message: `Text size ${sizeLabel} is ${reasonLabel}.`,
      nodeId: node.id,
      nodePath: ctx.nodePath,
      wcagCriterion: WCAG.number,
      wcagLevel: WCAG.level,
      details: {
        fontSize,
        recommendedMin: RECOMMENDED_MIN,
        hardFloor: HARD_FLOOR,
        exceptionApplies,
        ...(seg
          ? { segmentStart: seg.start, segmentEnd: seg.end, characters: seg.characters }
          : {}),
      },
      fix: {
        type: "manual",
        suggestion: `Increase the font size to at least ${minAllowed}px (the ${exceptionApplies ? "hard floor" : "recommended minimum"}).`,
      },
      status: "open",
    },
  ];
}

function nameOrPathHasException(node: NodeShape, ctx: ScanContext): boolean {
  if (EXCEPTION_PATTERN.test(node.name)) return true;
  for (const ancestorName of ctx.nodePath) {
    if (EXCEPTION_PATTERN.test(ancestorName)) return true;
  }
  return false;
}
