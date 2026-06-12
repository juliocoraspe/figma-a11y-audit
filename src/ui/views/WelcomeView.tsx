import { useState } from "react";
import type { ScanScope } from "@shared/types/Message";

interface Props {
  isScanning: boolean;
  progress: { current: number; total: number; checkRunning: string } | null;
  onRun: (scope: ScanScope) => void;
}

export function WelcomeView({ isScanning, progress, onRun }: Props) {
  const [scope] = useState<ScanScope>("page");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
        padding: "var(--space-6)",
        height: "100%",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <span className="mono-label">A11Y AUDIT · v0.5</span>
        <h1
          className="display"
          style={{
            margin: 0,
            fontSize: "var(--text-xl)",
            lineHeight: 1.15,
            color: "var(--ink-primary)",
          }}
        >
          Audit this page<br />against WCAG&nbsp;AA.
        </h1>
        <p
          style={{
            margin: 0,
            color: "var(--ink-secondary)",
            fontSize: "var(--text-sm)",
            lineHeight: 1.5,
          }}
        >
          Runs six checks over the current page: text &amp; UI contrast, tap
          targets, text size, and focus states. Then annotate tab order and
          alt&nbsp;text from the results view.
        </p>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <span className="mono-label">SCOPE</span>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            disabled
            style={{ opacity: scope === "page" ? 1 : 0.5 }}
            aria-pressed={scope === "page"}
          >
            Current page
          </button>
          <button disabled aria-disabled="true" title="Coming soon">
            Selection
          </button>
        </div>
      </section>

      <div style={{ flex: 1 }} />

      <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <button
          className="primary"
          onClick={() => onRun(scope)}
          disabled={isScanning}
          style={{ width: "100%", padding: "var(--space-3) var(--space-4)" }}
        >
          {isScanning ? "Running audit…" : "Run audit"}
        </button>
        {isScanning && progress ? (
          <span
            className="mono-label"
            style={{ textAlign: "center" }}
          >
            {progress.current} / {progress.total} nodes · {progress.checkRunning}
          </span>
        ) : null}
      </section>
    </div>
  );
}
