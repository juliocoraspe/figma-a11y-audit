import { describe, expect, it } from "vitest";
import type { EffectShape, NodeShape } from "@shared/types/NodeShape";
import { checkFocusVisibility } from "./06-focus-visibility";
import { family, makeContext, node, solid } from "../test-utils";

interface SetOptions {
  focus?: Partial<NodeShape>;
  baseline?: Partial<NodeShape>;
  name?: string;
}

/** A Default+Focus component set with the variant components in the lookup. */
function buildSet(opts: SetOptions = {}) {
  const baseline = node({
    type: "COMPONENT",
    name: "State=Default",
    ...opts.baseline,
  });
  const focus = node({
    type: "COMPONENT",
    name: "State=Focus",
    ...opts.focus,
  });
  const set = node({
    type: "COMPONENT_SET",
    name: opts.name ?? "Button",
    variants: [
      { id: baseline.id, rawName: "State=Default", properties: { State: "Default" } },
      { id: focus.id, rawName: "State=Focus", properties: { State: "Focus" } },
    ],
  });
  return { set, baseline, focus, nodes: [set, baseline, focus] };
}

function dropShadow(
  spread: number,
  color = { r: 0, g: 0, b: 0, a: 1 },
): EffectShape {
  return { type: "DROP_SHADOW", color, spread };
}

describe("checkFocusVisibility (06)", () => {
  it("passes a 2px high-contrast focus ring", () => {
    const { set, nodes } = buildSet({
      focus: { strokes: [solid("#000000")], strokeWeight: 2 },
    });
    expect(checkFocusVisibility(set, makeContext(nodes))).toEqual([]);
  });

  it("flags a 1px focus stroke as too thin (moderate)", () => {
    const { set, nodes } = buildSet({
      focus: { strokes: [solid("#000000")], strokeWeight: 1 },
    });
    const issues = checkFocusVisibility(set, makeContext(nodes));

    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.checkId).toBe("06-focus-visibility");
    expect(issue.severity).toBe("moderate");
    expect(issue.message).toContain("indicator is 1px thick (needs 2px)");
    expect(issue.details.thickness).toBe(1);
    expect(issue.details.indicatorContrast).toBeCloseTo(21, 5);
  });

  it("flags a low-contrast focus stroke (moderate)", () => {
    // #CCCCCC on the white page background is ~1.61:1, well under 3:1.
    const { set, nodes } = buildSet({
      focus: { strokes: [solid("#CCCCCC")], strokeWeight: 2 },
    });
    const issues = checkFocusVisibility(set, makeContext(nodes));

    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.severity).toBe("moderate");
    expect(issue.message).toContain("indicator contrast is 1.61:1");
    expect(issue.message).toContain("needs 3.0:1");
    expect(issue.details.indicatorContrast).toBeCloseTo(1.606, 2);
    expect(issue.details.thickness).toBe(2);
  });

  it("flags a thin AND low-contrast indicator as serious", () => {
    const { set, nodes } = buildSet({
      focus: { strokes: [solid("#CCCCCC")], strokeWeight: 1 },
    });
    const issues = checkFocusVisibility(set, makeContext(nodes));

    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("serious");
    expect(issues[0]!.message).toContain(" and ");
  });

  it("flags a focus variant with no visible difference as serious", () => {
    const { set, nodes } = buildSet(); // focus variant styled exactly like default
    const issues = checkFocusVisibility(set, makeContext(nodes));

    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.severity).toBe("serious");
    expect(issue.message).toContain("no visible difference vs default variant");
    expect(issue.details.thickness).toBeNull();
  });

  it("treats a stroke identical to the baseline as no visible difference", () => {
    const ring = { strokes: [solid("#000000")], strokeWeight: 2 };
    const { set, nodes } = buildSet({ focus: ring, baseline: ring });
    const issues = checkFocusVisibility(set, makeContext(nodes));

    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("no visible difference");
  });

  it("accepts a drop-shadow focus ring with enough spread and contrast", () => {
    const { set, nodes } = buildSet({ focus: { effects: [dropShadow(3)] } });
    expect(checkFocusVisibility(set, makeContext(nodes))).toEqual([]);
  });

  it("skips sets whose variants have no focus state (check 05 territory)", () => {
    const baseline = node({ type: "COMPONENT", name: "State=Default" });
    const hover = node({ type: "COMPONENT", name: "State=Hover" });
    const set = node({
      type: "COMPONENT_SET",
      name: "Button",
      variants: [
        { id: baseline.id, rawName: "State=Default", properties: { State: "Default" } },
        { id: hover.id, rawName: "State=Hover", properties: { State: "Hover" } },
      ],
    });
    const ctx = makeContext([set, baseline, hover]);
    expect(checkFocusVisibility(set, ctx)).toEqual([]);
  });

  it("skips when the surrounding background is non-uniform (precision-first)", () => {
    const { set, nodes } = buildSet({
      focus: { strokes: [solid("#000000")], strokeWeight: 1 },
    });
    const hero = node({ name: "Hero", fills: [{ type: "GRADIENT_LINEAR" }] });
    family(hero, set);
    expect(checkFocusVisibility(set, makeContext([...nodes, hero]))).toEqual([]);
  });

  it("ignores sets without interactive names", () => {
    const { set, nodes } = buildSet({
      name: "Card",
      focus: { strokes: [solid("#CCCCCC")], strokeWeight: 1 },
    });
    expect(checkFocusVisibility(set, makeContext(nodes))).toEqual([]);
  });
});
