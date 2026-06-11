/**
 * Figma REST API client.
 *
 * Fetches file structure from the Figma API using a Personal Access Token.
 * Returns the raw document tree which is then adapted to NodeShape by runner.ts.
 */

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
  visible: boolean;
  color?: FigmaColor;
  spread?: number;
  radius?: number;
}

export interface FigmaPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontPostScriptName?: string;
  fontStyle?: string;
  fontWeight?: number;
  fontSize?: number;
  textAlignHorizontal?: string;
  letterSpacing?: number;
  lineHeightPx?: number;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  opacity?: number;
  children?: FigmaNode[];
  // Geometry
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  // Paints
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  effects?: FigmaEffect[];
  // Text
  characters?: string;
  style?: FigmaTypeStyle;
  // Component sets
  componentSetId?: string;
  variantProperties?: Record<string, string>;
}

export interface FigmaFile {
  name: string;
  lastModified: string;
  version: string;
  document: FigmaNode;
  schemaVersion: number;
}

export class FigmaClient {
  private token: string;
  private baseUrl = "https://api.figma.com/v1";

  constructor(token: string) {
    this.token = token;
  }

  async getFile(fileId: string): Promise<FigmaFile> {
    const res = await fetch(`${this.baseUrl}/files/${fileId}`, {
      headers: { "X-FIGMA-TOKEN": this.token },
    });

    if (res.status === 401) {
      throw new Error(
        "Invalid Figma token. Get one at: Figma → Settings → Developer → Personal access tokens",
      );
    }
    if (res.status === 403) {
      throw new Error(
        `Access denied to file ${fileId}. Make sure the token has 'file:read' scope.`,
      );
    }
    if (res.status === 404) {
      throw new Error(
        `File ${fileId} not found. Check the file ID from the Figma URL.`,
      );
    }
    if (!res.ok) {
      throw new Error(`Figma API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<FigmaFile>;
  }
}
