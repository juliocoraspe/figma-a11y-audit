/**
 * AnnotateView — the three annotation modes for v0.3.
 *
 * - Tab Order: assign keyboard navigation sequence
 * - Alt Text: generate descriptions for images using Ollama + llama3.2-vision
 * - Language: declare frame language for screen readers
 */

import React, { useState } from "react";
import "../styles/AnnotateView.css";
import TabOrderMode from "./TabOrderMode";
import AltTextMode from "./AltTextMode";
import LanguageMode from "./LanguageMode";

type AnnotateMode = "tab-order" | "alt-text" | "language";

interface AnnotateModeProps {
  onBack: () => void;
}

export default function AnnotateView({ onBack }: AnnotateModeProps) {
  const [mode, setMode] = useState<AnnotateMode>("tab-order");

  return (
    <div className="annotate-view">
      <div className="annotate-header">
        <button className="back-button" onClick={onBack} title="Back to results">
          ← Back
        </button>
        <h2 className="annotate-title">Annotate</h2>
      </div>

      <div className="annotate-tabs">
        <button
          className={`annotate-tab ${mode === "tab-order" ? "active" : ""}`}
          onClick={() => setMode("tab-order")}
        >
          Tab Order
        </button>
        <button
          className={`annotate-tab ${mode === "alt-text" ? "active" : ""}`}
          onClick={() => setMode("alt-text")}
        >
          Alt Text
        </button>
        <button
          className={`annotate-tab ${mode === "language" ? "active" : ""}`}
          onClick={() => setMode("language")}
        >
          Language
        </button>
      </div>

      <div className="annotate-content">
        {mode === "tab-order" && <TabOrderMode />}
        {mode === "alt-text" && <AltTextMode />}
        {mode === "language" && <LanguageMode />}
      </div>
    </div>
  );
}
