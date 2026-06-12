/**
 * Runner — the only place in detect/ that touches figma.*.
 *
 * Walks figma.currentPage, adapts SceneNode -> NodeShape, dispatches each
 * node to the relevant pure check, and emits scan-progress messages.
 *
 * The NodeShape adapter is the seam that the v1.0 CLI will reuse, mapping
 * Figma REST API JSON instead of SceneNode.
 */

import type { Issue } from "@shared/types/Issue";
import type {
  EffectShape,
  FontNameShape,
  NodeShape,
  PaintShape,
  TextSegmentShape,
  VariantInfo,
} from "@shared/types/NodeShape";
import { A11Y_FRAME_PREFIX, PROGRESS_EMIT_EVERY } from "@shared/constants";
import { checkTextContrast } from "./checks/01-text-contrast";
import { checkUiContrast } from "./checks/02-ui-contrast";
import { checkTapTarget } from "./checks/03-tap-target";
import { checkTextSize } from "./checks/04-text-size";
import { checkFocusDefined } from "./checks/05-focus-defined";
import { checkFocusVisibility } from "./checks/06-focus-visibility";
import type { NodeLookup, ScanContext } from "./types/scan-context";

export interface RunnerOptions {
  scope: "page";
  onProgress?: (current: number, total: number, checkRunning: string) => void;
}

export interface RunnerResult {
  issues: Issue[];
  totalNodes: number;
  durationMs: number;
}

/**
 * Two-pass walk:
 *   Pass 1 — collect SceneNodes and build the NodeShape map (with
 *            parentId/childrenIds wiring) so checks can ask for parents.
 *   Pass 2 — dispatch each NodeShape to checks.
 *
 * The pages-only scope of Phase 1 means we walk figma.currentPage.
 */
export async function runScan(opts: RunnerOptions): Promise<RunnerResult> {
  const startedAt = Date.now();
  const page = figma.currentPage;

  // Ensure we have fonts available later for selection ops; not strictly
  // needed for reading, but harmless.
  await Promise.resolve();

  // Pass 1 — flatten and adapt. componentOf records, for every node inside
  // an instance, which main component it ultimately comes from — the UI
  // groups identical findings across instances with it.
  const order: SceneNode[] = [];
  const componentOf = new Map<string, { id: string; name: string }>();
  collect(page, order, componentOf, null);

  const shapes = new Map<string, NodeShape>();
  for (const sn of order) {
    shapes.set(sn.id, figmaNodeToShape(sn));
  }

  // Build a stable lookup so checks can navigate the tree on NodeShape only.
  const lookup: NodeLookup = {
    getById: (id) => shapes.get(id),
    getParent: (n) => (n.parentId ? shapes.get(n.parentId) : undefined),
    getChildren: (n) =>
      (n.childrenIds ?? [])
        .map((id) => shapes.get(id))
        .filter((c): c is NodeShape => c !== undefined),
  };

  // Pass 2 — dispatch. Each node is offered to every applicable check;
  // checks short-circuit on type so the cost is small.
  const issues: Issue[] = [];
  let processed = 0;
  for (const sn of order) {
    processed++;
    if (
      opts.onProgress &&
      processed % PROGRESS_EMIT_EVERY === 0
    ) {
      opts.onProgress(processed, order.length, "running checks");
    }

    const shape = shapes.get(sn.id);
    if (!shape) continue;

    const ctx: ScanContext = { lookup, nodePath: pathOf(sn) };

    // Text-only checks
    if (shape.type === "TEXT") {
      issues.push(...checkTextContrast(shape, ctx));
      issues.push(...checkTextSize(shape, ctx));
    }

    // Universal checks (each short-circuits internally on type)
    issues.push(...checkUiContrast(shape, ctx));
    issues.push(...checkTapTarget(shape, ctx));

    // Component-set checks
    if (shape.type === "COMPONENT_SET") {
      issues.push(...checkFocusDefined(shape, ctx));
      issues.push(...checkFocusVisibility(shape, ctx));
    }
  }

  if (opts.onProgress) {
    opts.onProgress(order.length, order.length, "done");
  }

  // Attach component provenance so the UI can group per-instance repeats.
  for (const issue of issues) {
    const comp = componentOf.get(issue.nodeId);
    if (comp) {
      issue.componentId = comp.id;
      issue.componentName = comp.name;
    }
  }

  return {
    issues,
    totalNodes: order.length,
    durationMs: Date.now() - startedAt,
  };
}

// ---------- collection ----------

function collect(
  node: BaseNode,
  out: SceneNode[],
  componentOf: Map<string, { id: string; name: string }>,
  comp: { id: string; name: string } | null,
): void {
  let nextComp = comp;
  if (isSceneNode(node)) {
    // Hidden subtrees can't fail the user: children of an invisible parent
    // report visible === true, so pruning here is the only correct cutoff.
    if (!node.visible) return;
    // Never audit our own overlays (issues, tab order, alt text).
    if (node.type === "FRAME" && node.name.startsWith(A11Y_FRAME_PREFIX)) return;

    // Entering an instance: everything below traces to its main component.
    // Innermost instance wins (an icon inside a button groups by the icon).
    if (node.type === "INSTANCE") {
      try {
        const mc = (node as InstanceNode).mainComponent;
        if (mc) {
          const name =
            mc.parent && mc.parent.type === "COMPONENT_SET"
              ? mc.parent.name
              : mc.name;
          nextComp = { id: mc.id, name };
        }
      } catch {
        // mainComponent can throw under dynamic-page; keep outer context.
      }
    }

    out.push(node);
    if (nextComp) componentOf.set(node.id, nextComp);
  }
  if ("children" in node) {
    for (const c of node.children) collect(c, out, componentOf, nextComp);
  }
}

function isSceneNode(node: BaseNode): node is SceneNode {
  // SceneNode has `visible`; PageNode and DocumentNode do not.
  return "visible" in node;
}

function pathOf(node: SceneNode): string[] {
  const names: string[] = [];
  let cursor: BaseNode | null = node;
  while (cursor && cursor.type !== "PAGE" && cursor.type !== "DOCUMENT") {
    names.unshift(cursor.name);
    cursor = "parent" in cursor ? cursor.parent : null;
  }
  return names;
}

// ---------- adapter: SceneNode -> NodeShape ----------

export function figmaNodeToShape(sn: SceneNode): NodeShape {
  const shape: NodeShape = {
    id: sn.id,
    name: sn.name,
    type: sn.type,
    visible: "visible" in sn ? sn.visible : true,
  };

  if ("opacity" in sn) shape.opacity = sn.opacity;
  if ("absoluteBoundingBox" in sn && sn.absoluteBoundingBox) {
    const b = sn.absoluteBoundingBox;
    shape.absoluteBoundingBox = { x: b.x, y: b.y, width: b.width, height: b.height };
  }
  if ("fills" in sn) shape.fills = adaptFills(sn.fills);
  if ("strokes" in sn) shape.strokes = adaptPaints(sn.strokes);
  if ("strokeWeight" in sn) {
    shape.strokeWeight = sn.strokeWeight === figma.mixed ? "MIXED" : sn.strokeWeight;
  }
  if ("effects" in sn) shape.effects = adaptEffects(sn.effects);

  // Prototype reactions — the strongest interactivity signal we have.
  if ("reactions" in sn) {
    shape.hasReactions = (sn.reactions?.length ?? 0) > 0;
  }

  // Parent / children
  if ("parent" in sn && sn.parent && sn.parent.id) shape.parentId = sn.parent.id;
  if ("children" in sn) shape.childrenIds = sn.children.map((c) => c.id);

  // Text-specific
  if (sn.type === "TEXT") {
    const t = sn as TextNode;
    shape.fontSize = t.fontSize === figma.mixed ? "MIXED" : t.fontSize;
    shape.fontName = t.fontName === figma.mixed ? "MIXED" : t.fontName;
    shape.characters = t.characters;

    if (t.fills === figma.mixed || t.fontSize === figma.mixed || t.fontName === figma.mixed) {
      shape.fills = "MIXED";
      shape.textSegments = adaptTextSegments(t);
    }
  }

  // Component-set variants (used by check 05)
  if (sn.type === "COMPONENT_SET") {
    shape.variants = adaptVariants(sn as ComponentSetNode);
  }

  return shape;
}

function adaptFills(fills: ReadonlyArray<Paint> | typeof figma.mixed): PaintShape[] | "MIXED" {
  if (fills === figma.mixed) return "MIXED";
  return adaptPaints(fills);
}

function adaptPaints(paints: ReadonlyArray<Paint>): PaintShape[] {
  const out: PaintShape[] = [];
  for (const p of paints) {
    out.push(adaptPaint(p));
  }
  return out;
}

function adaptPaint(p: Paint): PaintShape {
  const base: PaintShape = {
    type: paintTypeFor(p.type),
    visible: p.visible,
    opacity: p.opacity,
  };
  if (p.type === "SOLID") {
    base.color = { r: p.color.r, g: p.color.g, b: p.color.b };
  }
  return base;
}

function paintTypeFor(t: Paint["type"]): PaintShape["type"] {
  switch (t) {
    case "SOLID":
      return "SOLID";
    case "GRADIENT_LINEAR":
      return "GRADIENT_LINEAR";
    case "GRADIENT_RADIAL":
    case "GRADIENT_ANGULAR":
    case "GRADIENT_DIAMOND":
      return "GRADIENT_RADIAL";
    case "IMAGE":
    case "VIDEO":
      return "IMAGE";
    default:
      // Future paint types (PATTERN, etc.) treated as opaque media for
      // background classification — bails to "non-uniform" in the resolver.
      return "IMAGE";
  }
}

function adaptEffects(effects: ReadonlyArray<Effect>): EffectShape[] {
  const out: EffectShape[] = [];
  for (const e of effects) {
    if (
      e.type === "DROP_SHADOW" ||
      e.type === "INNER_SHADOW" ||
      e.type === "LAYER_BLUR" ||
      e.type === "BACKGROUND_BLUR"
    ) {
      const shape: EffectShape = { type: e.type, visible: e.visible };
      if ("color" in e && e.color) shape.color = { ...e.color };
      if ("spread" in e && typeof e.spread === "number") shape.spread = e.spread;
      out.push(shape);
    }
  }
  return out;
}

function adaptVariants(set: ComponentSetNode): VariantInfo[] {
  const out: VariantInfo[] = [];
  for (const child of set.children) {
    if (child.type !== "COMPONENT") continue;
    const properties = parseVariantName(child.name, child.variantProperties);
    out.push({ id: child.id, rawName: child.name, properties });
  }
  return out;
}

/**
 * Figma exposes `variantProperties` only on instances; on COMPONENT children
 * of a COMPONENT_SET it can be null. Fall back to parsing the raw name,
 * which always uses the form "Prop1=Val1, Prop2=Val2".
 */
function parseVariantName(
  rawName: string,
  variantProps: { [name: string]: string } | null,
): Record<string, string> {
  if (variantProps) return { ...variantProps };
  const out: Record<string, string> = {};
  for (const part of rawName.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function adaptTextSegments(t: TextNode): TextSegmentShape[] {
  // getStyledTextSegments returns segments unified across all requested fields.
  const segs = t.getStyledTextSegments(["fills", "fontSize", "fontName"]);
  const out: TextSegmentShape[] = [];
  for (const s of segs) {
    const fills: PaintShape[] = adaptPaints(s.fills as ReadonlyArray<Paint>);
    const fontName = s.fontName as FontNameShape;
    out.push({
      start: s.start,
      end: s.end,
      characters: s.characters,
      fills,
      fontSize: s.fontSize,
      fontName: { family: fontName.family, style: fontName.style },
    });
  }
  return out;
}
