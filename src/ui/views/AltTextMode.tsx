/**
 * Alt Text Mode — generate descriptions for images using Ollama + a local
 * vision model (llama3.2-vision).
 *
 * Image sources:
 *   1. "Import from Figma" — asks the sandbox to exportAsync() every
 *      image-bearing node in the selection (or current page) as PNG.
 *   2. Drag-drop / file picker — for images not yet placed in the file.
 *
 * Generation streams token-by-token into the description field.
 */

import React, { useEffect, useRef, useState } from "react";
import { ollamaClient } from "../services/ollama";
import { useUIBridge } from "../hooks/useUIBridge";

interface ImageItem {
  nodeId: string;
  path: string[];
  /** Raw base64 (no data: prefix) — what Ollama's /api/generate expects. */
  base64: string;
  /** data: URL for the <img> preview. */
  previewUrl: string;
  altText?: string;
  decorative?: boolean;
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [ollamaStatus, setOllamaStatus] = useState("unknown");
  const [generating, setGenerating] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [importing, setImporting] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // Subscribe to Ollama status
  useEffect(() => {
    const unsubscribe = ollamaClient.onStatusChange((status) => {
      setOllamaStatus(status);
    });
    return unsubscribe;
  }, []);

  // Subscribe to sandbox responses (exported images, save confirmations)
  useEffect(() => {
    return onMessage((msg) => {
      switch (msg.type) {
        case "images-detected": {
          setImporting(false);
          if (msg.images.length === 0) {
            setStatusText("No images found in the selection or current page.");
            return;
          }
          const items: ImageItem[] = msg.images.map((img) => {
            const base64 = bytesToBase64(img.bytes);
            return {
              nodeId: img.nodeId,
              path: img.path,
              base64,
              previewUrl: `data:image/png;base64,${base64}`,
            };
          });
          setImages((prev) => {
            const known = new Set(prev.map((i) => i.nodeId));
            return [...prev, ...items.filter((i) => !known.has(i.nodeId))];
          });
          setStatusText(`Imported ${msg.images.length} image(s) from Figma.`);
          return;
        }
        case "image-alt-text-saved":
          setSavedCount((n) => n + 1);
          return;
        case "error":
          setImporting(false);
          setStatusText(`❌ ${msg.message}`);
          return;
      }
    });
  }, [onMessage]);

  const handleImportFromFigma = () => {
    setImporting(true);
    setStatusText("Exporting images from Figma...");
    postMessage({ type: "export-images-request" });
  };

  // Handle file upload (user drags/drops an image or selects via input)
  const handleFileUpload = (files: FileList) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        if (!base64) return;
        setImages((prev) => [
          ...prev,
          {
            nodeId: `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            path: [file.name],
            base64,
            previewUrl: dataUrl,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleSelectFiles = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileUpload(e.target.files);
    }
  };

  const setAltTextAt = (idx: number, altText: string) => {
    setImages((prev) => {
      const updated = [...prev];
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], altText, decorative: false };
      }
      return updated;
    });
  };

  const handleGenerate = async () => {
    const idx = currentIdx;
    const current = images[idx];
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

      setStatusText("Checking for vision model...");
      const hasModel = await ollamaClient.hasVisionModel();
      if (!hasModel) {
        const pullSuccess = await ollamaClient.pullVisionModel((status) => {
          setStatusText(`Downloading ${ollamaClient.getModel()}: ${status}`);
        });
        if (!pullSuccess) {
          setStatusText(`❌ Failed to pull ${ollamaClient.getModel()}`);
          return;
        }
      }

      setStatusText("Analyzing image (first run loads the model, ~30s)...");

      // Stream tokens straight into the description field.
      setAltTextAt(idx, "");
      let streamed = "";
      const finalText = await ollamaClient.generateAltText(
        current.base64,
        (chunk) => {
          streamed += chunk;
          setAltTextAt(idx, streamed);
        },
      );

      setAltTextAt(idx, finalText);
      setStatusText("✅ Generated. Edit the text if needed, then save.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusText(`❌ ${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setAltTextAt(currentIdx, e.target.value);
  };

  const handleMarkDecorative = () => {
    setImages((prev) => {
      const updated = [...prev];
      if (updated[currentIdx]) {
        updated[currentIdx] = {
          ...updated[currentIdx],
          decorative: true,
          altText: "",
        };
      }
      return updated;
    });
  };

  const handleSaveAll = () => {
    setSavedCount(0);
    images.forEach((img) => {
      postMessage({
        type: "annotate-alt-text",
        nodeId: img.nodeId,
        text: img.altText || "",
        decorative: img.decorative || false,
      });
    });
  };

  const handlePrev = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  const handleNext = () => {
    if (currentIdx < images.length - 1) setCurrentIdx(currentIdx + 1);
  };

  const current = images[currentIdx];
  const missingAlt = images.filter((img) => !img.altText && !img.decorative)
    .length;

  return (
    <div className="alt-text-mode">
      <div className="alt-text-header">
        <h3>Generate alt text with AI</h3>
        <p>Use local Ollama to generate descriptions for images.</p>
      </div>

      {images.length === 0 ? (
        <div
          className="alt-text-dropzone"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <button
            className="button button-primary"
            onClick={handleImportFromFigma}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import images from Figma"}
          </button>
          <p>…or drag images here / click to select</p>
          <button
            className="button button-secondary"
            onClick={handleSelectFiles}
          >
            Choose files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleInputChange}
            style={{ display: "none" }}
          />
          {statusText && (
            <div className="alt-text-generation-status">{statusText}</div>
          )}
        </div>
      ) : (
        <>
          <div className="alt-text-stats">
            <p>
              <strong>Detected:</strong> {images.length} images
            </p>
            {missingAlt > 0 && (
              <p>
                <strong>Missing alt text:</strong> {missingAlt}
              </p>
            )}
            <button
              className="button button-secondary"
              onClick={handleImportFromFigma}
              disabled={importing}
            >
              {importing ? "Importing..." : "Re-import from Figma"}
            </button>
          </div>

          {current && (
            <div className="alt-text-editor">
              <div className="alt-text-image-preview">
                <img
                  src={current.previewUrl}
                  alt={current.altText || "Image pending description"}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "160px",
                    objectFit: "contain",
                    display: "block",
                    margin: "0 auto",
                  }}
                />
                <div className="alt-text-image-placeholder">
                  {current.path.join(" / ") || "Image"}
                </div>
              </div>

              <div className="alt-text-input-group">
                <label>Description:</label>
                <textarea
                  className="alt-text-textarea"
                  value={current.altText || ""}
                  onChange={handleTextChange}
                  placeholder={
                    current.decorative
                      ? "Marked as decorative (no alt text needed)"
                      : "Enter or generate alt text..."
                  }
                  disabled={generating}
                />

                <div className="alt-text-buttons">
                  <button
                    className="button button-primary"
                    onClick={handleGenerate}
                    disabled={generating}
                  >
                    {generating ? "✨ Generating..." : "✨ Generate"}
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={handleMarkDecorative}
                    disabled={generating}
                  >
                    Mark as decorative
                  </button>
                </div>

                {statusText && (
                  <div className="alt-text-generation-status">{statusText}</div>
                )}
              </div>
            </div>
          )}

          <div className="alt-text-navigation">
            <button
              className="button button-secondary"
              onClick={handlePrev}
              disabled={currentIdx === 0}
            >
              Prev
            </button>
            <span className="alt-text-nav-counter">
              {currentIdx + 1} of {images.length}
            </span>
            <button
              className="button button-secondary"
              onClick={handleNext}
              disabled={currentIdx >= images.length - 1}
            >
              Next
            </button>
          </div>

          <div className="alt-text-ollama-status">
            <p>
              <strong>Ollama status:</strong>{" "}
              {ollamaStatus === "connected" ? "✅ Connected" : `⚠️  ${ollamaStatus}`}
            </p>
            {savedCount > 0 && (
              <p>
                <strong>Saved:</strong> {savedCount} annotation(s)
              </p>
            )}
          </div>

          <div className="alt-text-footer">
            <button
              className="button button-primary"
              onClick={handleSaveAll}
              disabled={missingAlt === images.length}
            >
              Save all
            </button>
          </div>
        </>
      )}
    </div>
  );
}
