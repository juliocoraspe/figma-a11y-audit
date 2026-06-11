/**
 * ErrorMessage — Clear, actionable error messages.
 */

import React from "react";
import "../styles/ErrorMessage.css";

export interface ErrorMessageProps {
  type: "ollama-not-running" | "model-not-found" | "generation-failed" | "generic";
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorMessage({
  type,
  onRetry,
  onDismiss,
}: ErrorMessageProps) {
  const getContent = () => {
    switch (type) {
      case "ollama-not-running":
        return {
          title: "Ollama not running",
          message:
            "Can't reach Ollama at localhost:11434",
          steps: [
            "Install: brew install ollama",
            "Run: OLLAMA_ORIGINS=\"*\" ollama serve",
            "Keep terminal open while using the plugin",
          ],
          icon: "⚠️",
        };
      case "model-not-found":
        return {
          title: "Downloading model",
          message: "llama3.2-vision (2GB) is downloading...",
          steps: [
            "This takes ~5 minutes on first use",
            "Please wait while the model loads",
          ],
          icon: "⏳",
        };
      case "generation-failed":
        return {
          title: "Generation failed",
          message: "Timeout after 30 seconds",
          steps: [
            "Ollama might be busy or connection interrupted",
            "Try clicking Retry, or use manual input",
          ],
          icon: "❌",
        };
      default:
        return {
          title: "Something went wrong",
          message: "An unexpected error occurred",
          steps: ["Please try again or check the browser console for details"],
          icon: "❌",
        };
    }
  };

  const content = getContent();

  return (
    <div className="error-message">
      <div className="error-header">
        <span className="error-icon">{content.icon}</span>
        <h3 className="error-title">{content.title}</h3>
        {onDismiss && (
          <button
            className="error-close"
            onClick={onDismiss}
            title="Dismiss"
          >
            ✕
          </button>
        )}
      </div>

      <p className="error-message-text">{content.message}</p>

      {content.steps.length > 0 && (
        <ol className="error-steps">
          {content.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      {(onRetry || onDismiss) && (
        <div className="error-actions">
          {onRetry && (
            <button className="button button-small button-primary" onClick={onRetry}>
              Retry
            </button>
          )}
          {onDismiss && (
            <button
              className="button button-small button-secondary"
              onClick={onDismiss}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
