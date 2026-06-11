import { describe, expect, it } from "vitest";
import type { BoundingBox, NodeShape } from "@shared/types/NodeShape";
import { checkTapTarget } from "./03-tap-target";
import { family, makeContext, node } from "../test-utils";

function box(width: number, height: number, x = 0, y = 0): BoundingBox {
  return { x, y, width, height };
}

function button(partial: Partial<NodeShape> = {}): NodeShape {
  return node({ name: "Button", absoluteBoundingBox: box(32, 32), ...partial });
}

/** Two same-size targets in a row, separated horizontally by `gapX`. */
function pair(gapX: number, size = 32) {
  const a = button({ absoluteBoundingBox: box(size, size, 0, 0) });
  const b = button({
    name: "Button 2",
    absoluteBoundingBox: box(size, size, size + gapX, 0),
  });
  const nodes = family(node({ name: "Toolbar" }), a, b);
  return { a, nodes };
}

describe("checkTapTarget (03)", () => {
  describe("severity tiers by size", () => {
    it("flags a 12×12 target as critical", () => {
      const btn = button({ absoluteBoundingBox: box(12, 12) });
      const issues = checkTapTarget(btn, makeContext([btn]));

      expect(issues).toHaveLength(1);
      const issue = issues[0]!;
      expect(issue.checkId).toBe("03-tap-target");
      expect(issue.severity).toBe("critical");
      expect(issue.message).toContain("needs 24px minimum");
      expect(issue.details.minDimension).toBe(12);
    });

    it("flags a 20×20 target as serious", () => {
      const btn = button({ absoluteBoundingBox: box(20, 20) });
      const issues = checkTapTarget(btn, makeContext([btn]));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.severity).toBe("serious");
    });

    it("flags a lone 32×32 target as minor (AAA advisory)", () => {
      const btn = button({ absoluteBoundingBox: box(32, 32) });
      const issues = checkTapTarget(btn, makeContext([btn]));

      expect(issues).toHaveLength(1);
      const issue = issues[0]!;
      expect(issue.severity).toBe("minor");
      expect(issue.message).toContain("44px (AAA)");
      expect(issue.message).toContain("no neighbors");
      expect(issue.details.spacing).toBeNull();
    });

    it("emits nothing for a 44×44 target", () => {
      const btn = button({ absoluteBoundingBox: box(44, 44) });
      expect(checkTapTarget(btn, makeContext([btn]))).toEqual([]);
    });

    it("uses the smaller dimension (200×20 is serious)", () => {
      const btn = button({ absoluteBoundingBox: box(200, 20) });
      const issues = checkTapTarget(btn, makeContext([btn]));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.severity).toBe("serious");
      expect(issues[0]!.details.minDimension).toBe(20);
    });
  });

  describe("crowding from interactive siblings", () => {
    it("escalates a 24–44px target to moderate when a sibling target is closer than 24px", () => {
      const { a, nodes } = pair(8);
      const issues = checkTapTarget(a, makeContext(nodes));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.severity).toBe("moderate");
      expect(issues[0]!.details.spacing).toBe(8);
    });

    it("keeps minor when the nearest sibling target is 24px+ away", () => {
      const { a, nodes } = pair(28);
      const issues = checkTapTarget(a, makeContext(nodes));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.severity).toBe("minor");
      expect(issues[0]!.details.spacing).toBe(28);
    });

    it("leaves sub-16px targets critical regardless of crowding", () => {
      const { a, nodes } = pair(4, 12);
      const issues = checkTapTarget(a, makeContext(nodes));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.severity).toBe("critical");
    });

    it("leaves 16–24px targets serious regardless of crowding", () => {
      const { a, nodes } = pair(4, 20);
      const issues = checkTapTarget(a, makeContext(nodes));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.severity).toBe("serious");
    });

    it("ignores non-interactive siblings when measuring spacing", () => {
      const btn = button({ absoluteBoundingBox: box(32, 32, 0, 0) });
      const divider = node({
        name: "Divider",
        absoluteBoundingBox: box(2, 32, 36, 0),
      });
      const nodes = family(node({ name: "Toolbar" }), btn, divider);
      const issues = checkTapTarget(btn, makeContext(nodes));

      expect(issues).toHaveLength(1);
      // The 4px-away divider doesn't compete for the finger: stays minor.
      expect(issues[0]!.severity).toBe("minor");
      expect(issues[0]!.details.spacing).toBeNull();
    });
  });

  describe("target classification", () => {
    it("audits nodes with prototype reactions even without an interactive name", () => {
      const hotspot = node({
        name: "Rounded rectangle",
        hasReactions: true,
        absoluteBoundingBox: box(12, 12),
      });
      const issues = checkTapTarget(hotspot, makeContext([hotspot]));

      expect(issues).toHaveLength(1);
      expect(issues[0]!.severity).toBe("critical");
    });

    it("skips nodes that are only interactive via an ancestor name", () => {
      const icon = node({ name: "Icon", absoluteBoundingBox: box(12, 12) });
      const issues = checkTapTarget(icon, makeContext([icon], ["Page", "Button"]));
      expect(issues).toEqual([]);
    });

    it("skips non-interactive nodes", () => {
      const blob = node({
        name: "Decoration",
        absoluteBoundingBox: box(12, 12),
      });
      expect(checkTapTarget(blob, makeContext([blob]))).toEqual([]);
    });

    it("skips invisible nodes", () => {
      const btn = button({ visible: false, absoluteBoundingBox: box(12, 12) });
      expect(checkTapTarget(btn, makeContext([btn]))).toEqual([]);
    });

    it("skips nodes without a bounding box", () => {
      const btn = node({ name: "Button" });
      expect(checkTapTarget(btn, makeContext([btn]))).toEqual([]);
    });
  });
});
