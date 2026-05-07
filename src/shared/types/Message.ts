/**
 * Message contract between the sandbox and the UI iframe.
 *
 * Both sides switch on `type` and benefit from exhaustiveness checking.
 * Payloads must be structurally cloneable (no functions, no class instances).
 */

import type { Issue } from "./Issue";

export type ScanScope = "page";

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
  | { type: "error"; code: string; message: string };

export type UIToSandbox =
  | { type: "scan-request"; scope: ScanScope }
  | { type: "scan-cancel" }
  | { type: "jump-to-node"; nodeId: string }
  | { type: "highlight-node"; nodeId: string | null };

/** Helper to assert exhaustive switches on either union. */
export function assertNever(value: never): never {
  throw new Error(
    `Unexpected message variant: ${JSON.stringify(value)}`,
  );
}
