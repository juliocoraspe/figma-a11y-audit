/**
 * The context object every check receives. Pure surface, no figma.*.
 *
 * The runner builds the lookup from its NodeShape map; checks navigate
 * the tree through the lookup, never via figma.* refs. This is the seam
 * the v1.0 CLI will reuse against REST API JSON.
 */

import type { NodeShape } from "@shared/types/NodeShape";

export interface NodeLookup {
  getById: (id: string) => NodeShape | undefined;
  getParent: (node: NodeShape) => NodeShape | undefined;
  getChildren: (node: NodeShape) => NodeShape[];
}

export interface ScanContext {
  lookup: NodeLookup;
  /** Breadcrumb of node names from page root to the current node. */
  nodePath: string[];
}
