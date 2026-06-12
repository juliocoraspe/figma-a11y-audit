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
import {
  A11Y_FRAME_PREFIX,
  FOCUS_RING_HEX,
  FOCUS_RING_SPREAD,
} from "@shared/constants";
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
    case "apply-fix-batch":
      await handleApplyFixBatch(msg.items, state);
      return;
    case "dismiss-issue":
      handleDismissIssue(msg.issueId, state);
      return;
    case "restore-dismissed":
      saveDismissed(new Set());
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

    // Re-apply persisted dismissals: the file remembers human decisions
    // across sessions, so a re-scan never nags about what was already
    // reviewed. Stale ids (issues that no longer occur) are pruned so the
    // store can't grow without bound.
    const dismissed = loadDismissed();
    if (dismissed.size > 0) {
      const present = new Set<string>();
      for (const issue of result.issues) {
        if (dismissed.has(issue.id)) {
          issue.status = "dismissed";
          present.add(issue.id);
        }
      }
      if (present.size !== dismissed.size) saveDismissed(present);
    }

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
  if (issue) issue.status = "dismissed";

  // Persist regardless of whether the issue is in the in-memory list:
  // issue ids are stable (checkId::nodeId), so the dismissal sticks across
  // sessions and re-scans.
  const dismissed = loadDismissed();
  if (!dismissed.has(issueId)) {
    dismissed.add(issueId);
    saveDismissed(dismissed);
  }
}

/** Page-level plugin data key holding the dismissed issue ids. */
const DISMISSED_KEY = "a11y-dismissed";

function loadDismissed(): Set<string> {
  try {
    const raw = figma.currentPage.getPluginData(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((x): x is string => typeof x === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>): void {
  figma.currentPage.setPluginData(
    DISMISSED_KEY,
    ids.size > 0 ? JSON.stringify([...ids]) : "",
  );
}

/**
 * Auto-fix dispatch.
 *   01 — recolor the text with the UI-computed `params.targetHex`.
 *   05 — clone the Default variant into a new Focus variant with a visible
 *        focus ring, placed inside the component set on canvas.
 *   06 — strengthen a weak focus indicator (ring spread + thin strokes).
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

  try {
    switch (checkId) {
      case "01-text-contrast":
        await fixTextContrast(issue, params);
        return;
      case "05-focus-defined":
        await fixCreateFocusVariant(issue);
        return;
      case "06-focus-visibility":
        await fixStrengthenFocusIndicator(issue);
        return;
      default:
        postUI({
          type: "error",
          code: "FIX_NOT_SUPPORTED",
          message: `Auto-fix is not supported for check ${checkId} yet.`,
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postUI({ type: "error", code: "FIX_FAILED", message });
  }
}

/**
 * Reviewed batch from the UI's "proposed changes" panel. Applies every item
 * through the same per-check fix functions (each emits its own fix-applied),
 * commits the whole batch as a single undo step, and reports the tally.
 */
async function handleApplyFixBatch(
  items: Array<{
    issueId: string;
    checkId: Issue["checkId"];
    params: Record<string, unknown>;
  }>,
  state: SandboxState,
): Promise<void> {
  let applied = 0;
  let failed = 0;

  for (const item of items) {
    const issue = state.lastIssues.find((i) => i.id === item.issueId);
    if (!issue || issue.status !== "open") {
      failed++;
      continue;
    }
    try {
      switch (item.checkId) {
        case "01-text-contrast":
          await fixTextContrast(issue, item.params);
          break;
        case "05-focus-defined":
          await fixCreateFocusVariant(issue);
          break;
        case "06-focus-visibility":
          await fixStrengthenFocusIndicator(issue);
          break;
        default:
          failed++;
          continue;
      }
      // The fix functions flip status on success; re-read it (TS narrowed
      // `status` to "open" above and can't see the mutation).
      if ((issue.status as Issue["status"]) === "resolved") applied++;
      else failed++;
    } catch (err) {
      console.warn(`[a11y] batch fix failed for ${item.issueId}`, err);
      failed++;
    }
  }

  figma.commitUndo();
  postUI({ type: "batch-fix-complete", applied, failed });
}

async function fixTextContrast(
  issue: Issue,
  params: Record<string, unknown>,
): Promise<void> {
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
  await loadFontsForText(text);
  const newFill: SolidPaint = {
    type: "SOLID",
    color: hexToRgbCanvas(targetHex),
  };
  text.fills = [newFill];
  issue.status = "resolved";

  postUI({
    type: "fix-applied",
    issueId: issue.id,
    before,
    after: { textColor: targetHex },
  });
}

// ---------- focus state fixes (checks 05 / 06) ----------

const FOCUS_VARIANT_PATTERN = /focus(?:ed|-visible)?/i;
const DEFAULT_VARIANT_PATTERN = /default|rest|enabled|normal/i;

/**
 * Check 05 fix: create the missing Focus variant. Clones the Default-like
 * variant, names it `<StateProp>=Focus` (preserving the other variant
 * properties), styles it with a visible focus ring, places it at the right
 * edge of the component set, and zooms the viewport to it so the suggested
 * frame is right there on canvas for review.
 */
async function fixCreateFocusVariant(issue: Issue): Promise<void> {
  const set = figma.getNodeById(issue.nodeId);
  if (!set || set.type !== "COMPONENT_SET") {
    postUI({
      type: "error",
      code: "FIX_TARGET_INVALID",
      message: "Target node is not a component set.",
    });
    return;
  }

  const variants = set.children.filter(
    (c): c is ComponentNode => c.type === "COMPONENT",
  );
  if (variants.length === 0) {
    postUI({
      type: "error",
      code: "FIX_TARGET_INVALID",
      message: "Component set has no variants to clone.",
    });
    return;
  }
  if (variants.some((v) => FOCUS_VARIANT_PATTERN.test(v.name))) {
    // Someone added it since the scan; just mark the issue resolved.
    issue.status = "resolved";
    postUI({
      type: "fix-applied",
      issueId: issue.id,
      before: {},
      after: { note: "Focus variant already exists." },
    });
    return;
  }

  const baseline =
    variants.find((v) => DEFAULT_VARIANT_PATTERN.test(v.name)) ?? variants[0]!;

  const stateProp =
    typeof issue.details["suggestedProperty"] === "string" &&
    issue.details["suggestedProperty"]
      ? (issue.details["suggestedProperty"] as string)
      : "State";

  const clone = baseline.clone();
  clone.name = focusVariantName(baseline.name, stateProp);
  set.appendChild(clone);

  // Place it after the right-most variant, aligned with the baseline.
  const maxRight = Math.max(...variants.map((v) => v.x + v.width));
  clone.x = maxRight + 24;
  clone.y = baseline.y;

  // Grow the set frame if the new variant falls outside it.
  const needW = clone.x + clone.width + 16;
  const needH = clone.y + clone.height + 16;
  if (set.width < needW || set.height < needH) {
    set.resizeWithoutConstraints(
      Math.max(set.width, needW),
      Math.max(set.height, needH),
    );
  }

  applyFocusRing(clone);
  issue.status = "resolved";

  figma.currentPage.selection = [clone];
  figma.viewport.scrollAndZoomIntoView([clone]);

  postUI({
    type: "fix-applied",
    issueId: issue.id,
    before: { variants: issue.details["existingVariants"] ?? null },
    after: {
      createdVariant: clone.name,
      indicator: `${FOCUS_RING_SPREAD}px ring ${FOCUS_RING_HEX}`,
    },
  });
}

/**
 * Check 06 fix: the Focus variant exists but its indicator is too thin or
 * too low-contrast. Apply the standard focus ring (and bump any sub-2px
 * stroke), then zoom to the variant for review.
 */
async function fixStrengthenFocusIndicator(issue: Issue): Promise<void> {
  const set = figma.getNodeById(issue.nodeId);
  if (!set || set.type !== "COMPONENT_SET") {
    postUI({
      type: "error",
      code: "FIX_TARGET_INVALID",
      message: "Target node is not a component set.",
    });
    return;
  }

  const focusVariant = set.children.find(
    (c): c is ComponentNode =>
      c.type === "COMPONENT" && FOCUS_VARIANT_PATTERN.test(c.name),
  );
  if (!focusVariant) {
    postUI({
      type: "error",
      code: "FIX_TARGET_INVALID",
      message: "No focus variant found in the component set.",
    });
    return;
  }

  applyFocusRing(focusVariant);
  if (
    typeof focusVariant.strokeWeight === "number" &&
    focusVariant.strokeWeight > 0 &&
    focusVariant.strokeWeight < 2
  ) {
    focusVariant.strokeWeight = 2;
  }

  issue.status = "resolved";
  figma.currentPage.selection = [focusVariant];
  figma.viewport.scrollAndZoomIntoView([focusVariant]);

  postUI({
    type: "fix-applied",
    issueId: issue.id,
    before: {
      thickness: issue.details["thickness"] ?? null,
      indicatorContrast: issue.details["indicatorContrast"] ?? null,
    },
    after: {
      indicator: `${FOCUS_RING_SPREAD}px ring ${FOCUS_RING_HEX}`,
    },
  });
}

/**
 * Visible focus ring as a 0-blur drop shadow with spread: reads as a ring,
 * never fights the variant's own strokes, and is exactly what check 06's
 * shadow-indicator detection looks for. Prepended so it wins over any
 * existing weak shadows.
 */
function applyFocusRing(node: ComponentNode): void {
  const c = hexToRgbCanvas(FOCUS_RING_HEX);
  const ring: DropShadowEffect = {
    type: "DROP_SHADOW",
    color: { r: c.r, g: c.g, b: c.b, a: 1 },
    offset: { x: 0, y: 0 },
    radius: 0,
    spread: FOCUS_RING_SPREAD,
    visible: true,
    blendMode: "NORMAL",
  };
  node.effects = [ring, ...node.effects];
}

/**
 * Build the focus variant name from the baseline's: keep every other
 * property, set/replace the state property with "Focus".
 * "State=Default, Size=Md" -> "State=Focus, Size=Md".
 */
function focusVariantName(baselineName: string, stateProp: string): string {
  const parts = baselineName
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  let replaced = false;
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key.toLowerCase() === stateProp.toLowerCase()) {
      out.push(`${key}=Focus`);
      replaced = true;
    } else {
      out.push(part);
    }
  }
  if (!replaced) out.unshift(`${stateProp}=Focus`);
  return out.join(", ");
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

  const nodes = interactive.map((n) => ({ nodeId: n.id, name: n.name }));

  // Resume a previously saved assignment: prune deleted nodes, and surface
  // stops the user added by hand (canvas picking) that detection misses.
  const saved = loadTabOrder(root.id);
  const pruned: Record<string, number> = {};
  const known = new Set(nodes.map((n) => n.nodeId));
  for (const [nodeId, order] of Object.entries(saved)) {
    const node = figma.getNodeById(nodeId);
    if (!node || node.type === "DOCUMENT" || node.type === "PAGE") continue;
    pruned[nodeId] = order;
    if (!known.has(nodeId)) {
      nodes.push({ nodeId, name: node.name });
      known.add(nodeId);
    }
  }

  postUI({
    type: "tab-order-detected",
    frameId: root.id,
    nodes,
    saved: pruned,
  });
}

/** Page-level plugin data key holding tab orders per frame. */
const TAB_ORDER_KEY = "a11y-tab-order";

function loadTabOrder(frameId: string): Record<string, number> {
  try {
    const raw = figma.currentPage.getPluginData(TAB_ORDER_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, Record<string, number>>;
    return all[frameId] ?? {};
  } catch {
    return {};
  }
}

function saveTabOrder(frameId: string, orderMap: Record<string, number>): void {
  let all: Record<string, Record<string, number>> = {};
  try {
    const raw = figma.currentPage.getPluginData(TAB_ORDER_KEY);
    if (raw) all = JSON.parse(raw) as Record<string, Record<string, number>>;
  } catch {
    all = {};
  }
  if (Object.keys(orderMap).length > 0) all[frameId] = orderMap;
  else delete all[frameId];
  figma.currentPage.setPluginData(
    TAB_ORDER_KEY,
    Object.keys(all).length > 0 ? JSON.stringify(all) : "",
  );
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
  // Persisted in page plugin data (saved inside the .fig file), so the
  // assignment can be reopened and edited later without re-analysis.
  saveTabOrder(frameId, orderMap);
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
