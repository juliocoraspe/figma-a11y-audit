# Figma A11y Audit

A Figma plugin that audits design files against **WCAG 2.2 AA** and helps annotate what automated checks can't decide — tab order, alt text, language — with a local-first AI assist. Built as portfolio work: code quality and architectural clarity matter more than feature breadth.

> **Status:** v0.5 — six Tier-1 checks, canvas annotations, focus-state auto-fixes, and a working local Ollama integration.
>
> **Live demo:** [juliocoraspe.github.io/figma-a11y-audit](https://juliocoraspe.github.io/figma-a11y-audit/) — the real plugin UI running against a simulated Figma sandbox.

## What it does

### Audit — six Tier-1 checks

| # | Check | WCAG | Notes |
|---|---|---|---|
| 01 | Text contrast | 1.4.3 AA | Per-segment ratios, alpha blending, large-text thresholds, non-uniform-background warnings. One-click recolor fix (hue-preserving). |
| 02 | Non-text contrast | 1.4.11 AA | Borders, icons, UI elements vs. their effective background. |
| 03 | Tap target size | 2.5.8 AA | 24px minimum; spacing measured against neighboring *interactive* targets only. 24–44px size-only findings are AAA advisories (minor). |
| 04 | Text size | 1.4.4 | 12px recommended minimum, 10px hard floor, caption/legal/footnote exceptions. |
| 05 | Focus state defined | 2.4.7 AA | Flags interactive component sets shipping Default/Hover/Pressed/Disabled but no Focus variant. **Auto-fix:** clones the Default variant into a styled `State=Focus` variant inside the set. |
| 06 | Focus visibility | 2.4.11 | Validates indicator thickness (≥2px) and contrast (≥3:1) against the surface. **Auto-fix:** applies a 3px `#2563EB` focus ring. |

Results are numbered pills painted on the canvas (color = severity), matching the row numbers in the plugin's list. Interactivity detection uses prototype reactions first, naming heuristics second.

### Propose → approve → apply → verify

The audit is proactive, not just diagnostic:

- **Proposed changes** — after a scan, every fix the plugin can compute (contrast recolors with the exact target hex, missing focus variants, weak indicators) is batched into one reviewable proposal. Approve once: applied transactionally (a single undo step reverts everything), then the page is **re-audited automatically** to verify the fixes actually resolved the criteria.
- **Component grouping** — identical findings across N instances of the same component collapse into one row (×N badge); fixing or dismissing the row fans out to every instance. 118 raw findings become a short list of root causes.
- **Persistent dismissals** — dismissed findings are remembered in the file (page plugin data), so re-scans never nag about decisions already made. One-click restore.

### Annotate — what automation can't decide

- **Tab order** — detects interactive elements (whole page or selected frame), lets you assign keyboard focus sequence by clicking, and paints it on canvas: purple numbered squares plus a dashed line tracing the path 1 → N.
- **Alt text** — exports images from your selection or the entire page, generates description suggestions with a **local vision model** (Ollama + llama3.2-vision — images never leave your machine), and on approval assigns the text as plugin data on the node (persisted in the .fig file) with a green ALT chip on canvas. Decorative images get a gray DECO chip.
- **Language** — declare the content language per frame for screen readers.

A **? Legend** tab inside the plugin explains every annotation family and the Ollama setup.

## Architecture in one paragraph

Figma plugins run in two isolated JS contexts: a **sandbox** (main thread, has `figma.*`) and a **UI iframe** (DOM, React, network). They communicate only via `postMessage`. This plugin enforces a strict separation: `src/sandbox/` is the only place that touches `figma.*`; `src/ui/` is React; `src/shared/` is pure code (types, constants, WCAG mapping). The audit checks themselves are pure functions that consume an abstract `NodeShape` rather than `SceneNode`, so the same engine can run later as a CLI against the Figma REST API (scaffold in `src/cli/`).

## Folder structure

```
src/
├── sandbox/        # main-thread (figma.* allowed only here)
│   ├── main.ts
│   ├── detect/
│   │   ├── primitives/    color, background, interactivity — pure helpers
│   │   ├── checks/        WCAG checks — pure NodeShape -> Issue
│   │   └── runner.ts      tree walk + figmaNode -> NodeShape adapter
│   ├── overlay/manager.ts canvas annotations (issues, tab order, alt text)
│   └── bridge/handlers.ts message router + auto-fixes
├── ui/             # iframe (React, no figma.*)
│   ├── App.tsx
│   ├── views/      results list, detail drawer, annotate modes
│   ├── components/ settings drawer, legend, etc.
│   ├── services/   bridge.ts (postMessage), ollama.ts (local AI client)
│   └── styles/
├── shared/         # pure code, both sides import
│   ├── types/      Issue, Message, NodeShape
│   └── wcag/       criteria mapping, contrast-fix math
└── cli/            # future: same checks against the Figma REST API
site/               # GitHub Pages landing + live demo (mock sandbox)
.github/workflows/  # Pages deploy on every push to main
```

## Develop

```bash
npm install
npm run dev      # watches and rebuilds dist/
npm run build    # one-shot production build (typecheck + ui + sandbox)
```

Output: `dist/manifest.json`, `dist/ui.html`, `dist/sandbox.js`.

## Load in Figma

1. Open Figma desktop.
2. `Plugins → Development → Import plugin from manifest…`
3. Select **`dist/manifest.json`** (the one in `dist/`, not the repo root — the manifest points at the built files next to it).
4. Run via `Plugins → Development → Figma A11y Audit`.

## AI alt text — local Ollama setup (optional)

Everything except AI alt text works with no setup. For AI suggestions, the plugin talks to [Ollama](https://ollama.com) on `http://localhost:11434` using `llama3.2-vision` (~8GB download, ~8GB free RAM). One-time setup:

```bash
brew install ollama                 # or the desktop app
OLLAMA_ORIGINS="*" ollama serve     # plugin iframes have a "null" origin
ollama pull llama3.2-vision
```

> **macOS menu-bar app:** the app ignores shell variables. Set the origin policy via launchd instead, then restart the app:
>
> ```bash
> launchctl setenv OLLAMA_ORIGINS '*'
> ```
>
> (To persist across reboots, put that command in a login LaunchAgent.)

Check the connection in the plugin under Settings (⚙). The first generation loads the model into RAM (~30s); subsequent ones take seconds. No data leaves your machine.

See [TESTING.md](./TESTING.md) for the validation fixture and smoke-test checklist.

## License

MIT
