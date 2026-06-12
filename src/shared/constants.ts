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

/**
 * Annotation overlays (tab order, alt text) live in their own locked frames,
 * visually distinct from the issue dots:
 *   - issues:    numbered circles/pills, severity color, top-RIGHT corner
 *   - tab order: numbered purple SQUARES, top-LEFT corner + dashed path line
 *   - alt text:  green ALT / gray DECO chip, bottom-left corner
 * Every overlay frame name starts with this prefix so scans can skip them all.
 */
export const A11Y_FRAME_PREFIX = "[a11y-";
export const TAB_OVERLAY_FRAME_NAME = "[a11y-tab-order]";
export const ALT_OVERLAY_FRAME_NAME = "[a11y-alt-text]";
export const TAB_BADGE_HEX = "#7C3AED";
export const TAB_BADGE_SIZE = 20;
export const ALT_BADGE_HEX = "#16A34A";
export const ALT_DECO_HEX = "#6B7280";

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
