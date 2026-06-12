/**
 * Sandbox-side message router.
 *
 * Owns the lifecycle of a scan and side-effects on figma.* (selection,
 * viewport, overlay paint, fix application). Pure logic lives in detect/
 * and overlay/. Numbering of the overlay is owned by the UI: the sandbox
 * waits for an overlay-repaint message after the UI has sorted the issues.
 */

import type { Issue } from "@shared/types/Issue";
import type { SandboxToUI, UIToSandbox } from "@shared/types/Message";
import { assertNever } from "@shared/types/Message";
import { A11Y_FRAME_PREFIX } from "@shared/constants";
import { runScan } from "@sandbox/detect/runner";
import {
  clearOverlays,
  paintAltBadge,
  paintOverlay,
  paintTabOrderOverlay,
} from "@sandbox/overlay/manager";

export interface SandboxState {
  lastIssues: Issue[];
  scanInFlight: boolean;
}

export function createState(): SandboxState {
  return { lastIssues: [], scanInFlight: false };
}

function postUI(msg: SandboxToUI): void {
  figma.ui.postMessage(msg);
}

export async function handleUIMessage(
  msg: UIToSandbox,
  state: SandboxState,
): Promise<void> {
  switch (msg.type) {
    case "scan-request":
      await handleScanRequest(msg.scope, state);
      return;
    case "scan-cancel":
      postUI({ type: "scan-cancelled" });
      return;
    case "jump-to-node":
      handleJumpToNode(msg.nodeId);
      return;
    case "highlight-node":
      // Reserved for v0.2 bidirectional hover; UI side already does its
      // own visual highlight. Sandbox-side glow comes later.
      return;
    case "overlay-repaint":
      await paintOverlay(msg.items);
      return;
    case "apply-fix":
      await handleApplyFix(msg.issueId, msg.checkId, msg.params, state);
      return;
    case "dismiss-issue":
      handleDismissIssue(msg.issueId, state);
      return;
    case "tab-order-request":
      handleTabOrderRequest(msg.frameId);
      return;
    case "export-images-request":
      await handleExportImagesRequest(msg.scope);
      return;
    case "tab-order-overlay":
      await paintTabOrderOverlay(msg.items);
      return;
    case "annotate-tab-order":
      handleAnnotateTabOrder(msg.frameId, msg.orderMap);
      return;
    case "annotate-alt-text":
      await handleAnnotateAltText(msg.nodeId, msg.text, msg.decorative);
      return;
    case "annotate-language":
      handleAnnotateLanguage(msg.frameId, msg.lang);
      return;
    default:
      assertNever(msg);
  }
}

async function handleScanRequest(
  scope: "page",
  state: SandboxState,
): Promise<void> {
  if (state.scanInFlight) {
    postUI({
      type: "error",
      code: "SCAN_IN_FLIGHT",
      message: "A scan is already running.",
    });
    return;
  }
  state.scanInFlight = true;

  try {
    await clearOverlays();

    const result = await runScan({
      scope,
      onProgress: (current, total, checkRunning) => {
        postUI({ type: "scan-progress", current, total, checkRunning });
      },
    });

    state.lastIssues = result.issues;

    // Note: we do NOT paint the overlay here. The UI sorts the issues,
    // assigns 1..N indices, and replies with an overlay-repaint message
    // so canvas numbering matches the list.
    postUI({
      type: "scan-complete",
      issues: result.issues,
      meta: { totalNodes: result.totalNodes, durationMs: result.durationMs },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[a11y] scan failed", err);
    postUI({ type: "error", code: "SCAN_FAILED", message });
  } finally {
    state.scanInFlight = false;
  }
}

function handleJumpToNode(nodeId: string): void {
  const node = figma.getNodeById(nodeId);
  if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
    postUI({
      type: "error",
      code: "NODE_NOT_FOUND",
      message: `Node ${nodeId} not found or unselectable.`,
    });
    return;
  }
  const sceneNode = node as SceneNode;
  figma.viewport.scrollAndZoomIntoView([sceneNode]);
  figma.currentPage.selection = [sceneNode];
}

function handleDismissIssue(issueId: string, state: SandboxState): void {
  const issue = state.lastIssues.find((i) => i.id === issueId);
  if (!issue) return;
  issue.status = "dismissed";
}

/**
 * Phase 2: only check 01 (text contrast) supports auto-fix. The UI computes
 * the suggested color and ships it as `params.targetHex`. We re-color the
 * first solid fill of the text node, mark the issue as resolved, and emit
 * fix-applied with before/after for the UI to show a confirmation toast or
 * an updated detail view.
 */
async function handleApplyFix(
  issueId: string,
  checkId: Issue["checkId"],
  params: Record<string, unknown>,
  state: SandboxState,
): Promise<void> {
  const issue = state.lastIssues.find((i) => i.id === issueId);
  if (!issue) {
    postUI({
      type: "error",
      code: "ISSUE_NOT_FOUND",
      message: `Issue ${issueId} not found.`,
    });
    return;
  }

  if (checkId !== "01-text-contrast") {
    postUI({
      type: "error",
      code: "FIX_NOT_SUPPORTED",
      message: `Auto-fix is not supported for check ${checkId} yet.`,
    });
    return;
  }

  const targetHex = typeof params.targetHex === "string" ? params.targetHex : null;
  if (!targetHex) {
    postUI({
      type: "error",
      code: "FIX_PARAMS_MISSING",
      message: "Auto-fix expected `targetHex` in params.",
    });
    return;
  }

  const node = figma.getNodeById(issue.nodeId);
  if (!node || node.type !== "TEXT") {
    postUI({
      type: "error",
      code: "FIX_TARGET_INVALID",
      message: "Target node is not a text node.",
    });
    return;
  }

  const text = node as TextNode;
  const before = { textColor: issue.details["textColor"] ?? null };

  // We can't change a text fill without loading its font(s) first.
  try {
    await loadFontsForText(text);
    const newFill: SolidPaint = {
      type: "SOLID",
      color: hexToRgbCanvas(targetHex),
    };
    text.fills = [newFill];
    issue.status = "resolved";

    postUI({
      type: "fix-applied",
      issueId,
      before,
      after: { textColor: targetHex },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postUI({ type: "error", code: "FIX_FAILED", message });
  }
}

async function loadFontsForText(text: TextNode): Promise<void> {
  if (text.fontName === figma.mixed) {
    const segs = text.getStyledTextSegments(["fontName"]);
    const seen = new Set<string>();
    for (const s of segs) {
      const key = `${s.fontName.family}::${s.fontName.style}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await figma.loadFontAsync(s.fontName as FontName);
    }
  } else {
    await figma.loadFontAsync(text.fontName);
  }
}

function hexToRgbCanvas(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

// Annotate mode handlers (v0.3)

const INTERACTIVE_NAME =
  /(?:^|[^a-z])(button|btn|cta|link|input|field|checkbox|radio|toggle|switch|tab|chip|menu-?item|icon-button|select)(?:[^a-z]|$)/i;

/**
 * Resolve the scope for annotate-mode requests: explicit frameId if given,
 * else the first selected container, else the whole current page.
 */
function resolveAnnotateRoot(frameId?: string): BaseNode | null {
  if (frameId) return figma.getNodeById(frameId);
  const sel = figma.currentPage.selection;
  for (const node of sel) {
    if ("children" in node) return node;
  }
  return figma.currentPage;
}

function handleTabOrderRequest(frameId?: string): void {
  const root = resolveAnnotateRoot(frameId);
  if (!root) {
    postUI({
      type: "error",
      code: "FRAME_NOT_FOUND",
      message: `Frame ${frameId ?? "(selection)"} not found.`,
    });
    return;
  }

  const interactive: SceneNode[] = [];
  walkForInteractive(root, interactive);
  sortByVisualOrder(interactive);

  postUI({
    type: "tab-order-detected",
    frameId: root.id,
    nodes: interactive.map((n) => ({ nodeId: n.id, name: n.name })),
  });
}

function walkForInteractive(node: BaseNode, out: SceneNode[]): void {
  if ("visible" in node) {
    if (!node.visible) return;
    if (node.type === "FRAME" && node.name.startsWith(A11Y_FRAME_PREFIX)) return;

    const hasReactions =
      "reactions" in node && ((node.reactions?.length ?? 0) > 0);
    if (hasReactions || INTERACTIVE_NAME.test(node.name)) {
      out.push(node);
      // The container is the tab stop; don't also list its icon/label.
      return;
    }
  }
  if ("children" in node && node.children) {
    for (const child of node.children) {
      walkForInteractive(child, out);
    }
  }
}

/**
 * Row-major visual order (top-left → bottom-right): elements whose vertical
 * centers fall within a tolerance band are treated as one row and sorted by x.
 */
function sortByVisualOrder(nodes: SceneNode[]): void {
  const ROW_TOLERANCE = 16;
  nodes.sort((a, b) => {
    const ba = a.absoluteBoundingBox;
    const bb = b.absoluteBoundingBox;
    if (!ba || !bb) return 0;
    if (Math.abs(ba.y - bb.y) > ROW_TOLERANCE) return ba.y - bb.y;
    return ba.x - bb.x;
  });
}

function handleAnnotateTabOrder(
  frameId: string,
  orderMap: Record<string, number>,
): void {
  // v0.3: session-only storage; v1.1+ will persist via clientStorage.
  console.log(`[a11y] Tab order saved for frame ${frameId}:`, orderMap);
  postUI({
    type: "tab-order-saved",
    frameId,
    count: Object.keys(orderMap).length,
  });
}

/**
 * Export image-bearing nodes as PNG bytes so the UI can preview them and
 * feed them to the local vision model. The scope is explicit (the UI shows
 * it), and each image carries its previously saved alt assignment from
 * plugin data. Capped to avoid huge transfers on image-heavy pages.
 */
const MAX_EXPORT_IMAGES = 20;
const EXPORT_MAX_DIMENSION = 1024;

/** Plugin-data key where the alt assignment persists inside the .fig file. */
const ALT_DATA_KEY = "a11y-alt";

interface AltAssignment {
  text: string;
  decorative: boolean;
}

function readAltAssignment(node: SceneNode): AltAssignment | null {
  try {
    const raw = node.getPluginData(ALT_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AltAssignment;
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      decorative: parsed.decorative === true,
    };
  } catch {
    return null;
  }
}

async function handleExportImagesRequest(
  scope: "selection" | "page",
): Promise<void> {
  const roots: BaseNode[] =
    scope === "selection"
      ? [...figma.currentPage.selection]
      : [figma.currentPage];

  if (scope === "selection" && roots.length === 0) {
    postUI({
      type: "error",
      code: "IMAGES_NO_SELECTION",
      message:
        "Nothing is selected. Select frames or images on the canvas, or scan the entire page instead.",
    });
    return;
  }

  const candidates: SceneNode[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    walkForImages(root, candidates);
  }

  const images: Array<{
    nodeId: string;
    path: string[];
    bytes: Uint8Array;
    altText: string | null;
    decorative: boolean;
  }> = [];

  for (const node of candidates) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    if (images.length >= MAX_EXPORT_IMAGES) break;
    try {
      const scale = exportScaleFor(node);
      const bytes = await node.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: scale },
      });
      const saved = readAltAssignment(node);
      images.push({
        nodeId: node.id,
        path: nodePathOf(node),
        bytes,
        altText: saved && saved.text ? saved.text : null,
        decorative: saved?.decorative ?? false,
      });
    } catch (err) {
      console.warn(`[a11y] export failed for ${node.id}`, err);
    }
  }

  postUI({ type: "images-detected", scope, images });
}

function walkForImages(node: BaseNode, out: SceneNode[]): void {
  if ("visible" in node) {
    if (!node.visible) return;
    if (node.type === "FRAME" && node.name.startsWith(A11Y_FRAME_PREFIX)) return;

    if (hasImageFill(node)) {
      out.push(node);
      return; // an image node's children (if any) are part of the same image
    }
  }
  if ("children" in node && node.children) {
    for (const child of node.children) {
      walkForImages(child, out);
    }
  }
}

function hasImageFill(node: SceneNode): boolean {
  if (!("fills" in node)) return false;
  const fills = node.fills;
  if (fills === figma.mixed) return false;
  return fills.some((p) => p.type === "IMAGE" && p.visible !== false);
}

/** Keep exports lightweight: downscale anything larger than 1024px. */
function exportScaleFor(node: SceneNode): number {
  const box = node.absoluteBoundingBox;
  if (!box) return 1;
  const largest = Math.max(box.width, box.height);
  if (largest <= EXPORT_MAX_DIMENSION) return 1;
  return EXPORT_MAX_DIMENSION / largest;
}

function nodePathOf(node: SceneNode): string[] {
  const names: string[] = [];
  let cursor: BaseNode | null = node;
  while (cursor && cursor.type !== "PAGE" && cursor.type !== "DOCUMENT") {
    names.unshift(cursor.name);
    cursor = "parent" in cursor ? cursor.parent : null;
  }
  return names;
}

async function handleAnnotateAltText(
  nodeId: string,
  text: string,
  decorative: boolean,
): Promise<void> {
  const node = figma.getNodeById(nodeId);
  if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
    postUI({
      type: "error",
      code: "NODE_NOT_FOUND",
      message: `Image node ${nodeId} not found.`,
    });
    return;
  }

  // Persist on the node itself: plugin data is saved inside the .fig file,
  // so the assignment survives reopening the file and is re-read on the
  // next image scan.
  const sn = node as SceneNode;
  if (text || decorative) {
    sn.setPluginData(ALT_DATA_KEY, JSON.stringify({ text, decorative }));
  } else {
    sn.setPluginData(ALT_DATA_KEY, "");
  }

  await paintAltBadge(
    nodeId,
    decorative ? "decorative" : text ? "alt" : "none",
  );

  postUI({ type: "image-alt-text-saved", nodeId });
}

function handleAnnotateLanguage(frameId: string, lang: string): void {
  // v0.3: store language code temporarily (v1.1+ uses clientStorage).
  // The UI may send the "page" sentinel (no real frame selected).
  const node =
    frameId && frameId !== "page"
      ? figma.getNodeById(frameId)
      : resolveAnnotateRoot();
  if (!node) {
    postUI({
      type: "error",
      code: "FRAME_NOT_FOUND",
      message: `Frame ${frameId} not found.`,
    });
    return;
  }

  console.log(`[a11y] Language set for ${node.name} (${node.id}): ${lang}`);
}
