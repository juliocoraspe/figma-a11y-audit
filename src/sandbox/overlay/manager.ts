/**
 * Overlay manager — diagnostic dots painted onto figma canvas.
 *
 * One locked frame named [a11y-overlay] per page. Children are circular
 * dots colored by severity, positioned at the top-right corner of each
 * affected node. The numbering inside each dot mirrors the order of the
 * list rendered in the UI; the UI is the source of truth and sends the
 * order back via overlay-repaint.
 *
 * Dot name: `dot-<issueId>::<nodeId>` so a click on canvas can resolve
 * back to both ids without a server round-trip.
 */

import type { Severity } from "@shared/types/Issue";
import type { OverlayPaintItem } from "@shared/types/Message";
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
const NUMBER_INK = { r: 1, g: 1, b: 1 }; // white numerals inside the dot

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

/**
 * Rebuild the overlay on the current page from a sorted/filtered list of
 * (issue, node, severity, index) tuples. Always replaces the previous
 * overlay frame so we never accumulate stale dots.
 */
export async function paintOverlay(items: OverlayPaintItem[]): Promise<void> {
  await clearCurrentPageOverlay();
  if (items.length === 0) return;

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
  overlay.resize(1, 1);
  page.appendChild(overlay);

  for (const item of items) {
    const target = figma.getNodeById(item.nodeId);
    if (!target || target.type === "DOCUMENT" || target.type === "PAGE") continue;
    const sn = target as SceneNode;
    const bbox = "absoluteBoundingBox" in sn ? sn.absoluteBoundingBox : null;
    if (!bbox) continue;

    const dot = createDot(item.severity, item.index, fontUnavailable ? null : FONT);
    dot.x = bbox.x + bbox.width - OVERLAY_DOT_SIZE / 2;
    dot.y = bbox.y - OVERLAY_DOT_SIZE / 2;
    dot.name = `${OVERLAY_DOT_PREFIX}${item.issueId}::${item.nodeId}`;
    overlay.appendChild(dot);
  }
}

async function clearCurrentPageOverlay(): Promise<void> {
  const page = figma.currentPage;
  for (const child of [...page.children]) {
    if (child.type === "FRAME" && child.name === OVERLAY_FRAME_NAME) {
      child.remove();
    }
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
    label.fills = [{ type: "SOLID", color: NUMBER_INK }];
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
 * Given a SceneNode currently selected on canvas, parse the dot name
 * `dot-<issueId>::<nodeId>` and return the underlying ids. Returns null
 * if `node` isn't an overlay dot.
 */
export function resolveDotSelection(
  node: SceneNode,
): { issueId: string; nodeId: string } | null {
  if (!node.name.startsWith(OVERLAY_DOT_PREFIX)) return null;
  const stripped = node.name.slice(OVERLAY_DOT_PREFIX.length);
  const sep = stripped.indexOf("::");
  if (sep < 0) return null;
  const issueId = stripped.slice(0, sep);
  const nodeId = stripped.slice(sep + 2);
  if (!issueId || !nodeId) return null;
  return { issueId, nodeId };
}
