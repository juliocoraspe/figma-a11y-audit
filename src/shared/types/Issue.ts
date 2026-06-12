/**
 * The Issue type — the contract that binds runner, UI, overlay, and (later) CLI.
 * An Issue is fully serializable: it crosses postMessage boundaries.
 */

export type Severity = "critical" | "serious" | "moderate" | "minor";

export type CheckId =
  | "01-text-contrast"
  | "02-ui-contrast"
  | "03-tap-target"
  | "04-text-size"
  | "05-focus-defined"
  | "06-focus-visibility";

export interface IssueFix {
  type: "auto" | "manual";
  suggestion: string;
  params?: Record<string, unknown>;
}

export interface Issue {
  id: string;
  checkId: CheckId;
  severity: Severity;
  message: string;
  nodeId: string;
  nodePath: string[];
  wcagCriterion: string;
  wcagLevel: "A" | "AA" | "AAA";
  details: Record<string, unknown>;
  fix?: IssueFix;
  status: "open" | "dismissed" | "resolved";
  /**
   * Set by the runner when the node lives inside a component instance:
   * the main component's id/name. The UI uses it to collapse identical
   * findings across N instances into a single grouped row ("fix the
   * component, not 40 copies").
   */
  componentId?: string;
  componentName?: string;
  /**
   * Stable 1-indexed display order assigned UI-side after sorting.
   * The same number is rendered in the canvas dot and in the list row, so
   * the user can match a dot to its row at a glance.
   * Optional: checks never set this; only the UI does.
   */
  index?: number;
  /**
   * UI-side grouping (assigned after sorting, never by checks): when this
   * issue represents N identical findings across instances, groupCount is N
   * and groupMembers lists every member so dismiss/fix/overlay can fan out.
   */
  groupCount?: number;
  groupMembers?: Array<{ issueId: string; nodeId: string }>;
}
