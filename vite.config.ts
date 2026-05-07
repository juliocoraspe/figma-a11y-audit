import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "node:path";
import { copyFileSync, mkdirSync, renameSync, rmSync, existsSync } from "node:fs";

/**
 * Figma plugins need TWO build artifacts:
 *   - sandbox.js: bundled main-thread code (NO DOM, NO network)
 *   - ui.html:    a single-file iframe document (HTML + CSS + JS inlined)
 *
 * We run a single Vite config that switches its entry based on the
 * VITE_BUILD_TARGET env var. The `build` npm script runs both targets.
 *
 * For dev simplicity, we expose a small custom plugin that copies
 * manifest.json into dist/ at the end of the UI build.
 */
const target = process.env.VITE_BUILD_TARGET ?? "ui";

const baseAlias = {
  "@shared": resolve(__dirname, "src/shared"),
  "@sandbox": resolve(__dirname, "src/sandbox"),
  "@ui": resolve(__dirname, "src/ui"),
};

export default defineConfig(() => {
  if (target === "sandbox") {
    return {
      resolve: { alias: baseAlias },
      build: {
        outDir: "dist",
        emptyOutDir: false,
        target: "es2017",
        minify: false,
        rollupOptions: {
          input: resolve(__dirname, "src/sandbox/main.ts"),
          output: {
            entryFileNames: "sandbox.js",
            format: "iife",
            inlineDynamicImports: true,
          },
        },
      },
    };
  }

  // UI build (default)
  return {
    plugins: [
      react(),
      viteSingleFile(),
      {
        name: "copy-manifest-and-flatten-ui",
        closeBundle() {
          const distDir = resolve(__dirname, "dist");
          mkdirSync(distDir, { recursive: true });
          copyFileSync(
            resolve(__dirname, "manifest.json"),
            resolve(distDir, "manifest.json"),
          );
          // Vite emits the HTML at dist/src/ui/index.html when the input is a
          // nested file. Flatten it to dist/ui.html so manifest.ui matches.
          const nested = resolve(distDir, "src/ui/index.html");
          const flat = resolve(distDir, "ui.html");
          if (existsSync(nested)) {
            renameSync(nested, flat);
            rmSync(resolve(distDir, "src"), { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: { alias: baseAlias },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      target: "es2017",
      minify: false,
      rollupOptions: {
        input: resolve(__dirname, "src/ui/index.html"),
        output: { entryFileNames: "ui.js" },
      },
    },
  };
});
