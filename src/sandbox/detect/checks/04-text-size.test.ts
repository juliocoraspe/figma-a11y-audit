import { describe, expect, it } from "vitest";
import { checkTextSize } from "./04-text-size";
import { makeContext, node, solid, textNode } from "../test-utils";

describe("checkTextSize (04)", () => {
  it("passes 12px text", () => {
    const text = textNode({ fontSize: 12 });
    expect(checkTextSize(text, makeContext([text]))).toEqual([]);
  });

  it("flags 11px as minor (below the recommended minimum)", () => {
    const text = textNode({ fontSize: 11 });
    const issues = checkTextSize(text, makeContext([text]));

    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.checkId).toBe("04-text-size");
    expect(issue.severity).toBe("minor");
    expect(issue.message).toContain("below 12px recommended minimum");
    expect(issue.details.exceptionApplies).toBe(false);
  });

  it("flags 9px as serious (under the 10px hard floor)", () => {
    const text = textNode({ fontSize: 9 });
    const issues = checkTextSize(text, makeContext([text]));

    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("serious");
    expect(issues[0]!.details.fontSize).toBe(9);
  });

  describe("exception naming", () => {
    it("allows 10px when the node is named like a caption", () => {
      const text = textNode({ name: "Caption / small", fontSize: 10 });
      expect(checkTextSize(text, makeContext([text]))).toEqual([]);
    });

    it("still flags sub-floor caption text as serious with the hard-floor message", () => {
      const text = textNode({ name: "Caption", fontSize: 9 });
      const issues = checkTextSize(text, makeContext([text]));

      expect(issues).toHaveLength(1);
      const issue = issues[0]!;
      expect(issue.severity).toBe("serious");
      expect(issue.message).toContain("below 10px hard floor");
      expect(issue.details.exceptionApplies).toBe(true);
    });

    it("applies exceptions from ancestor names in the breadcrumb", () => {
      const text = textNode({ name: "Body", fontSize: 10 });
      const ctx = makeContext([text], ["Card", "Legal disclaimer"]);
      expect(checkTextSize(text, ctx)).toEqual([]);
    });
  });

  describe("MIXED segments", () => {
    it("evaluates each segment and ids the failing one", () => {
      const text = node({
        type: "TEXT",
        characters: "Fine tiny",
        fontSize: "MIXED",
        textSegments: [
          {
            start: 0,
            end: 5,
            characters: "Fine ",
            fills: [solid("#000000")],
            fontSize: 14,
            fontName: { family: "Inter", style: "Regular" },
          },
          {
            start: 5,
            end: 9,
            characters: "tiny",
            fills: [solid("#000000")],
            fontSize: 9,
            fontName: { family: "Inter", style: "Regular" },
          },
        ],
      });
      const issues = checkTextSize(text, makeContext([text]));

      expect(issues).toHaveLength(1);
      const issue = issues[0]!;
      expect(issue.id).toBe(`04-text-size::${text.id}::seg-5-9`);
      expect(issue.severity).toBe("serious");
      expect(issue.details.fontSize).toBe(9);
      expect(issue.details.characters).toBe("tiny");
    });

    it("returns nothing when MIXED sizes come without segments", () => {
      const text = node({ type: "TEXT", fontSize: "MIXED" });
      expect(checkTextSize(text, makeContext([text]))).toEqual([]);
    });
  });

  it("ignores non-TEXT nodes", () => {
    const rect = node({ type: "RECTANGLE" });
    expect(checkTextSize(rect, makeContext([rect]))).toEqual([]);
  });
});
