import { describe, expect, it } from "vitest";
import type { NodeShape, VariantInfo } from "@shared/types/NodeShape";
import { checkFocusDefined } from "./05-focus-defined";
import { makeContext, node } from "../test-utils";

let variantId = 0;

function variant(
  properties: Record<string, string>,
  rawName?: string,
): VariantInfo {
  variantId += 1;
  return {
    id: `variant-${variantId}`,
    rawName:
      rawName ??
      Object.entries(properties)
        .map(([k, v]) => `${k}=${v}`)
        .join(", "),
    properties,
  };
}

function buttonSet(variants: VariantInfo[], name = "Button"): NodeShape {
  return node({ type: "COMPONENT_SET", name, variants });
}

describe("checkFocusDefined (05)", () => {
  it("flags an interactive component set with no focus variant", () => {
    const set = buttonSet([
      variant({ State: "Default" }),
      variant({ State: "Hover" }),
      variant({ State: "Pressed" }),
    ]);
    const issues = checkFocusDefined(set, makeContext([set]));

    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.checkId).toBe("05-focus-defined");
    expect(issue.severity).toBe("serious");
    expect(issue.message).toContain("Missing focus state variant");
    expect(issue.details.suggestedProperty).toBe("State");
    expect(issue.details.existingVariants).toBe("Default, Hover, Pressed");
  });

  it("passes when a Focus variant exists", () => {
    const set = buttonSet([
      variant({ State: "Default" }),
      variant({ State: "Focus" }),
    ]);
    expect(checkFocusDefined(set, makeContext([set]))).toEqual([]);
  });

  it("recognizes 'Focused' and 'focus-visible' property values", () => {
    const focused = buttonSet([
      variant({ State: "Default" }),
      variant({ State: "Focused" }),
    ]);
    expect(checkFocusDefined(focused, makeContext([focused]))).toEqual([]);

    const focusVisible = buttonSet([
      variant({ State: "Default" }),
      variant({ State: "focus-visible" }),
    ]);
    expect(checkFocusDefined(focusVisible, makeContext([focusVisible]))).toEqual([]);
  });

  it("falls back to the raw variant name when properties are empty", () => {
    const set = buttonSet([variant({}, "Default"), variant({}, "Focus")]);
    expect(checkFocusDefined(set, makeContext([set]))).toEqual([]);
  });

  it("suggests the property with the most distinct values when no state-like prop exists", () => {
    const set = buttonSet([
      variant({ Size: "Sm", Kind: "Primary" }),
      variant({ Size: "Md", Kind: "Primary" }),
      variant({ Size: "Lg", Kind: "Primary" }),
    ]);
    const issues = checkFocusDefined(set, makeContext([set]));

    expect(issues).toHaveLength(1);
    expect(issues[0]!.details.suggestedProperty).toBe("Size");
  });

  it("ignores component sets without interactive names", () => {
    const set = buttonSet([variant({ State: "Default" })], "Card");
    expect(checkFocusDefined(set, makeContext([set]))).toEqual([]);
  });

  it("ignores plain COMPONENT nodes", () => {
    const component = node({
      type: "COMPONENT",
      name: "Button",
      variants: [variant({ State: "Default" })],
    });
    expect(checkFocusDefined(component, makeContext([component]))).toEqual([]);
  });

  it("ignores sets with no variants", () => {
    const set = buttonSet([]);
    expect(checkFocusDefined(set, makeContext([set]))).toEqual([]);
  });
});
