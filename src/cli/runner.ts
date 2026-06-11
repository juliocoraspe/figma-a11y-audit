/**
 * CLI runner — adapts Figma REST API nodes → NodeShape → runs all 6 checks.
 *
 * This is the CLI equivalent of src/sandbox/detect/runner.ts.
 * The detection checks themselves are shared and require no modification.
 */

import type { Issue } from "../shared/types/Issue.js";
import type {
  NodeShape,
  PaintShape,
  EffectShape,
  VariantInfo,
  TextSegmentShape,
  FontNameShape,
} from "../shared/types/NodeShape.js";
import type { FigmaNode, FigmaPaint, FigmaEffect } from "./figma-api.js";
import { checkTextContrast } from "../sandbox/detect/checks/01-text-contrast.js";
import { checkUiContrast } from "../sandbox/detect/checks/02-ui-contrast.js";
import { checkTapTarget } from "../sandbox/detect/checks/03-tap-target.js";
import { checkTextSize } from "../sandbox/detect/checks/04-text-size.js";
import { checkFocusDefined } from "../sandbox/detect/checks/05-focus-defined.js";
import { checkFocusVisibility } from "../sandbox/detect/checks/06-focus-visibility.js";
import type { NodeLookup, ScanContext } from "../sandbox/detect/types/scan-context.js";

export interface CLIRunnerResult {
  issues: Issue[];
  totalNodes: number;
  durationMs: number;
}

/**
 * Collect all nodes in flat order (depth-first).
 */
function collectNodes(root: FigmaNode, out: FigmaNode[]): void {
  out.push(root);
  if (root.children) {
    for (const child of root.children) {
      collectNodes(child, out);
    }
  }
}

/**
 * Adapt a Figma REST API paint to PaintShape.
 */
function adaptPaint(p: FigmaPaint): PaintShape {
  const shape: PaintShape = {
    type: adaptPaintType(p.type),
    visible: p.visible,
    opacity: p.opacity,
  };
  if (p.type === "SOLID" && p.color) {
    shape.color = { r: p.color.r, g: p.color.g, b: p.color.b };
  }
  return shape;
}

function adaptPaintType(t: string): PaintShape["type"] {
  switch (t) {
    case "SOLID": return "SOLID";
    case "GRADIENT_LINEAR": return "GRADIENT_LINEAR";
    case "GRADIENT_RADIAL":
    case "GRADIENT_ANGULAR":
    case "GRADIENT_DIAMOND": return "GRADIENT_RADIAL";
    default: return "IMAGE";
  }
}

/**
 * Adapt a Figma REST API effect to EffectShape.
 */
function adaptEffect(e: FigmaEffect): EffectShape | null {
  if (
    e.type !== "DROP_SHADOW" &&
    e.type !== "INNER_SHADOW" &&
    e.type !== "LAYER_BLUR" &&
    e.type !== "BACKGROUND_BLUR"
  ) {
    return null;
  }
  const shape: EffectShape = { type: e.type, visible: e.visible };
  if (e.color) shape.color = { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a };
  if (typeof e.spread === "number") shape.spread = e.spread;
  return shape;
}

/**
 * Parse variant name string "Prop1=Val1, Prop2=Val2" into a record.
 */
function parseVariantName(rawName: string, variantProps: Record<string, string> | undefined): Record<string, string> {
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

/**
 * Adapt a Figma REST node to NodeShape.
 */
function adaptNode(
  node: FigmaNode,
  parentId: string | undefined,
  childrenByParentId: Map<string, string[]>,
): NodeShape {
  const shape: NodeShape = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible !== false,
    opacity: node.opacity,
  };

  if (node.absoluteBoundingBox) {
    shape.absoluteBoundingBox = { ...node.absoluteBoundingBox };
  }

  if (node.fills) {
    shape.fills = node.fills.map(adaptPaint);
  }
  if (node.strokes) {
    shape.strokes = node.strokes.map(adaptPaint);
  }
  if (typeof node.strokeWeight === "number") {
    shape.strokeWeight = node.strokeWeight;
  }
  if (node.effects) {
    shape.effects = node.effects
      .map(adaptEffect)
      .filter((e): e is EffectShape => e !== null);
  }

  if (parentId) shape.parentId = parentId;
  const kids = childrenByParentId.get(node.id);
  if (kids) shape.childrenIds = kids;

  // Text-specific
  if (node.type === "TEXT") {
    shape.characters = node.characters ?? "";
    if (node.style) {
      shape.fontSize = node.style.fontSize;
      shape.fontName = node.style.fontFamily
        ? { family: node.style.fontFamily, style: node.style.fontStyle ?? "Regular" }
        : undefined;
    }
  }

  // Component set: build variants from direct COMPONENT children
  if (node.type === "COMPONENT_SET" && node.children) {
    const variants: VariantInfo[] = [];
    for (const child of node.children) {
      if (child.type !== "COMPONENT") continue;
      variants.push({
        id: child.id,
        rawName: child.name,
        properties: parseVariantName(child.name, child.variantProperties),
      });
    }
    shape.variants = variants;
  }

  return shape;
}

/**
 * Build a path string array from node to root (breadcrumb).
 */
function buildPath(nodeId: string, parentMap: Map<string, string>, nameMap: Map<string, string>): string[] {
  const path: string[] = [];
  let id: string | undefined = nodeId;
  while (id) {
    const name = nameMap.get(id);
    if (name) path.unshift(name);
    id = parentMap.get(id);
  }
  return path;
}

/**
 * Main entry point: adapt REST tree → NodeShape map → run all 6 checks.
 */
export function runAuditOnTree(root: FigmaNode): CLIRunnerResult {
  const startedAt = Date.now();

  // Collect all nodes in flat order
  const allNodes: FigmaNode[] = [];
  collectNodes(root, allNodes);

  // Build parent map and children map
  const parentMap = new Map<string, string>();
  const childrenByParentId = new Map<string, string[]>();
  const nameMap = new Map<string, string>();

  for (const node of allNodes) {
    nameMap.set(node.id, node.name);
    if (node.children) {
      childrenByParentId.set(node.id, node.children.map((c) => c.id));
      for (const child of node.children) {
        parentMap.set(child.id, node.id);
      }
    }
  }

  // Adapt all nodes to NodeShape
  const shapes = new Map<string, NodeShape>();
  for (const node of allNodes) {
    shapes.set(node.id, adaptNode(node, parentMap.get(node.id), childrenByParentId));
  }

  // Build lookup
  const lookup: NodeLookup = {
    getById: (id) => shapes.get(id),
    getParent: (n) => (n.parentId ? shapes.get(n.parentId) : undefined),
    getChildren: (n) =>
      (n.childrenIds ?? [])
        .map((id) => shapes.get(id))
        .filter((c): c is NodeShape => c !== undefined),
  };

  // Run all checks
  const issues: Issue[] = [];
  for (const node of allNodes) {
    const shape = shapes.get(node.id);
    if (!shape) continue;

    const nodePath = buildPath(node.id, parentMap, nameMap);
    const ctx: ScanContext = { lookup, nodePath };

    if (shape.type === "TEXT") {
      issues.push(...checkTextContrast(shape, ctx));
      issues.push(...checkTextSize(shape, ctx));
    }

    issues.push(...checkUiContrast(shape, ctx));
    issues.push(...checkTapTarget(shape, ctx));

    if (shape.type === "COMPONENT_SET") {
      issues.push(...checkFocusDefined(shape, ctx));
      issues.push(...checkFocusVisibility(shape, ctx));
    }
  }

  return {
    issues,
    totalNodes: allNodes.length,
    durationMs: Date.now() - startedAt,
  };
}
