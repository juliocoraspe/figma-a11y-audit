/**
 * Tab Order Mode — assign keyboard navigation order to interactive elements.
 *
 * The sandbox detects interactive elements (prototype reactions first,
 * naming heuristics second) inside the selected frame — or the whole page —
 * and returns them in visual order, together with any previously saved
 * assignment (page plugin data), so editing resumes without re-analysis.
 *
 * Editing works both ways:
 *   - From the list: click to assign/unassign, ↑ ↓ to reorder, ✕ to remove.
 *   - From the canvas ("canvas picking"): with the mode open, clicking any
 *     element on the canvas adds it as the next stop — including elements
 *     detection missed — or highlights it if already assigned. Overlays are
 *     locked, so clicks fall through to the real element beneath.
 */

import React, { useEffect, useRef, useState } from "react";
import { useUIBridge } from "../hooks/useUIBridge";

interface Element {
  nodeId: string;
  name: string;
}

export default function TabOrderMode() {
  const { postMessage, onMessage } = useUIBridge();
  const [frameId, setFrameId] = useState<string | null>(null);
  const [frameName, setFrameName] = useState("");
  const [elements, setElements] = useState<Element[]>([]);
  const [orderMap, setOrderMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [canvasPick, setCanvasPick] = useState(true);
  const canvasPickRef = useRef(canvasPick);
  canvasPickRef.current = canvasPick;
  // Mirror for reading the latest order inside message handlers without
  // nesting state updates.
  const orderMapRef = useRef(orderMap);
  orderMapRef.current = orderMap;

  // Subscribe to sandbox responses
  useEffect(() => {
    return onMessage((msg) => {
      switch (msg.type) {
        case "tab-order-detected":
          setFrameId(msg.frameId);
          setFrameName(msg.frameName);
          setElements(msg.nodes.map((n) => ({ nodeId: n.nodeId, name: n.name })));
          setOrderMap(msg.saved);
          setLoading(false);
          setStatusText(
            Object.keys(msg.saved).length > 0
              ? `Loaded saved order (${Object.keys(msg.saved).length} stops) — edit and save again.`
              : `Detected ${msg.nodes.length} element(s) in ${msg.frameName}. Auto-assign for a first pass, then adjust.`,
          );
          return;
        case "tab-order-saved":
          setStatusText(
            `✅ Saved ${msg.count} stop(s) — remembered in this file.`,
          );
          return;
        case "canvas-node-selected": {
          if (!canvasPickRef.current) return;
          const { nodeId, name } = msg;
          const existing = orderMapRef.current[nodeId];
          if (existing) {
            setStatusText(
              `'${name}' is already stop #${existing} — use ↑ ↓ ✕ in the list to modify.`,
            );
            return;
          }
          const next = Object.keys(orderMapRef.current).length + 1;
          setElements((prev) =>
            prev.some((el) => el.nodeId === nodeId)
              ? prev
              : [...prev, { nodeId, name }],
          );
          setOrderMap((prev) =>
            prev[nodeId] ? prev : { ...prev, [nodeId]: next },
          );
          setStatusText(`➕ Added '${name}' as stop #${next} (from canvas).`);
          return;
        }
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

  // Mirror every order change onto the canvas: purple numbered squares plus
  // a dashed path line. An empty map clears the overlay.
  useEffect(() => {
    const items = Object.entries(orderMap).map(([nodeId, order]) => ({
      nodeId,
      order,
    }));
    postMessage({ type: "tab-order-overlay", items });
  }, [orderMap, postMessage]);

  /** Click to assign the next free number; click again to unassign. */
  const handleToggleElement = (nodeId: string) => {
    setOrderMap((prev) => {
      if (prev[nodeId]) {
        return removeStop(prev, nodeId);
      }
      const nextNumber = Object.keys(prev).length + 1;
      return { ...prev, [nodeId]: nextNumber };
    });
  };

  /** Swap a stop with its neighbor (dir = -1 up, +1 down). */
  const handleMoveStop = (nodeId: string, dir: -1 | 1) => {
    setOrderMap((prev) => {
      const current = prev[nodeId];
      if (!current) return prev;
      const target = current + dir;
      const neighbor = Object.keys(prev).find((id) => prev[id] === target);
      if (!neighbor) return prev;
      return { ...prev, [nodeId]: target, [neighbor]: current };
    });
  };

  const handleRemoveStop = (nodeId: string) => {
    setOrderMap((prev) => removeStop(prev, nodeId));
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

  const assignedCount = Object.keys(orderMap).length;
  const unassigned = elements.filter((el) => !orderMap[el.nodeId]).length;

  // Assigned stops first (in order), then unassigned in detection order —
  // so the list reads like the navigation path.
  const sortedElements = [...elements].sort((a, b) => {
    const oa = orderMap[a.nodeId] ?? Infinity;
    const ob = orderMap[b.nodeId] ?? Infinity;
    return oa - ob;
  });

  return (
    <div className="tab-order-mode">
      <div className="tab-order-header">
        <h3>Assign tab order for keyboard navigation</h3>
        <p>
          Click rows (or elements on the canvas) in the order they should
          receive focus. The order is saved with the file — reopen anytime to
          edit or add missed elements without re-running detection.
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
              {frameName && (
                <>
                  <strong>Scope:</strong> {frameName} ·{" "}
                </>
              )}
              <strong>Interactive elements:</strong> {elements.length}
              {assignedCount > 0 && (
                <>
                  {" "}
                  · <strong>Assigned:</strong> {assignedCount}
                </>
              )}
            </p>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                cursor: "pointer",
              }}
              title="With this on, clicking any element on the canvas adds it as the next stop — even if detection missed it."
            >
              <input
                type="checkbox"
                checked={canvasPick}
                onChange={(e) => setCanvasPick(e.target.checked)}
              />
              🎯 Canvas picking: click elements on canvas to add stops
            </label>
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
                inputs or prototype connections and hit Re-detect — or turn on
                canvas picking and click elements directly.
              </p>
            </div>
          ) : (
            <div className="tab-order-list">
              {sortedElements.map((el) => {
                const order = orderMap[el.nodeId];
                return (
                  <div
                    key={el.nodeId}
                    className="tab-order-item"
                    onClick={() => handleToggleElement(el.nodeId)}
                    style={{ cursor: "pointer" }}
                    title={
                      order
                        ? "Click to unassign"
                        : "Click to assign the next number"
                    }
                  >
                    <div className="tab-order-item-header">
                      <span className="tab-order-item-name">{el.name}</span>
                      <span
                        style={{ display: "flex", gap: "4px", alignItems: "center" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {order && (
                          <>
                            <div className="tab-order-item-badge">{order}</div>
                            <button
                              className="button button-small button-secondary"
                              onClick={() => handleMoveStop(el.nodeId, -1)}
                              disabled={order === 1}
                              title="Move earlier in the order"
                            >
                              ↑
                            </button>
                            <button
                              className="button button-small button-secondary"
                              onClick={() => handleMoveStop(el.nodeId, 1)}
                              disabled={order === assignedCount}
                              title="Move later in the order"
                            >
                              ↓
                            </button>
                            <button
                              className="button button-small button-secondary"
                              onClick={() => handleRemoveStop(el.nodeId)}
                              title="Remove from the order"
                            >
                              ✕
                            </button>
                          </>
                        )}
                        <button
                          className="button button-small button-secondary"
                          onClick={() => handleJumpTo(el.nodeId)}
                          title="Show on canvas"
                        >
                          ◎
                        </button>
                      </span>
                    </div>
                  </div>
                );
              })}
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
                disabled={assignedCount === 0}
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
                disabled={assignedCount === 0 && elements.length === 0}
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

/** Unassign a stop and compact the numbering so no gaps remain. */
function removeStop(
  prev: Record<string, number>,
  nodeId: string,
): Record<string, number> {
  const removed = prev[nodeId];
  if (!removed) return prev;
  const next: Record<string, number> = {};
  for (const [id, n] of Object.entries(prev)) {
    if (id === nodeId) continue;
    next[id] = n > removed ? n - 1 : n;
  }
  return next;
}
