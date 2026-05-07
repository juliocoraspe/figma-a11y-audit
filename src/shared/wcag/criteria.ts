/**
 * Maps internal CheckId -> WCAG criterion metadata.
 * Used by checks to stamp issues and by UI to render the criterion label.
 */

import type { CheckId } from "../types/Issue";

export interface WcagCriterion {
  number: string;
  level: "A" | "AA" | "AAA";
  title: string;
  url: string;
}

const W3 = "https://www.w3.org/WAI/WCAG21/Understanding";

export const WCAG_BY_CHECK: Record<CheckId, WcagCriterion> = {
  "01-text-contrast": {
    number: "1.4.3",
    level: "AA",
    title: "Contrast (Minimum)",
    url: `${W3}/contrast-minimum.html`,
  },
  "02-ui-contrast": {
    number: "1.4.11",
    level: "AA",
    title: "Non-text Contrast",
    url: `${W3}/non-text-contrast.html`,
  },
  "03-tap-target": {
    number: "2.5.5",
    level: "AAA",
    title: "Target Size",
    url: `${W3}/target-size.html`,
  },
  "04-text-size": {
    number: "1.4.4",
    level: "AA",
    title: "Resize Text",
    url: `${W3}/resize-text.html`,
  },
  "05-focus-defined": {
    number: "2.4.7",
    level: "AA",
    title: "Focus Visible",
    url: `${W3}/focus-visible.html`,
  },
  "06-focus-visibility": {
    number: "2.4.11",
    level: "AA",
    title: "Focus Not Obscured",
    url: `${W3}/focus-not-obscured-minimum.html`,
  },
};

export function wcagFor(checkId: CheckId): WcagCriterion {
  return WCAG_BY_CHECK[checkId];
}
