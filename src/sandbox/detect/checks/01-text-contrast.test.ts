import { describe, expect, it } from "vitest";
import type { TextSegmentShape } from "@shared/types/NodeShape";
import { checkTextContrast } from "./01-text-contrast";
import { family, makeContext, node, solid, textNode } from "../test-utils";

function seg(
  start: number,
  end: number,
  characters: string,
  hex: string,
  fontSize = 16,
  style = "Regular",
): TextSegmentShape {
  return {
    start,
    end,
    characters,
    fills: [solid(hex)],
    fontSize,
    fontName: { family: "Inter", style },
  };
}

describe("checkTextContrast (01)", () => {
  describe("solid backgrounds", () => {
    it("passes black text on the default white page background", () => {
      const text = textNode();
      expect(checkTextContrast(text, makeContext([text]))).toEqual([]);
    });

    it("flags #999999 on white as critical (ratio ~2.85 vs 4.5)", () => {
      const text = textNode({ fills: [solid("#999999")] });
      const issues = checkTextContrast(text, makeContext([text], ["Page"]));

      expect(issues).toHaveLength(1);
      const issue = issues[0]!;
      expect(issue.id).toBe(`01-text-contrast::${text.id}`);
      expect(issue.checkId).toBe("01-text-contrast");
      expect(issue.severity).toBe("critical");
      expect(issue.wcagCriterion).toBe("1.4.3");
      expect(issue.nodePath).toEqual(["Page"]);
      expect(issue.details.ratio).toBeCloseTo(2.85, 2);
      expect(issue.details.threshold).toBe(4.5);
      expect(issue.message).toContain("normal text");
    });

    it("flags #808080 on white as serious (ratio ~3.95)", () => {
      const text = textNode({ fills: [solid("#808080")] });
      const issues = checkTextContrast(text, makeContext([text]));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.severity).toBe("serious");
      expect(issues[0]!.details.ratio).toBeCloseTo(3.95, 2);
    });

    it("composites the parent fill: black on a black frame is critical", () => {
      const parent = node({ fills: [solid("#000000")] });
      const text = textNode();
      const nodes = family(parent, text);
      const issues = checkTextContrast(text, makeContext(nodes));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.severity).toBe("critical");
      expect(issues[0]!.details.ratio).toBeCloseTo(1, 5);
      expect(issues[0]!.details.backgroundColor).toBe("#000000");
    });
  });

  describe("large-text threshold", () => {
    it("passes #808080 at 24px regular (3.0:1 applies)", () => {
      const text = textNode({ fills: [solid("#808080")], fontSize: 24 });
      expect(checkTextContrast(text, makeContext([text]))).toEqual([]);
    });

    it("still fails #808080 at 23px regular (4.5:1 applies)", () => {
      const text = textNode({ fills: [solid("#808080")], fontSize: 23 });
      const issues = checkTextContrast(text, makeContext([text]));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.details.isLarge).toBe(false);
      expect(issues[0]!.details.threshold).toBe(4.5);
    });

    it("passes #808080 at 19px bold (bold large-text cutoff is 18.66px)", () => {
      const text = textNode({
        fills: [solid("#808080")],
        fontSize: 19,
        fontName: { family: "Inter", style: "Bold" },
      });
      expect(checkTextContrast(text, makeContext([text]))).toEqual([]);
    });

    it("flags #AAAAAA at 24px as serious against the 3.0 threshold", () => {
      const text = textNode({ fills: [solid("#AAAAAA")], fontSize: 24 });
      const issues = checkTextContrast(text, makeContext([text]));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.severity).toBe("serious");
      expect(issues[0]!.details.isLarge).toBe(true);
      expect(issues[0]!.details.threshold).toBe(3);
      expect(issues[0]!.details.ratio).toBeCloseTo(2.32, 2);
      expect(issues[0]!.message).toContain("large text");
    });
  });

  describe("MIXED segments", () => {
    it("emits one issue per failing segment with a segment-scoped id", () => {
      const text = node({
        type: "TEXT",
        name: "Rich text",
        characters: "Hello world",
        fills: "MIXED",
        fontSize: "MIXED",
        fontName: "MIXED",
        textSegments: [
          seg(0, 5, "Hello", "#000000"),
          seg(5, 11, " world", "#999999"),
        ],
      });
      const issues = checkTextContrast(text, makeContext([text]));

      expect(issues).toHaveLength(1);
      const issue = issues[0]!;
      expect(issue.id).toBe(`01-text-contrast::${text.id}::seg-5-11`);
      expect(issue.details.segmentStart).toBe(5);
      expect(issue.details.segmentEnd).toBe(11);
      expect(issue.details.characters).toBe(" world");
    });

    it("returns nothing when MIXED fills come without segments", () => {
      const text = node({
        type: "TEXT",
        characters: "Hello",
        fills: "MIXED",
        fontSize: "MIXED",
        fontName: "MIXED",
      });
      expect(checkTextContrast(text, makeContext([text]))).toEqual([]);
    });
  });

  describe("non-uniform backgrounds", () => {
    it("warns (moderate) for text over a gradient ancestor", () => {
      const hero = node({ name: "Hero", fills: [{ type: "GRADIENT_LINEAR" }] });
      const text = textNode();
      const nodes = family(hero, text);
      const issues = checkTextContrast(text, makeContext(nodes));

      expect(issues).toHaveLength(1);
      const issue = issues[0]!;
      expect(issue.severity).toBe("moderate");
      expect(issue.message).toBe(
        "Text over gradient — verify contrast manually",
      );
      expect(issue.details.ratio).toBeNull();
      expect(issue.details.backgroundColor).toBeNull();
      expect(issue.details.backgroundKind).toBe("gradient");
    });

    it("warns for text over an image ancestor", () => {
      const hero = node({ name: "Hero", fills: [{ type: "IMAGE" }] });
      const text = textNode();
      const nodes = family(hero, text);
      const issues = checkTextContrast(text, makeContext(nodes));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.message).toContain("image");
      expect(issues[0]!.details.backgroundKind).toBe("image");
    });
  });

  describe("guards", () => {
    it("ignores non-TEXT nodes", () => {
      const rect = node({ type: "RECTANGLE", fills: [solid("#999999")] });
      expect(checkTextContrast(rect, makeContext([rect]))).toEqual([]);
    });

    it("ignores invisible text", () => {
      const text = textNode({ visible: false, fills: [solid("#999999")] });
      expect(checkTextContrast(text, makeContext([text]))).toEqual([]);
    });
  });
});
