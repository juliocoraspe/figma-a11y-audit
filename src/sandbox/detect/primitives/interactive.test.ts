import { describe, expect, it } from "vitest";
import {
  isInteractive,
  looksInteractive,
  looksLikeIcon,
  looksLikeInputOrContainer,
} from "./interactive";
import { node } from "../test-utils";

describe("isInteractive", () => {
  it("treats prototype reactions as the strongest signal", () => {
    const hotspot = node({ name: "Rounded rectangle", hasReactions: true });
    expect(isInteractive(hotspot)).toBe(true);
  });

  it("matches interactive name tokens with word-ish boundaries", () => {
    for (const name of [
      "Button",
      "Primary Button",
      "btn-primary",
      "CTA banner",
      "Tab Bar",
      "tab-2",
      "checkbox row",
      "menu-item",
      "nav/link",
    ]) {
      expect(isInteractive(node({ name })), name).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isInteractive(node({ name: "BUTTON / PRIMARY" }))).toBe(true);
  });

  it("does not match tokens embedded in longer words ('tab' vs 'table')", () => {
    for (const name of [
      "table",
      "Data Table",
      "Stable layout",
      "LinkedIn profile",
      "Buttoned shirt",
    ]) {
      expect(isInteractive(node({ name })), name).toBe(false);
    }
  });

  it("falls back to ancestor names in the breadcrumb", () => {
    const icon = node({ name: "Icon" });
    expect(isInteractive(icon, ["Page", "Button"])).toBe(true);
    expect(isInteractive(icon, ["Page", "Card"])).toBe(false);
  });

  it("treats interactive-named components as targets", () => {
    expect(isInteractive(node({ type: "COMPONENT", name: "Checkbox" }))).toBe(
      true,
    );
  });
});

describe("looksInteractive", () => {
  it("checks only the given name, with the same boundary rules", () => {
    expect(looksInteractive("Button")).toBe(true);
    expect(looksInteractive("table")).toBe(false);
    expect(looksInteractive("Card")).toBe(false);
  });
});

describe("looksLikeIcon", () => {
  it("requires an icon token in the name", () => {
    expect(looksLikeIcon("icon/star")).toBe(true);
    expect(looksLikeIcon("ic_home")).toBe(true);
    expect(looksLikeIcon("Star")).toBe(false);
  });
});

describe("looksLikeInputOrContainer", () => {
  it("matches input tokens and falls back to interactive tokens", () => {
    expect(looksLikeInputOrContainer("Search field")).toBe(true);
    expect(looksLikeInputOrContainer("textfield")).toBe(true);
    expect(looksLikeInputOrContainer("Button")).toBe(true);
    expect(looksLikeInputOrContainer("Decorative blob")).toBe(false);
  });
});
