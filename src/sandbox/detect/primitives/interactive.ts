/**
 * Interactivity classifier — pure heuristics over NodeShape.
 *
 * A node is treated as interactive if any of the following hold:
 *   1. Its name (or any ancestor's name in the breadcrumb) matches a known
 *      interactive token: button, btn, cta, link, input, field, checkbox,
 *      radio, toggle, switch, tab, chip, menu-item, icon-button.
 *   2. It is itself a COMPONENT_SET / COMPONENT / INSTANCE whose name
 *      matches a known interactive token. Components are the canonical way
 *      designers ship interactive elements in Figma.
 *
 * Reactions/prototype connections would be the most accurate signal, but
 * they're not exposed on NodeShape (sandbox-side). Phase 2 sticks to
 * naming heuristics; the runner can add reactions later behind the seam.
 */

import type { NodeShape } from "@shared/types/NodeShape";

const INTERACTIVE_TOKENS = [
  "button",
  "btn",
  "cta",
  "link",
  "input",
  "field",
  "checkbox",
  "radio",
  "toggle",
  "switch",
  "tab",
  "chip",
  "menu-item",
  "menuitem",
  "icon-button",
];

const INTERACTIVE_COMPONENT_TYPES = new Set([
  "COMPONENT_SET",
  "COMPONENT",
  "INSTANCE",
]);

export function isInteractive(node: NodeShape, ancestorNames: string[] = []): boolean {
  const own = matchesToken(node.name);
  if (own) return true;

  if (INTERACTIVE_COMPONENT_TYPES.has(node.type) && matchesToken(node.name)) {
    return true;
  }

  for (const ancestorName of ancestorNames) {
    if (matchesToken(ancestorName)) return true;
  }
  return false;
}

/**
 * Looser variant used by check 05: only the node itself, not ancestors,
 * because focus-state checks operate on the COMPONENT_SET root.
 */
export function looksInteractive(name: string): boolean {
  return matchesToken(name);
}

function matchesToken(name: string): boolean {
  const lower = name.toLowerCase();
  return INTERACTIVE_TOKENS.some((tok) => {
    // word-ish match: token surrounded by non-letters or string edges.
    const pattern = new RegExp(`(?:^|[^a-z])${escape(tok)}(?:[^a-z]|$)`, "i");
    return pattern.test(lower);
  });
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
