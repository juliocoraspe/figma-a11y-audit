#!/usr/bin/env node
/**
 * CLI entry point: a11y-figma-audit
 *
 * Usage:
 *   FIGMA_TOKEN=... npx a11y-figma-audit <fileId>
 *   FIGMA_TOKEN=... npx a11y-figma-audit <fileId> --output ./report.html
 *   FIGMA_TOKEN=... npx a11y-figma-audit <fileId> --json
 */

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { FigmaClient } from "./figma-api.js";
import { runAuditOnTree } from "./runner.js";
import { HtmlReporter } from "./reporter.js";

const program = new Command();

program
  .name("a11y-figma-audit")
  .description("Accessibility audit for Figma design files (WCAG 2.1 AA, 6 checks)")
  .version("1.0.0")
  .argument("<fileId>", "Figma file ID (from the URL: figma.com/file/<fileId>/...)")
  .option("-t, --token <token>", "Figma personal access token (or set FIGMA_TOKEN env var)")
  .option("-o, --output <path>", "Save report to file (default: ./a11y-report-<fileId>.html)")
  .option("--json", "Output issues as JSON instead of HTML")
  .addHelpText(
    "after",
    `
Examples:
  $ FIGMA_TOKEN=figi_xxx a11y-figma-audit f1a2b3c4d5e6f7g8h9i0
  $ FIGMA_TOKEN=figi_xxx a11y-figma-audit f1a2b3c4d5e6f7g8h9i0 --output ./reports/audit.html
  $ FIGMA_TOKEN=figi_xxx a11y-figma-audit f1a2b3c4d5e6f7g8h9i0 --json

Getting a Figma token:
  Figma → Settings → Developer → Personal access tokens → Create new token (scope: file:read)
`,
  )
  .action(async (fileId: string, options: { token?: string; output?: string; json?: boolean }) => {
    const token = options.token ?? process.env.FIGMA_TOKEN;

    if (!token) {
      console.error(
        "\x1b[31m✗ FIGMA_TOKEN not provided.\x1b[0m\n" +
        "  Set it as an environment variable:  export FIGMA_TOKEN=figi_...\n" +
        "  Or pass it directly:                --token figi_...\n\n" +
        "  Get a token at: Figma → Settings → Developer → Personal access tokens",
      );
      process.exit(1);
    }

    try {
      const client = new FigmaClient(token);

      process.stderr.write(`\x1b[36m◆ Fetching file ${fileId}...\x1b[0m\n`);
      const file = await client.getFile(fileId);
      process.stderr.write(`\x1b[32m✓ "${file.name}"\x1b[0m\n`);

      process.stderr.write(`\x1b[36m◆ Running 6 accessibility checks...\x1b[0m\n`);
      const result = runAuditOnTree(file.document);

      const { issues, totalNodes, durationMs } = result;
      const critical = issues.filter((i) => i.severity === "critical").length;
      const serious  = issues.filter((i) => i.severity === "serious").length;
      const moderate = issues.filter((i) => i.severity === "moderate").length;
      const minor    = issues.filter((i) => i.severity === "minor").length;

      if (issues.length === 0) {
        process.stderr.write(
          `\x1b[32m✓ No issues found! (${totalNodes} nodes, ${durationMs}ms)\x1b[0m\n`,
        );
      } else {
        process.stderr.write(
          `\x1b[33m⚠ Found ${issues.length} issue${issues.length !== 1 ? "s" : ""}: ` +
          `${critical} critical, ${serious} serious, ${moderate} moderate, ${minor} minor ` +
          `(${totalNodes} nodes, ${durationMs}ms)\x1b[0m\n`,
        );
      }

      if (options.json) {
        const output = JSON.stringify(
          {
            file: { id: fileId, name: file.name, version: file.version },
            stats: { total: issues.length, critical, serious, moderate, minor, totalNodes, durationMs },
            issues: issues.map((i) => ({ ...i })),
          },
          null,
          2,
        );

        if (options.output) {
          fs.writeFileSync(options.output, output, "utf8");
          process.stderr.write(`\x1b[32m✓ JSON saved: ${options.output}\x1b[0m\n`);
        } else {
          process.stdout.write(output + "\n");
        }
      } else {
        const reporter = new HtmlReporter();
        const html = reporter.generate(
          { id: fileId, name: file.name, version: file.version, lastModified: file.lastModified },
          issues,
          totalNodes,
          durationMs,
        );

        const outputPath =
          options.output ?? `./a11y-report-${fileId}.html`;

        fs.writeFileSync(outputPath, html, "utf8");
        const absPath = path.resolve(outputPath);
        process.stderr.write(
          `\x1b[32m✓ Report saved: ${outputPath}\x1b[0m\n` +
          `\n  Open: file://${absPath}\n`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\x1b[31m✗ ${msg}\x1b[0m\n`);
      process.exit(1);
    }
  });

program.parse();
