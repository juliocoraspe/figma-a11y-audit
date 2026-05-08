/**
 * Message contract between the sandbox and the UI iframe.
 *
 * Both sides switch on `type` and benefit from exhaustiveness checking.
 * Payloads must be structurally cloneable (no functions, no class instances).
 */

import type { Issue } from "./Issue";

export type ScanScope = "page";

/**
 * Each Issue carries an optional `index` (1-indexed) assigned UI-side after
 * sorting. The same number is rendered in the canvas dot and in the list row
 * so the user can match a dot to its row at a glance. The UI sends an
 * `overlay-repaint` after sorting so the sandbox knows which issues to draw
 * (and in what order) without having to re-sort independently.
 */

export type SandboxToUI =
  | {
      type: "scan-progress";
      current: number;
      total: number;
      checkRunning: string;
    }
  | {
      type: "scan-complete";
      issues: Issue[];
      meta: { totalNodes: number; durationMs: number };
    }
  | { type: "scan-cancelled" }
  | { type: "node-focused"; nodeId: string; issueIds: string[] }
  | {
      type: "fix-applied";
      issueId: string;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    }
  | { type: "error"; code: string; message: string };

/**
 * `overlay-repaint`: minimal payload the UI sends after sorting/dismissing.
 * Each entry pairs an issue id with the display number to render inside its
 * dot. The sandbox uses this to redraw the [a11y-overlay] frame.
 */
export interface OverlayPaintItem {
  issueId: string;
  nodeId: string;
  severity: Issue["severity"];
  index: number;
}

export type UIToSandbox =
  | { type: "scan-request"; scope: ScanScope }
  | { type: "scan-cancel" }
  | { type: "jump-to-node"; nodeId: string }
  | { type: "highlight-node"; nodeId: string | null }
  | { type: "overlay-repaint"; items: OverlayPaintItem[] }
  | {
      type: "apply-fix";
      issueId: string;
      checkId: Issue["checkId"];
      params: Record<string, unknown>;
    }
  | { type: "dismiss-issue"; issueId: string };

/** Helper to assert exhaustive switches on either union. */
export function assertNever(value: never): never {
  throw new Error(
    `Unexpected message variant: ${JSON.stringify(value)}`,
  );
}
