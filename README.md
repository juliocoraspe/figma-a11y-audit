# Figma A11y Audit

A Figma plugin that audits design files against WCAG 2.1/2.2 AA. Built as portfolio work — code quality and architectural clarity matter more than feature breadth.

> **Status:** v0.1, Phase 1 — scaffolding + Text Contrast (WCAG 1.4.3) end-to-end.

## Architecture in one paragraph

Figma plugins run in two isolated JS contexts: a **sandbox** (main thread, has `figma.*`) and a **UI iframe** (DOM, React, network). They communicate only via `postMessage`. This plugin enforces a strict separation: `src/sandbox/` is the only place that touches `figma.*`; `src/ui/` is React; `src/shared/` is pure code (types, constants, WCAG mapping). The audit checks themselves are pure functions that consume an abstract `NodeShape` rather than `SceneNode`, so the same engine will run later as a CLI against the Figma REST API.

## Folder structure

```
src/
├── sandbox/        # main-thread (figma.* allowed only here)
│   ├── main.ts
│   ├── detect/
│   │   ├── primitives/    color, background — pure helpers
│   │   ├── checks/        WCAG checks — pure NodeShape -> Issue
│   │   └── runner.ts      tree walk + figmaNode -> NodeShape adapter
│   ├── overlay/manager.ts diagnostic dots
│   └── bridge/handlers.ts message router
├── ui/             # iframe (React, no figma.*)
│   ├── main.tsx
│   ├── App.tsx
│   ├── views/
│   ├── components/
│   ├── services/bridge.ts
│   └── styles/tokens.css
└── shared/         # pure code, both sides import
    ├── types/      Issue, Message, NodeShape
    └── wcag/       criteria mapping
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
3. Select `dist/manifest.json`.
4. Run via `Plugins → Development → Figma A11y Audit`.

See [TESTING.md](./TESTING.md) for the validation fixture and Phase 1 acceptance checklist.

## License

MIT
