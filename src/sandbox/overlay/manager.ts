/**
 * Overlay manager — annotations painted onto the figma canvas.
 *
 * Three visually distinct overlay families, each in its own locked frame:
 *
 *   [a11y-overlay]    Issue dots. Severity-colored circles (pills when the
 *                     number needs the width) at the TOP-RIGHT corner of each
 *                     affected node. Numbering mirrors the UI list order.
 *   [a11y-tab-order]  Tab order. Purple rounded SQUARES at the TOP-LEFT
 *                     corner of each interactive element, numbered by focus
 *                     sequence, plus a dashed purple polyline tracing the
 *                     path 1 → N.
 *   [a11y-alt-text]   Alt text. Green "ALT" chip (or gray "DECO" for
 *                     decorative images) at the bottom-left of the image.
 *
 * Dot name: `dot-<issueId>::<nodeId>` so a click on canvas can resolve
 * back to both ids without a server round-trip.
 */

import type { Severity } from "@shared/types/Issue";
import type { OverlayPaintItem } from "@shared/types/Message";
import {
  ALT_BADGE_HEX,
  ALT_DECO_HEX,
  ALT_OVERLAY_FRAME_NAME,
  HALO_HEX,
  OVERLAY_DOT_PREFIX,
  OVERLAY_DOT_SIZE,
  OVERLAY_FRAME_NAME,
  OVERLAY_HALO_WIDTH,
  SEVERITY_HEX,
  TAB_BADGE_HEX,
  TAB_BADGE_SIZE,
  TAB_OVERLAY_FRAME_NAME,
} from "@shared/constants";
import { hexToRgb } from "@sandbox/detect/primitives/color";

const FONT: FontName = { family: "JetBrains Mono", style: "Bold" };
const FALLBACK_FONT: FontName = { family: "Inter", style: "Bold" };
const NUMBER_INK = { r: 1, g: 1, b: 1 }; // white numerals inside badges

let activeFont: FontName | null = null;
let fontUnavailable = false;

// ---------- issue dots ----------

/** Walk all pages and remove any issue-overlay frames. Safe to call repeatedly. */
export async function clearOverlays(): Promise<void> {
  for (const page of figma.root.children) {
    if (page.type !== "PAGE") continue;
    removeFramesNamed(page, OVERLAY_FRAME_NAME);
  }
}

/**
 * Rebuild the issue overlay on the current page from a sorted/filtered list
 * of (issue, node, severity, index) tuples. Always replaces the previous
 * overlay frame so we never accumulate stale dots.
 */
export async function paintOverlay(items: OverlayPaintItem[]): Promise<void> {
  removeFramesNamed(figma.currentPage, OVERLAY_FRAME_NAME);
  if (items.length === 0) return;

  await ensureFont();
  const overlay = createOverlayFrame(OVERLAY_FRAME_NAME);

  for (const item of items) {
    const bbox = bboxOf(item.nodeId);
    if (!bbox) continue;

    const dot = makeBadge({
      hex: SEVERITY_HEX[item.severity],
      label: String(item.index),
      height: OVERLAY_DOT_SIZE,
      cornerRadius: OVERLAY_DOT_SIZE / 2,
    });
    // Anchor: centered on the node's top-right corner.
    dot.x = bbox.x + bbox.width - dot.width / 2;
    dot.y = bbox.y - dot.height / 2;
    dot.name = `${OVERLAY_DOT_PREFIX}${item.issueId}::${item.nodeId}`;
    overlay.appendChild(dot);
  }
}

// ---------- tab order ----------

/**
 * Paint the tab order annotation: a numbered purple square on each element
 * (top-left corner, mirroring where the eye starts) plus a dashed polyline
 * through the sequence so the navigation path is readable at a glance.
 * Empty items clears the overlay.
 */
export async function paintTabOrderOverlay(
  items: Array<{ nodeId: string; order: number }>,
): Promise<void> {
  removeFramesNamed(figma.currentPage, TAB_OVERLAY_FRAME_NAME);
  if (items.length === 0) return;

  await ensureFont();
  const overlay = createOverlayFrame(TAB_OVERLAY_FRAME_NAME);

  const sorted = [...items].sort((a, b) => a.order - b.order);
  const anchors: Array<{ x: number; y: number }> = [];
  const badges: FrameNode[] = [];

  for (const item of sorted) {
    const bbox = bboxOf(item.nodeId);
    if (!bbox) continue;

    const badge = makeBadge({
      hex: TAB_BADGE_HEX,
      label: String(item.order),
      height: TAB_BADGE_SIZE,
      cornerRadius: 4, // rounded square — distinct from circular issue dots
    });
    badge.x = bbox.x - badge.width / 2;
    badge.y = bbox.y - badge.height / 2;
    badge.name = `tab-${item.order}::${item.nodeId}`;
    badges.push(badge);
    anchors.push({ x: bbox.x, y: bbox.y });
  }

  // Path first so badges render on top of it.
  if (anchors.length > 1) {
    overlay.appendChild(makePathLine(anchors));
  }
  for (const badge of badges) overlay.appendChild(badge);
}

/** Dashed polyline through the badge anchors, in canvas coordinates. */
function makePathLine(points: Array<{ x: number; y: number }>): VectorNode {
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const data = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x - minX} ${p.y - minY}`)
    .join(" ");

  const line = figma.createVector();
  line.vectorPaths = [{ windingRule: "NONE", data }];
  line.strokes = [{ type: "SOLID", color: hexToRgb(TAB_BADGE_HEX) }];
  line.strokeWeight = 1.5;
  line.dashPattern = [5, 5];
  line.fills = [];
  line.x = minX;
  line.y = minY;
  line.locked = true;
  line.name = "tab-path";
  return line;
}

// ---------- alt text ----------

export type AltBadgeKind = "alt" | "decorative" | "none";

/**
 * Mark an image as annotated: green ALT chip for described images, gray DECO
 * for decorative ones, "none" removes the chip (e.g. description cleared).
 * One chip per node, replaced on re-save.
 */
export async function paintAltBadge(
  nodeId: string,
  kind: AltBadgeKind,
): Promise<void> {
  const page = figma.currentPage;
  let overlay = page.children.find(
    (c): c is FrameNode =>
      c.type === "FRAME" && c.name === ALT_OVERLAY_FRAME_NAME,
  );

  // Drop any previous chip for this node.
  const chipName = `alt-${nodeId}`;
  if (overlay) {
    for (const child of [...overlay.children]) {
      if (child.name === chipName) child.remove();
    }
  }
  if (kind === "none") return;

  const bbox = bboxOf(nodeId);
  if (!bbox) return;

  await ensureFont();
  if (!overlay) overlay = createOverlayFrame(ALT_OVERLAY_FRAME_NAME);

  const chip = makeBadge({
    hex: kind === "alt" ? ALT_BADGE_HEX : ALT_DECO_HEX,
    label: kind === "alt" ? "ALT" : "DECO",
    height: 14,
    cornerRadius: 7,
    fontSize: 8,
  });
  chip.x = bbox.x - chip.width / 4;
  chip.y = bbox.y + bbox.height - chip.height / 2;
  chip.name = chipName;
  overlay.appendChild(chip);
}

// ---------- shared helpers ----------

function createOverlayFrame(name: string): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;
  frame.locked = true;
  frame.clipsContent = false;
  frame.fills = [];
  frame.strokes = [];
  frame.x = 0;
  frame.y = 0;
  frame.resize(1, 1);
  figma.currentPage.appendChild(frame);
  return frame;
}

function removeFramesNamed(page: PageNode, name: string): void {
  for (const child of [...page.children]) {
    if (child.type === "FRAME" && child.name === name) child.remove();
  }
}

function bboxOf(nodeId: string): Rect | null {
  const node = figma.getNodeById(nodeId);
  if (!node || node.type === "DOCUMENT" || node.type === "PAGE") return null;
  const sn = node as SceneNode;
  return "absoluteBoundingBox" in sn ? sn.absoluteBoundingBox : null;
}

interface BadgeOptions {
  hex: string;
  label: string;
  height: number;
  cornerRadius: number;
  fontSize?: number;
}

/**
 * Rounded badge with a centered label. Width grows with the label (3-digit
 * issue numbers used to wrap inside the fixed 16px circle and read as two
 * separate numbers), with `height` as the minimum so short labels stay round.
 */
function makeBadge(opts: BadgeOptions): FrameNode {
  const badge = figma.createFrame();
  badge.fills = [{ type: "SOLID", color: hexToRgb(opts.hex) }];
  badge.strokes = [{ type: "SOLID", color: hexToRgb(HALO_HEX) }];
  badge.strokeWeight = OVERLAY_HALO_WIDTH;
  badge.strokeAlign = "OUTSIDE";
  badge.locked = true;
  badge.clipsContent = false;
  badge.cornerRadius = opts.cornerRadius;

  let width = opts.height;
  if (activeFont) {
    const label = figma.createText();
    label.fontName = activeFont;
    label.fontSize = opts.fontSize ?? 9;
    label.characters = opts.label;
    label.fills = [{ type: "SOLID", color: NUMBER_INK }];
    width = Math.max(opts.height, Math.ceil(label.width) + 8);
    badge.resize(width, opts.height);
    badge.appendChild(label);
    label.x = (width - label.width) / 2;
    label.y = (opts.height - label.height) / 2;
  } else {
    badge.resize(width, opts.height);
  }
  return badge;
}

async function ensureFont(): Promise<void> {
  if (activeFont || fontUnavailable) return;
  try {
    await figma.loadFontAsync(FONT);
    activeFont = FONT;
  } catch {
    try {
      await figma.loadFontAsync(FALLBACK_FONT);
      activeFont = FALLBACK_FONT;
    } catch {
      fontUnavailable = true;
      console.warn(
        "[a11y] No badge font available — overlays will be drawn without numbers.",
      );
    }
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
