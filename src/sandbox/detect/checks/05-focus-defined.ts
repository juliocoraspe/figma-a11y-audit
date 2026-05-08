/**
 * Check 05 — Focus state defined (WCAG 2.4.7 AA).
 *
 * Pure function. NO figma.* imports. Receives NodeShape, returns Issues.
 *
 * The wow-moment check: most Figma component sets ship Default/Hover/Pressed
 * /Disabled but no Focus variant. We flag interactive component sets that
 * are missing a focus variant entirely.
 */

import type { Issue } from "@shared/types/Issue";
import type { NodeShape, VariantInfo } from "@shared/types/NodeShape";
import { wcagFor } from "@shared/wcag/criteria";
import type { ScanContext } from "../types/scan-context";
import { looksInteractive } from "../primitives/interactive";

const CHECK_ID = "05-focus-defined";
const WCAG = wcagFor(CHECK_ID);

const FOCUS_PATTERN = /focus(?:ed|-visible)?/i;

export function checkFocusDefined(node: NodeShape, _ctx: ScanContext): Issue[] {
  if (node.visible === false) return [];
  if (node.type !== "COMPONENT_SET") return [];
  if (!looksInteractive(node.name)) return [];

  const variants = node.variants ?? [];
  if (variants.length === 0) return [];

  const hasFocus = variants.some(variantHasFocus);
  if (hasFocus) return [];

  const friendlyName = node.name || "Component set";
  const variantNames = summarizeVariants(variants);

  return [
    {
      id: `${CHECK_ID}::${node.id}`,
      checkId: CHECK_ID,
      severity: "serious",
      message: `${quote(friendlyName)} component has variants: ${variantNames}. Missing focus state variant (WCAG 2.4.7 requires a visible focus indicator).`,
      nodeId: node.id,
      nodePath: _ctx.nodePath,
      wcagCriterion: WCAG.number,
      wcagLevel: WCAG.level,
      details: {
        variantCount: variants.length,
        existingVariants: variantNames,
        suggestedProperty: pickFocusProperty(variants),
      },
      fix: {
        type: "manual",
        suggestion: `Add a variant where the existing state property is set to a "Focus" value. Style it with a visible focus ring (a 2-3px outline in your accent color).`,
      },
      status: "open",
    },
  ];
}

function variantHasFocus(v: VariantInfo): boolean {
  for (const value of Object.values(v.properties)) {
    if (FOCUS_PATTERN.test(value)) return true;
  }
  // Fallback to raw name (covers components without variant props parsed).
  return FOCUS_PATTERN.test(v.rawName);
}

/**
 * Build a deduped, comma-joined list of state-like variant values.
 * Prefers values from a "state" or "status" property when present; otherwise
 * concatenates all property values into a tidy summary.
 */
function summarizeVariants(variants: VariantInfo[]): string {
  const stateProp = pickFocusProperty(variants);
  if (stateProp) {
    const seen = new Set<string>();
    for (const v of variants) {
      const val = v.properties[stateProp];
      if (val) seen.add(val);
    }
    if (seen.size > 0) return Array.from(seen).join(", ");
  }
  // Fallback: trim raw names.
  const names = variants.map((v) => v.rawName).slice(0, 6);
  return names.join(" · ");
}

/**
 * Pick the variant property name that most likely holds states.
 * Looks for "state", "status", "interaction" first; otherwise returns the
 * property with the most distinct values.
 */
function pickFocusProperty(variants: VariantInfo[]): string | null {
  if (variants.length === 0) return null;
  const propNames = new Set<string>();
  for (const v of variants) {
    for (const k of Object.keys(v.properties)) propNames.add(k);
  }

  const preferred = ["state", "status", "interaction"];
  for (const p of propNames) {
    if (preferred.includes(p.toLowerCase())) return p;
  }

  // Fallback: most-distinct property
  let best: string | null = null;
  let bestCount = 0;
  for (const p of propNames) {
    const distinct = new Set<string>();
    for (const v of variants) {
      const val = v.properties[p];
      if (val) distinct.add(val);
    }
    if (distinct.size > bestCount) {
      bestCount = distinct.size;
      best = p;
    }
  }
  return best;
}

function quote(s: string): string {
  return `'${s}'`;
}
