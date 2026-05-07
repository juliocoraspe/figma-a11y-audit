/**
 * Shared constants used by sandbox, UI, and (later) CLI.
 */

import type { Severity } from "./types/Issue";

/**
 * WCAG contrast thresholds.
 * - normal text: 4.5:1
 * - large text:  3.0:1   (>=18pt / 24px regular OR >=14pt / 18.66px bold)
 *
 * We use pixel approximations because Figma reports fontSize in px:
 * 24px regular OR 18.66px bold counts as large.
 */
export const CONTRAST_THRESHOLD_NORMAL = 4.5;
export const CONTRAST_THRESHOLD_LARGE = 3.0;

export const LARGE_TEXT_PX = 24;
export const LARGE_TEXT_BOLD_PX = 18.66;

/** Font weight tokens that qualify as bold for the large-text rule. */
export const BOLD_STYLE_TOKENS = ["Bold", "Black", "Heavy", "Extra"];

export const OVERLAY_FRAME_NAME = "[a11y-overlay]";
export const OVERLAY_DOT_PREFIX = "dot-";
export const OVERLAY_DOT_SIZE = 16;
export const OVERLAY_HALO_WIDTH = 2;

/** Severity hex codes. Sandbox normalizes to {r,g,b} 0..1; UI uses as-is. */
export const SEVERITY_HEX: Record<Severity, string> = {
  critical: "#DC2626",
  serious: "#EA580C",
  moderate: "#CA8A04",
  minor: "#1E3A5F",
};

/** Cream-paper halo used around overlay dots and as primary UI background. */
export const HALO_HEX = "#F5F1E8";

/** Progress emit cadence — emit a scan-progress message every N nodes. */
export const PROGRESS_EMIT_EVERY = 50;
