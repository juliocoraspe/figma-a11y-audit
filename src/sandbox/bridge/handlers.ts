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
import { runScan } from "@sandbox/detect/runner";
import { paintOverlay, clearOverlays } from "@sandbox/overlay/manager";

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
