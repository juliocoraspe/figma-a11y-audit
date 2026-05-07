/**
 * Abstract node shape consumed by all checks.
 *
 * Checks must NEVER import figma.* SceneNode types. They consume NodeShape,
 * which is the seam that lets the same audit engine run later as a CLI
 * against the Figma REST API JSON.
 *
 * The runner is responsible for adapting figma.* SceneNode -> NodeShape.
 */

export interface RGB {
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
}

export interface RGBA extends RGB {
  a: number; // 0..1
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PaintShape {
  type: "SOLID" | "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "IMAGE";
  color?: RGB;
  opacity?: number; // paint-level opacity (0..1)
  visible?: boolean;
}

export interface EffectShape {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
  color?: RGBA;
  spread?: number;
  visible?: boolean;
}

export interface FontNameShape {
  family: string;
  style: string;
}

/** Per-segment overrides surfaced when fills === MIXED on a TEXT node. */
export interface TextSegmentShape {
  start: number;
  end: number;
  characters: string;
  fills: PaintShape[];
  fontSize: number;
  fontName: FontNameShape;
}

export interface NodeShape {
  id: string;
  name: string;
  /** Mirrors figma.SceneNode["type"] (TEXT, FRAME, RECTANGLE, GROUP, etc.) */
  type: string;

  // Geometry
  absoluteBoundingBox?: BoundingBox;

  // Visual stack
  fills?: PaintShape[] | "MIXED";
  strokes?: PaintShape[];
  strokeWeight?: number | "MIXED";
  effects?: EffectShape[];
  /** Layer-level opacity (0..1). Applied on top of paint opacity. */
  opacity?: number;
  visible?: boolean;

  // Text-specific (TEXT nodes only)
  fontSize?: number | "MIXED";
  fontName?: FontNameShape | "MIXED";
  characters?: string;
  /** Populated by the runner when fills === MIXED, otherwise undefined. */
  textSegments?: TextSegmentShape[];

  // Tree
  parentId?: string;
  childrenIds?: string[];
}
