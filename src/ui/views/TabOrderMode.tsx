/**
 * Tab Order Mode — assign keyboard navigation order to interactive elements.
 *
 * The sandbox detects interactive elements (prototype reactions first,
 * naming heuristics second) inside the selected frame — or the whole page
 * when nothing is selected — and returns them in visual order (top-left →
 * bottom-right). The user assigns numbers by clicking rows, or accepts the
 * visual order via "Auto-assign".
 */

import React, { useEffect, useState } from "react";
import { useUIBridge } from "../hooks/useUIBridge";

interface Element {
  nodeId: string;
  name: string;
}

export default function TabOrderMode() {
  const { postMessage, onMessage } = useUIBridge();
  const [frameId, setFrameId] = useState<string | null>(null);
  const [elements, setElements] = useState<Element[]>([]);
  const [orderMap, setOrderMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");

  // Subscribe to sandbox responses
  useEffect(() => {
    return onMessage((msg) => {
      switch (msg.type) {
        case "tab-order-detected":
          setFrameId(msg.frameId);
          setElements(msg.nodes.map((n) => ({ nodeId: n.nodeId, name: n.name })));
          setOrderMap({});
          setLoading(false);
          return;
        case "tab-order-saved":
          setStatusText(`✅ Saved order for ${msg.count} element(s).`);
          return;
        case "error":
          setLoading(false);
          setStatusText(`❌ ${msg.message}`);
          return;
      }
    });
  }, [onMessage]);

  const requestDetection = () => {
    setLoading(true);
    setStatusText("");
    // No frameId: the sandbox uses the selected frame, or the current page.
    postMessage({ type: "tab-order-request" });
  };

  // Detect on mount
  useEffect(() => {
    requestDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Click to assign the next free number; click again to unassign. */
  const handleToggleElement = (nodeId: string) => {
    setOrderMap((prev) => {
      if (prev[nodeId]) {
        const removed = prev[nodeId];
        const next: Record<string, number> = {};
        for (const [id, n] of Object.entries(prev)) {
          if (id === nodeId) continue;
          next[id] = n > removed ? n - 1 : n;
        }
        return next;
      }
      const nextNumber = Object.keys(prev).length + 1;
      return { ...prev, [nodeId]: nextNumber };
    });
  };

  // Auto-assign follows the visual order the sandbox already sorted by.
  const handleAutoAssign = () => {
    const newOrder = elements.reduce(
      (acc, el, idx) => {
        acc[el.nodeId] = idx + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    setOrderMap(newOrder);
  };

  const handleClear = () => setOrderMap({});

  const handleJumpTo = (nodeId: string) => {
    postMessage({ type: "jump-to-node", nodeId });
  };

  const handleSaveOrder = () => {
    if (!frameId) return;
    postMessage({
      type: "annotate-tab-order",
      frameId,
      orderMap,
    });
  };

  const unassigned = elements.filter((el) => !orderMap[el.nodeId]).length;

  return (
    <div className="tab-order-mode">
      <div className="tab-order-header">
        <h3>Assign tab order for keyboard navigation</h3>
        <p>
          Click elements in the order they should receive focus, or use
          Auto-assign (visual top-left → bottom-right order).
        </p>
      </div>

      {loading ? (
        <div className="tab-order-loading">
          <p>Detecting interactive elements...</p>
        </div>
      ) : (
        <>
          <div className="tab-order-stats">
            <p>
              <strong>Interactive elements detected:</strong> {elements.length}
            </p>
            {Object.keys(orderMap).length > 0 && (
              <p>
                <strong>Assigned:</strong> {Object.keys(orderMap).length} /{" "}
                {elements.length}
              </p>
            )}
            <button
              className="button button-secondary"
              onClick={requestDetection}
            >
              Re-detect
            </button>
          </div>

          {elements.length === 0 ? (
            <div className="tab-order-empty">
              <p>
                No interactive elements detected. Select a frame with buttons,
                inputs or prototype connections and hit Re-detect.
              </p>
            </div>
          ) : (
            <div className="tab-order-list">
              {elements.map((el) => (
                <div
                  key={el.nodeId}
                  className="tab-order-item"
                  onClick={() => handleToggleElement(el.nodeId)}
                  style={{ cursor: "pointer" }}
                  title="Click to assign/unassign order"
                >
                  <div className="tab-order-item-header">
                    <span className="tab-order-item-name">{el.name}</span>
                    <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {orderMap[el.nodeId] && (
                        <div className="tab-order-item-badge">
                          {orderMap[el.nodeId]}
                        </div>
                      )}
                      <button
                        className="button button-small button-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJumpTo(el.nodeId);
                        }}
                        title="Show on canvas"
                      >
                        ◎
                      </button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {statusText && (
            <div className="tab-order-status-text">
              <p>{statusText}</p>
            </div>
          )}

          <div className="tab-order-footer">
            <div className="tab-order-status">
              {unassigned > 0 && (
                <p>
                  <strong>{unassigned} unassigned</strong>
                </p>
              )}
            </div>

            <div className="tab-order-actions">
              <button
                className="button button-secondary"
                onClick={handleClear}
                disabled={Object.keys(orderMap).length === 0}
              >
                Clear
              </button>
              <button
                className="button button-secondary"
                onClick={handleAutoAssign}
                disabled={elements.length === 0}
              >
                Auto-assign
              </button>
              <button
                className="button button-primary"
                onClick={handleSaveOrder}
                disabled={Object.keys(orderMap).length === 0}
              >
                Save order
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
