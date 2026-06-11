/**
 * LoadingState — Visual feedback for async operations.
 */

import React from "react";
import "../styles/LoadingState.css";

export interface LoadingStateProps {
  message: string;
  progress?: number; // 0-100
  subMessage?: string;
}

export function LoadingState({
  message,
  progress,
  subMessage,
}: LoadingStateProps) {
  return (
    <div className="loading-state">
      <div className="loading-spinner" />
      <p className="loading-message">{message}</p>
      {progress !== undefined && (
        <div className="loading-progress">
          <div className="loading-progress-bar" style={{ width: `${progress}%` }} />
          <span className="loading-progress-text">{progress}%</span>
        </div>
      )}
      {subMessage && <p className="loading-submessage">{subMessage}</p>}
    </div>
  );
}
