/**
 * Sandbox-side message router.
 *
 * Owns the lifecycle of a scan and the side-effects on figma.* (selection,
 * viewport, overlay paint). Pure logic lives in detect/ and overlay/.
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
      // Not supported in Phase 1 (scan is short and synchronous-ish).
      // We acknowledge and noop.
      postUI({ type: "scan-cancelled" });
      return;
    case "jump-to-node":
      handleJumpToNode(msg.nodeId);
      return;
    case "highlight-node":
      // Reserved for v0.2 hover bidirectional. Phase 1: log and noop.
      console.log("[a11y] highlight-node (noop in Phase 1)", msg.nodeId);
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
    // Defensive cleanup before each scan.
    await clearOverlays();

    const result = await runScan({
      scope,
      onProgress: (current, total, checkRunning) => {
        postUI({ type: "scan-progress", current, total, checkRunning });
      },
    });

    state.lastIssues = result.issues;
    await paintOverlay(result.issues);

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
