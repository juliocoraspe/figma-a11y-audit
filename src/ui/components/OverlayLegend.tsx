/**
 * OverlayLegend — a small "Legend" tab that explains the three kinds of
 * canvas annotations the plugin paints, so users can tell issue dots, tab
 * order badges and alt text chips apart at a glance.
 */

import React, { useEffect, useRef, useState } from "react";

const SWATCH_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 9,
  fontWeight: 700,
  flexShrink: 0,
};

function Row({
  swatch,
  title,
  text,
}: {
  swatch: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ marginTop: 2 }}>{swatch}</span>
      <span style={{ fontSize: 12, lineHeight: 1.45 }}>
        <strong>{title}</strong> — {text}
      </span>
    </div>
  );
}

export function OverlayLegend() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="What do the canvas annotations mean?"
        style={{
          background: open ? "#1e3a5f" : "none",
          color: open ? "#fff" : "#666",
          border: "1px solid #ccc",
          borderRadius: 4,
          padding: "3px 8px",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        ? Legend
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Canvas annotations legend"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 272,
            maxHeight: 420,
            overflowY: "auto",
            zIndex: 1000,
            background: "#fff",
            border: "1px solid #1e3a5f",
            boxShadow: "4px 4px 0 rgba(30, 58, 95, 0.15)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            textAlign: "left",
          }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              fontFamily: "var(--font-mono, monospace)",
              color: "#1e3a5f",
            }}
          >
            CANVAS ANNOTATIONS
          </span>

          <Row
            swatch={
              <span
                style={{
                  ...SWATCH_BASE,
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  background: "#DC2626",
                }}
              >
                7
              </span>
            }
            title="Audit issues"
            text="Numbered circles at the top-right of each flagged layer. Color is severity: red critical, orange serious, gold moderate, navy minor. The number matches the row in the results list — click a dot on canvas to jump to it."
          />

          <Row
            swatch={
              <span
                style={{
                  ...SWATCH_BASE,
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: "#7C3AED",
                }}
              >
                1
              </span>
            }
            title="Tab order"
            text="Purple squares at the top-left of interactive elements show the keyboard focus sequence; a dashed purple line traces the path 1 → N. Assigned in Annotate → Tab Order."
          />

          <Row
            swatch={
              <span
                style={{
                  ...SWATCH_BASE,
                  width: 28,
                  height: 14,
                  borderRadius: 7,
                  fontSize: 7,
                  background: "#16A34A",
                }}
              >
                ALT
              </span>
            }
            title="Alt text"
            text="A green ALT chip marks images with a saved description; a gray DECO chip marks decorative images screen readers should skip. Assigned in Annotate → Alt Text."
          />

          <span style={{ fontSize: 11, color: "#666", lineHeight: 1.45 }}>
            All annotations live in locked frames named{" "}
            <code style={{ fontSize: 10 }}>[a11y-…]</code> on the canvas. The
            scanner ignores them, and you can delete those frames at any time —
            re-running a scan or re-saving annotations repaints them.
          </span>

          <div style={{ height: 1, background: "#ddd" }} role="separator" />

          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              fontFamily: "var(--font-mono, monospace)",
              color: "#1e3a5f",
            }}
          >
            LOCAL AI (OLLAMA)
          </span>

          <span style={{ fontSize: 12, lineHeight: 1.45 }}>
            AI alt text runs on <strong>Ollama</strong>, a free AI server on
            your own machine — images never leave your computer and there are
            no API costs. The plugin talks to it at{" "}
            <code style={{ fontSize: 10 }}>http://localhost:11434</code> using
            the <code style={{ fontSize: 10 }}>llama3.2-vision</code> model
            (~8 GB download, needs ~8 GB of free RAM).
          </span>

          <span style={{ fontSize: 11, color: "#444", lineHeight: 1.55 }}>
            <strong>One-time setup:</strong>
            <br />
            1. Install Ollama (<code style={{ fontSize: 10 }}>brew install ollama</code>{" "}
            or the desktop app).
            <br />
            2. Allow plugin access — Figma plugins run from a{" "}
            <code style={{ fontSize: 10 }}>null</code> origin that Ollama
            rejects by default. Terminal:{" "}
            <code style={{ fontSize: 10 }}>OLLAMA_ORIGINS="*" ollama serve</code>.
            macOS menu-bar app:{" "}
            <code style={{ fontSize: 10 }}>
              launchctl setenv OLLAMA_ORIGINS '*'
            </code>{" "}
            then restart the app.
            <br />
            3. <code style={{ fontSize: 10 }}>ollama pull llama3.2-vision</code>
          </span>

          <span style={{ fontSize: 11, color: "#666", lineHeight: 1.45 }}>
            Check the connection in Settings (⚙) — green means ready. The
            first generation loads the model into RAM (~30 s); after that it
            takes seconds. Everything else in the plugin (scanning, tab order,
            language) works without Ollama.
          </span>
        </div>
      )}
    </div>
  );
}
