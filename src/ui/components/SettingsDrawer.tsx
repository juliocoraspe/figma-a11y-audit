/**
 * Settings Drawer — Ollama configuration and plugin info.
 *
 * Shows endpoint config, connection status, and plugin info.
 * Triggered by settings icon in header or Cmd+, keybind.
 */

import React, { useState, useEffect } from "react";
import { ollamaClient } from "../services/ollama";
import "../styles/SettingsDrawer.css";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const [endpoint, setEndpoint] = useState("http://localhost:11434");
  const [status, setStatus] = useState<"checking" | "connected" | "error" | "not-running" | "pulling">("checking");
  const [modelInfo, setModelInfo] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [tempEndpoint, setTempEndpoint] = useState(endpoint);

  // Subscribe to status changes
  useEffect(() => {
    const unsubscribe = ollamaClient.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });
    return unsubscribe;
  }, []);

  // Check connection on mount and when endpoint changes
  useEffect(() => {
    checkConnection();
  }, [endpoint]);

  const checkConnection = async () => {
    ollamaClient.setEndpoint(endpoint);
    const healthy = await ollamaClient.checkHealth();
    if (healthy) {
      const models = await ollamaClient.getAvailableModels();
      const visionModel = models.find((m) =>
        m.name.includes("llama3.2-vision"),
      );
      if (visionModel) {
        const sizeGB = (visionModel.size / 1024 / 1024 / 1024).toFixed(1);
        setModelInfo(`llama3.2-vision (~${sizeGB}GB)`);
      } else {
        setModelInfo("Models available, but llama3.2-vision not found");
      }
    }
  };

  const handleSaveEndpoint = () => {
    setEndpoint(tempEndpoint);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setTempEndpoint(endpoint);
    setIsEditing(false);
  };

  const statusIcon =
    status === "connected"
      ? "🟢"
      : status === "checking"
        ? "🟡"
        : "🔴";

  const statusText =
    status === "connected"
      ? "Connected"
      : status === "checking"
        ? "Checking..."
        : "Not running";

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="settings-overlay" onClick={onClose} />
      )}

      {/* Drawer */}
      <div className={`settings-drawer ${isOpen ? "open" : ""}`}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} title="Close settings">
            ✕
          </button>
        </div>

        <div className="settings-content">
          {/* Ollama Configuration */}
          <section className="settings-section">
            <h3>Ollama Configuration</h3>

            <div className="settings-field">
              <label>Endpoint:</label>
              {isEditing ? (
                <div className="settings-edit-group">
                  <input
                    type="text"
                    className="settings-input"
                    value={tempEndpoint}
                    onChange={(e) => setTempEndpoint(e.target.value)}
                    placeholder="http://localhost:11434"
                  />
                  <button
                    className="button button-small button-primary"
                    onClick={handleSaveEndpoint}
                  >
                    Save
                  </button>
                  <button
                    className="button button-small button-secondary"
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="settings-display-group">
                  <code className="settings-code">{endpoint}</code>
                  <button
                    className="button button-small button-secondary"
                    onClick={() => {
                      setIsEditing(true);
                      setTempEndpoint(endpoint);
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            <div className="settings-field">
              <label>Status:</label>
              <div className="settings-status">
                <span className="settings-status-icon">{statusIcon}</span>
                <span className="settings-status-text">{statusText}</span>
              </div>
            </div>

            <div className="settings-field">
              <label>Model:</label>
              <div className="settings-model">
                {modelInfo ? (
                  <code className="settings-code">{modelInfo}</code>
                ) : (
                  <span className="settings-placeholder">
                    {status === "not-running"
                      ? "Ollama not running"
                      : "Checking models..."}
                  </span>
                )}
              </div>
            </div>

            <button
              className="button button-secondary"
              onClick={checkConnection}
              style={{ marginTop: "12px" }}
            >
              Test Connection
            </button>
          </section>

          {/* Connection Help */}
          {status !== "connected" && (
            <section className="settings-section settings-help">
              <h4>To use Ollama:</h4>
              <ol className="settings-steps">
                <li>Install: <code>brew install ollama</code></li>
                <li>Run: <code>OLLAMA_ORIGINS="*" ollama serve</code></li>
                <li>Keep terminal open while using the plugin</li>
              </ol>
              <p className="settings-help-text">
                Ollama will auto-download llama3.2-vision (~8GB) on first use.
                The <code>OLLAMA_ORIGINS="*"</code> part matters: the Figma
                plugin iframe has a "null" origin that Ollama rejects by default.
              </p>
            </section>
          )}

          {/* About */}
          <section className="settings-section">
            <h3>About</h3>
            <div className="settings-about">
              <p>
                <strong>A11y Audit</strong> v0.3
              </p>
              <p>Accessibility scanning + AI-powered annotation</p>
              <ul className="settings-features">
                <li>6 Tier 1 accessibility checks</li>
                <li>Tab order assignment</li>
                <li>Alt text generation with local AI</li>
                <li>Language declaration</li>
              </ul>
              <p className="settings-tech">
                Built with React, Figma Plugin API, and Ollama
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
