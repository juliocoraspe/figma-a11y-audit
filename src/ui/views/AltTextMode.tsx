/**
 * Alt Text Mode — assign image descriptions, with AI assistance from a
 * local Ollama vision model.
 *
 * Flow:
 *   1. Pick an explicit scope — current selection or entire page — and the
 *      sandbox exports every image-bearing node in it (PNG via exportAsync),
 *      together with any previously saved assignment.
 *   2. Pick an image from the list; the canvas jumps to it so it's always
 *      clear which element is being edited.
 *   3. Write or Generate a description, then "Approve & assign": the text is
 *      persisted as plugin data on the node (saved inside the .fig file) and
 *      the image gets a green ALT chip on canvas (gray DECO for decorative).
 */

import React, { useEffect, useState } from "react";
import { ollamaClient } from "../services/ollama";
import { useUIBridge } from "../hooks/useUIBridge";

interface ImageItem {
  nodeId: string;
  path: string[];
  /** Raw base64 (no data: prefix) — what Ollama's /api/generate expects. */
  base64: string;
  previewUrl: string;
  altText: string;
  decorative: boolean;
  /** True when the current altText/decorative state is assigned in Figma. */
  saved: boolean;
}

type Scope = "selection" | "page";

/** Chunked btoa: String.fromCharCode(...bytes) overflows the stack on big arrays. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export default function AltTextMode() {
  const { postMessage, onMessage } = useUIBridge();

  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState("unknown");
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    return ollamaClient.onStatusChange(setOllamaStatus);
  }, []);

  // Sandbox responses
  useEffect(() => {
    return onMessage((msg) => {
      switch (msg.type) {
        case "images-detected": {
          setImporting(false);
          setScope(msg.scope);
          const items: ImageItem[] = msg.images.map((img) => {
            const base64 = bytesToBase64(img.bytes);
            return {
              nodeId: img.nodeId,
              path: img.path,
              base64,
              previewUrl: `data:image/png;base64,${base64}`,
              altText: img.altText ?? "",
              decorative: img.decorative,
              saved: Boolean(img.altText) || img.decorative,
            };
          });
          setImages(items);
          const firstPending = items.find((i) => !i.saved) ?? items[0];
          setSelectedId(firstPending ? firstPending.nodeId : null);
          setStatusText(
            items.length === 0
              ? `No images found in the ${msg.scope === "selection" ? "selection" : "page"}.`
              : "",
          );
          return;
        }
        case "image-alt-text-saved":
          setImages((prev) => {
            const updated = prev.map((img) =>
              img.nodeId === msg.nodeId ? { ...img, saved: true } : img,
            );
            // Move on to the next image still needing attention.
            const next = updated.find((i) => !i.saved);
            if (next) setSelectedId(next.nodeId);
            return updated;
          });
          setStatusText("✓ Assigned and marked on canvas.");
          return;
        case "error":
          setImporting(false);
          setStatusText(`❌ ${msg.message}`);
          return;
      }
    });
  }, [onMessage]);

  const handleImport = (requestedScope: Scope) => {
    setImporting(true);
    setStatusText(
      requestedScope === "selection"
        ? "Exporting images from your selection..."
        : "Exporting images from the entire page...",
    );
    postMessage({ type: "export-images-request", scope: requestedScope });
  };

  // Selecting an image also selects it on the Figma canvas, so there is
  // never a doubt about which element is being annotated.
  const handleSelect = (nodeId: string) => {
    setSelectedId(nodeId);
    setStatusText("");
    postMessage({ type: "jump-to-node", nodeId });
  };

  const patchSelected = (patch: Partial<ImageItem>) => {
    setSelectedId((id) => {
      if (id) {
        setImages((prev) =>
          prev.map((img) => (img.nodeId === id ? { ...img, ...patch } : img)),
        );
      }
      return id;
    });
  };

  const handleGenerate = async () => {
    const current = images.find((i) => i.nodeId === selectedId);
    if (!current || generating) return;

    setGenerating(true);
    setStatusText("Connecting to Ollama...");
    try {
      const healthy = await ollamaClient.checkHealth();
      if (!healthy) {
        setStatusText(
          `❌ Ollama not reachable. Start it with: OLLAMA_ORIGINS="*" ollama serve`,
        );
        return;
      }

      const hasModel = await ollamaClient.hasVisionModel();
      if (!hasModel) {
        const ok = await ollamaClient.pullVisionModel((s) =>
          setStatusText(`Downloading ${ollamaClient.getModel()}: ${s}`),
        );
        if (!ok) {
          setStatusText(`❌ Failed to pull ${ollamaClient.getModel()}`);
          return;
        }
      }

      setStatusText("Analyzing image (first run loads the model, ~30s)...");
      patchSelected({ altText: "", decorative: false, saved: false });
      let streamed = "";
      const finalText = await ollamaClient.generateAltText(
        current.base64,
        (chunk) => {
          streamed += chunk;
          patchSelected({ altText: streamed });
        },
      );
      patchSelected({ altText: finalText, saved: false });
      setStatusText("Review the suggestion, edit if needed, then Approve & assign.");
    } catch (err) {
      setStatusText(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = () => {
    const current = images.find((i) => i.nodeId === selectedId);
    if (!current || !current.altText.trim()) return;
    setStatusText("Assigning...");
    postMessage({
      type: "annotate-alt-text",
      nodeId: current.nodeId,
      text: current.altText.trim(),
      decorative: false,
    });
  };

  const handleMarkDecorative = () => {
    const current = images.find((i) => i.nodeId === selectedId);
    if (!current) return;
    patchSelected({ decorative: true, altText: "", saved: false });
    setStatusText("Marking as decorative...");
    postMessage({
      type: "annotate-alt-text",
      nodeId: current.nodeId,
      text: "",
      decorative: true,
    });
  };

  const current = images.find((i) => i.nodeId === selectedId) ?? null;
  const pending = images.filter((i) => !i.saved).length;

  return (
    <div className="alt-text-mode">
      <div className="alt-text-header">
        <h3>Assign alt text</h3>
        <p>
          Scan for images, approve an AI suggestion (or write your own), and
          it's assigned to the layer and marked on canvas.
        </p>
      </div>

      {/* Scope — always visible and always explicit. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="button button-secondary"
          onClick={() => handleImport("selection")}
          disabled={importing}
        >
          Scan selection
        </button>
        <button
          className="button button-secondary"
          onClick={() => handleImport("page")}
          disabled={importing}
        >
          Scan entire page
        </button>
        {scope && (
          <span style={{ fontSize: 12, color: "#666" }}>
            {images.length} image{images.length === 1 ? "" : "s"} from{" "}
            <strong>{scope === "selection" ? "selection" : "entire page"}</strong>
            {pending > 0 ? ` · ${pending} need alt text` : images.length > 0 ? " · all assigned ✓" : ""}
          </span>
        )}
      </div>

      {statusText && images.length === 0 && (
        <div className="alt-text-generation-status">{statusText}</div>
      )}

      {images.length > 0 && (
        <>
          {/* Image list — the list IS the navigation. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              maxHeight: 150,
              overflowY: "auto",
              border: "1px solid #ddd",
              padding: 4,
            }}
          >
            {images.map((img) => (
              <button
                key={img.nodeId}
                onClick={() => handleSelect(img.nodeId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 6px",
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                  background: img.nodeId === selectedId ? "#E8EDF4" : "transparent",
                }}
                title="Click to edit — also selects the image on canvas"
              >
                <img
                  src={img.previewUrl}
                  alt=""
                  style={{ width: 28, height: 28, objectFit: "cover", flexShrink: 0 }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {img.path[img.path.length - 1] || "Image"}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 7,
                    color: "#fff",
                    background: img.saved
                      ? img.decorative
                        ? "#6B7280"
                        : "#16A34A"
                      : "#CA8A04",
                    flexShrink: 0,
                  }}
                >
                  {img.saved ? (img.decorative ? "DECO" : "ALT ✓") : "TODO"}
                </span>
              </button>
            ))}
          </div>

          {current && (
            <div className="alt-text-editor">
              <div className="alt-text-image-preview">
                <img
                  src={current.previewUrl}
                  alt={current.altText || "Image pending description"}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "130px",
                    objectFit: "contain",
                    display: "block",
                    margin: "0 auto",
                  }}
                />
                <div className="alt-text-image-placeholder">
                  {current.path.join(" / ")}
                </div>
              </div>

              <div className="alt-text-input-group">
                <label>Description:</label>
                <textarea
                  className="alt-text-textarea"
                  value={current.altText}
                  onChange={(e) =>
                    patchSelected({
                      altText: e.target.value,
                      decorative: false,
                      saved: false,
                    })
                  }
                  placeholder={
                    current.decorative
                      ? "Marked as decorative (no description needed)"
                      : "Write a description or hit Generate..."
                  }
                  disabled={generating}
                />

                <div className="alt-text-buttons">
                  <button
                    className="button button-secondary"
                    onClick={handleGenerate}
                    disabled={generating}
                  >
                    {generating ? "✨ Generating..." : "✨ Generate"}
                  </button>
                  <button
                    className="button button-primary"
                    onClick={handleApprove}
                    disabled={generating || !current.altText.trim() || current.saved}
                  >
                    {current.saved && !current.decorative
                      ? "✓ Assigned"
                      : "Approve & assign"}
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={handleMarkDecorative}
                    disabled={generating || (current.saved && current.decorative)}
                  >
                    {current.saved && current.decorative
                      ? "✓ Decorative"
                      : "Mark decorative"}
                  </button>
                </div>

                {statusText && (
                  <div className="alt-text-generation-status">{statusText}</div>
                )}
              </div>
            </div>
          )}

          <div className="alt-text-ollama-status">
            <p>
              <strong>Ollama status:</strong>{" "}
              {ollamaStatus === "connected" ? "✅ Connected" : `⚠️  ${ollamaStatus}`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
