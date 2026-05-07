/**
 * Sandbox entry point. Boots the UI iframe, wires the message router, and
 * intercepts selection changes for click-on-dot detection.
 */

import type { UIToSandbox } from "@shared/types/Message";
import { createState, handleUIMessage } from "@sandbox/bridge/handlers";
import { clearOverlays, resolveDotSelection } from "@sandbox/overlay/manager";

const state = createState();

// 320..450px wide is the design budget; pick 360 as a sensible default.
figma.showUI(__html__, { width: 360, height: 560, themeColors: true });

// Defensive cleanup on plugin start: stale overlays from prior sessions.
clearOverlays().catch((err) => console.error("[a11y] startup cleanup", err));

figma.ui.onmessage = (msg: UIToSandbox) => {
  void handleUIMessage(msg, state);
};

// Click-on-dot: when the user selects a dot on the canvas, we forward the
// underlying issue's nodeId to the UI and redirect selection to the real
// node so the user is not stuck with a locked dot selected.
figma.on("selectionchange", () => {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) return;
  const single = sel[0];
  if (!single) return;

  const targetId = resolveDotSelection(single);
  if (!targetId) return;

  const issueIds = state.lastIssues
    .filter((i) => i.nodeId === targetId)
    .map((i) => i.id);

  figma.ui.postMessage({
    type: "node-focused",
    nodeId: targetId,
    issueIds,
  });

  const target = figma.getNodeById(targetId);
  if (target && target.type !== "DOCUMENT" && target.type !== "PAGE") {
    figma.currentPage.selection = [target as SceneNode];
  }
});
