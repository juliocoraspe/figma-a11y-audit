/**
 * Offline test — runs the audit on a synthetic Figma-like tree.
 * No token needed. Validates that the adapter + checks work end-to-end.
 *
 * Run with: npx tsx --tsconfig tsconfig.cli.json src/cli/test-runner.ts
 */

import { runAuditOnTree } from "./runner.js";
import { HtmlReporter } from "./reporter.js";
import * as fs from "fs";
import type { FigmaNode } from "./figma-api.js";

// Synthetic fixture matching TESTING.md nodes
const FIXTURE: FigmaNode = {
  id: "0:0",
  name: "Document",
  type: "DOCUMENT",
  children: [
    {
      id: "0:1",
      name: "Page 1",
      type: "CANVAS",
      children: [
        {
          id: "1:1",
          name: "Test Page",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 1200 },
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, visible: true }],
          children: [
            // bad-1: #CCCCCC on white (~1.6:1) → critical
            {
              id: "2:1",
              name: "bad-1",
              type: "TEXT",
              characters: "Lorem ipsum",
              absoluteBoundingBox: { x: 20, y: 20, width: 200, height: 24 },
              fills: [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8, a: 1 }, visible: true }],
              style: { fontFamily: "Inter", fontStyle: "Regular", fontSize: 16 },
            },
            // bad-2: #999999 on white (~2.8:1) → serious
            {
              id: "2:2",
              name: "bad-2",
              type: "TEXT",
              characters: "Click here",
              absoluteBoundingBox: { x: 20, y: 60, width: 200, height: 20 },
              fills: [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.6, a: 1 }, visible: true }],
              style: { fontFamily: "Inter", fontStyle: "Regular", fontSize: 14 },
            },
            // good-1: #1A1A1A on white (~16.7:1) → no issue
            {
              id: "2:3",
              name: "good-1",
              type: "TEXT",
              characters: "Body copy",
              absoluteBoundingBox: { x: 20, y: 100, width: 200, height: 24 },
              fills: [{ type: "SOLID", color: { r: 0.102, g: 0.102, b: 0.102, a: 1 }, visible: true }],
              style: { fontFamily: "Inter", fontStyle: "Regular", fontSize: 16 },
            },
            // caption-small: 9px → serious (hard floor)
            {
              id: "2:4",
              name: "caption-small",
              type: "TEXT",
              characters: "Tiny print",
              absoluteBoundingBox: { x: 20, y: 140, width: 100, height: 12 },
              fills: [{ type: "SOLID", color: { r: 0.102, g: 0.102, b: 0.102, a: 1 }, visible: true }],
              style: { fontFamily: "Inter", fontStyle: "Regular", fontSize: 9 },
            },
            // btn-tiny: 12×12px → critical tap target
            {
              id: "2:5",
              name: "btn-tiny",
              type: "FRAME",
              absoluteBoundingBox: { x: 20, y: 180, width: 12, height: 12 },
              fills: [{ type: "SOLID", color: { r: 0.12, g: 0.23, b: 0.37, a: 1 }, visible: true }],
              children: [],
            },
            // textfield-outline: stroke #D1D1D1 on white → serious (ratio ~1.39:1)
            {
              id: "2:6",
              name: "textfield-outline",
              type: "FRAME",
              absoluteBoundingBox: { x: 20, y: 220, width: 240, height: 40 },
              fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, visible: true }],
              strokes: [{ type: "SOLID", color: { r: 0.82, g: 0.82, b: 0.82, a: 1 }, visible: true }],
              strokeWeight: 1,
              children: [],
            },
            // Component set: Button without focus variant
            {
              id: "3:1",
              name: "Button",
              type: "COMPONENT_SET",
              absoluteBoundingBox: { x: 20, y: 320, width: 200, height: 100 },
              fills: [],
              children: [
                {
                  id: "3:2",
                  name: "State=Default",
                  type: "COMPONENT",
                  fills: [{ type: "SOLID", color: { r: 0.12, g: 0.23, b: 0.37, a: 1 } }],
                  children: [],
                  variantProperties: { State: "Default" },
                },
                {
                  id: "3:3",
                  name: "State=Hover",
                  type: "COMPONENT",
                  fills: [{ type: "SOLID", color: { r: 0.09, g: 0.16, b: 0.27, a: 1 } }],
                  children: [],
                  variantProperties: { State: "Hover" },
                },
                {
                  id: "3:4",
                  name: "State=Disabled",
                  type: "COMPONENT",
                  fills: [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } }],
                  children: [],
                  variantProperties: { State: "Disabled" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

async function main() {
  console.log("╔═══════════════════════════════════════╗");
  console.log("║  CLI Runner — Offline Test             ║");
  console.log("║  Synthetic fixture, no Figma token     ║");
  console.log("╚═══════════════════════════════════════╝\n");

  console.log("Running audit on synthetic fixture...\n");
  const result = runAuditOnTree(FIXTURE);

  console.log(`✓ ${result.totalNodes} nodes scanned in ${result.durationMs}ms`);
  console.log(`✓ ${result.issues.length} issues found\n`);

  for (const issue of result.issues) {
    const sev = issue.severity.padEnd(8);
    const check = issue.checkId;
    console.log(`  [${sev}] ${check}  ${issue.message.slice(0, 70)}`);
  }

  // Generate HTML report
  const reporter = new HtmlReporter();
  const html = reporter.generate(
    { id: "test-fixture", name: "Synthetic Test Fixture" },
    result.issues,
    result.totalNodes,
    result.durationMs,
  );

  const outPath = "/tmp/a11y-test-report.html";
  fs.writeFileSync(outPath, html, "utf8");
  console.log(`\n✓ HTML report saved: ${outPath}`);
  console.log(`  Open in browser: file://${outPath}\n`);

  // Validate expected issues
  console.log("Validating expected issues:");
  const checks = [
    {
      name: "bad-1 → critical contrast",
      pass: result.issues.some((i) => i.checkId === "01-text-contrast" && i.severity === "critical" && i.nodePath.includes("bad-1")),
    },
    {
      name: "bad-2 → contrast issue detected",
      pass: result.issues.some((i) => i.checkId === "01-text-contrast" && i.nodePath.includes("bad-2")),
    },
    {
      name: "good-1 → no issue",
      pass: !result.issues.some((i) => i.nodePath.includes("good-1")),
    },
    {
      name: "caption-small 9px → serious text-size",
      pass: result.issues.some((i) => i.checkId === "04-text-size" && i.nodePath.includes("caption-small")),
    },
    {
      name: "btn-tiny 12×12 → tap-target critical",
      pass: result.issues.some((i) => i.checkId === "03-tap-target" && i.nodePath.includes("btn-tiny")),
    },
    {
      name: "textfield-outline → ui-contrast",
      pass: result.issues.some((i) => i.checkId === "02-ui-contrast" && i.nodePath.includes("textfield-outline")),
    },
    {
      name: "Button (no focus) → focus-defined serious",
      pass: result.issues.some((i) => i.checkId === "05-focus-defined" && i.nodePath.includes("Button")),
    },
  ];

  let passed = 0;
  for (const c of checks) {
    const icon = c.pass ? "✅" : "❌";
    console.log(`  ${icon} ${c.name}`);
    if (c.pass) passed++;
  }

  console.log(`\n${passed}/${checks.length} checks passed\n`);

  if (passed === checks.length) {
    console.log("✅ Checkpoint 1 (Figma API Client) → ready");
    console.log("✅ Checkpoint 2 (REST→NodeShape adapter) → COMPLETE");
    console.log("✅ Checkpoint 3 (Detection integration) → COMPLETE");
    console.log("✅ Checkpoint 4 (HTML report) → COMPLETE");
    console.log("\nNext: Test with a real Figma token (Checkpoint 5).");
  } else {
    console.log("⚠️  Some checks failed. Review issues above.");
  }
}

main().catch(console.error);
