/**
 * Sandbox entry point. Boots the UI iframe, wires the message router, and
 * intercepts selection changes for click-on-dot detection.
 */

import type { UIToSandbox } from "@shared/types/Message";
import {
  consumeProgrammaticSelection,
  createState,
  handleUIMessage,
  markProgrammaticSelection,
} from "@sandbox/bridge/handlers";
import { clearOverlays, resolveDotSelection } from "@sandbox/overlay/manager";

const state = createState();

// 320..450px wide is the design budget; pick 360 as a sensible default.
figma.showUI(__html__, { width: 360, height: 560, themeColors: true });

// Defensive cleanup on plugin start: stale overlays from prior sessions.
clearOverlays().catch((err) => console.error("[a11y] startup cleanup", err));

figma.ui.onmessage = (msg: UIToSandbox) => {
  handleUIMessage(msg, state).catch((err) => {
    // Never die silently: an unhandled throw here would leave the UI
    // hanging on whatever loading state it was in.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[a11y] handler failed", msg.type, err);
    figma.ui.postMessage({ type: "error", code: "HANDLER_FAILED", message });
  });
};

// Click-on-dot: when the user selects a dot on the canvas, we forward the
// underlying issue id (and the affected node id) to the UI and redirect
// selection to the real node so the user is not stuck with a locked dot
// selected.
figma.on("selectionchange", () => {
  // Selections we made ourselves (jump-to-node, dot redirect, focus fixes)
  // must not echo back as canvas picks.
  const programmatic = consumeProgrammaticSelection();

  const sel = figma.currentPage.selection;
  if (sel.length !== 1) return;
  const single = sel[0];
  if (!single) return;

  const resolved = resolveDotSelection(single);
  if (!resolved) {
    // A real design node (overlays are locked, so canvas clicks fall
    // through to the element beneath). Tab Order mode listens to this for
    // canvas picking; other views ignore it.
    if (!programmatic && !single.name.startsWith("[a11y-")) {
      figma.ui.postMessage({
        type: "canvas-node-selected",
        nodeId: single.id,
        name: single.name,
      });
    }
    return;
  }

  // Prefer the issue id encoded in the dot name; if multiple issues share
  // a node we still surface the specific one the user clicked.
  const matching = state.lastIssues.filter((i) => i.id === resolved.issueId);
  const issueIds =
    matching.length > 0
      ? matching.map((i) => i.id)
      : state.lastIssues.filter((i) => i.nodeId === resolved.nodeId).map((i) => i.id);

  figma.ui.postMessage({
    type: "node-focused",
    nodeId: resolved.nodeId,
    issueIds,
  });

  const target = figma.getNodeById(resolved.nodeId);
  if (target && target.type !== "DOCUMENT" && target.type !== "PAGE") {
    markProgrammaticSelection();
    figma.currentPage.selection = [target as SceneNode];
  }
});
