/**
 * Shared fixtures for check specs. Pure NodeShape builders plus a map-backed
 * NodeLookup, mirroring how the runner feeds checks through the ScanContext
 * seam. NO figma.* — same constraint as the checks themselves.
 */

import { hexToRgb } from "@shared/color/srgb";
import type { NodeShape, PaintShape } from "@shared/types/NodeShape";
import type { NodeLookup, ScanContext } from "./types/scan-context";

let autoId = 0;

/** Build a NodeShape with sensible defaults; override anything per-test. */
export function node(partial: Partial<NodeShape> = {}): NodeShape {
  autoId += 1;
  return {
    id: `node-${autoId}`,
    name: "Node",
    type: "FRAME",
    ...partial,
  };
}

/** Convenience TEXT node: 16px Regular with a solid black fill. */
export function textNode(partial: Partial<NodeShape> = {}): NodeShape {
  return node({
    type: "TEXT",
    name: "Text",
    characters: "Hello",
    fontSize: 16,
    fontName: { family: "Inter", style: "Regular" },
    fills: [solid("#000000")],
    ...partial,
  });
}

export function solid(hex: string, opts: Partial<PaintShape> = {}): PaintShape {
  return { type: "SOLID", color: hexToRgb(hex), ...opts };
}

/** Wire parent/children ids and return the flat list for makeContext. */
export function family(
  parent: NodeShape,
  ...children: NodeShape[]
): NodeShape[] {
  parent.childrenIds = children.map((c) => c.id);
  for (const child of children) child.parentId = parent.id;
  return [parent, ...children];
}

export function makeLookup(nodes: NodeShape[]): NodeLookup {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  return {
    getById: (id) => byId.get(id),
    getParent: (n) =>
      n.parentId === undefined ? undefined : byId.get(n.parentId),
    getChildren: (n) =>
      (n.childrenIds ?? []).flatMap((id) => {
        const child = byId.get(id);
        return child ? [child] : [];
      }),
  };
}

export function makeContext(
  nodes: NodeShape[] = [],
  nodePath: string[] = [],
): ScanContext {
  return { lookup: makeLookup(nodes), nodePath };
}
