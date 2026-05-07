/**
 * Overlay manager — diagnostic dots painted onto figma canvas.
 *
 * One locked frame named [a11y-overlay] per page. Children are circular
 * dots colored by severity, positioned at the top-right corner of each
 * affected node. Cleared and rebuilt on every scan.
 */

import type { Issue, Severity } from "@shared/types/Issue";
import {
  HALO_HEX,
  OVERLAY_DOT_PREFIX,
  OVERLAY_DOT_SIZE,
  OVERLAY_FRAME_NAME,
  OVERLAY_HALO_WIDTH,
  SEVERITY_HEX,
} from "@shared/constants";
import { hexToRgb } from "@sandbox/detect/primitives/color";

const FONT: FontName = { family: "JetBrains Mono", style: "Bold" };

let fontLoaded = false;
let fontUnavailable = false;

/** Walk all pages and remove any overlay frames. Safe to call repeatedly. */
export async function clearOverlays(): Promise<void> {
  for (const page of figma.root.children) {
    if (page.type !== "PAGE") continue;
    for (const child of page.children) {
      if (child.type === "FRAME" && child.name === OVERLAY_FRAME_NAME) {
        child.remove();
      }
    }
  }
}

/** Rebuild the overlay on the current page from the latest issues. */
export async function paintOverlay(issues: Issue[]): Promise<void> {
  if (issues.length === 0) return;

  await ensureFont();

  const page = figma.currentPage;
  const overlay = figma.createFrame();
  overlay.name = OVERLAY_FRAME_NAME;
  overlay.locked = true;
  overlay.clipsContent = false;
  overlay.fills = [];
  overlay.strokes = [];
  overlay.x = 0;
  overlay.y = 0;
  overlay.resize(1, 1); // size doesn't matter, clipsContent=false; children render outside
  page.appendChild(overlay);

  let counter = 0;
  for (const issue of issues) {
    counter++;
    const target = figma.getNodeById(issue.nodeId);
    if (!target || target.type === "DOCUMENT" || target.type === "PAGE") continue;
    const sn = target as SceneNode;
    const bbox = "absoluteBoundingBox" in sn ? sn.absoluteBoundingBox : null;
    if (!bbox) continue;

    const dot = createDot(issue.severity, counter, fontUnavailable ? null : FONT);
    // Top-right corner of the affected node.
    dot.x = bbox.x + bbox.width - OVERLAY_DOT_SIZE / 2;
    dot.y = bbox.y - OVERLAY_DOT_SIZE / 2;
    dot.name = `${OVERLAY_DOT_PREFIX}${counter}::${issue.nodeId}`;
    overlay.appendChild(dot);
  }
}

function createDot(
  severity: Severity,
  index: number,
  font: FontName | null,
): FrameNode {
  const dot = figma.createFrame();
  dot.resize(OVERLAY_DOT_SIZE, OVERLAY_DOT_SIZE);
  dot.cornerRadius = OVERLAY_DOT_SIZE / 2;
  dot.fills = [{ type: "SOLID", color: hexToRgb(SEVERITY_HEX[severity]) }];
  dot.strokes = [{ type: "SOLID", color: hexToRgb(HALO_HEX) }];
  dot.strokeWeight = OVERLAY_HALO_WIDTH;
  dot.strokeAlign = "OUTSIDE";
  dot.locked = true;
  dot.clipsContent = false;

  if (font) {
    const label = figma.createText();
    label.fontName = font;
    label.fontSize = 9;
    label.characters = String(index);
    label.fills = [{ type: "SOLID", color: hexToRgb(HALO_HEX) }];
    label.textAlignHorizontal = "CENTER";
    label.textAlignVertical = "CENTER";
    label.resize(OVERLAY_DOT_SIZE, OVERLAY_DOT_SIZE);
    label.x = 0;
    label.y = 0;
    dot.appendChild(label);
  }

  return dot;
}

async function ensureFont(): Promise<void> {
  if (fontLoaded || fontUnavailable) return;
  try {
    await figma.loadFontAsync(FONT);
    fontLoaded = true;
  } catch {
    fontUnavailable = true;
    console.warn(
      `[a11y] ${FONT.family} ${FONT.style} unavailable — dots will be drawn without numbers.`,
    );
  }
}

/**
 * Given a SceneNode currently selected on canvas, if it's an overlay dot
 * return the underlying issue's nodeId. Otherwise return null.
 */
export function resolveDotSelection(node: SceneNode): string | null {
  if (!node.name.startsWith(OVERLAY_DOT_PREFIX)) return null;
  const parts = node.name.split("::");
  if (parts.length < 2) return null;
  return parts[1] ?? null;
}
