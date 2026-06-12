import { useCallback, useEffect, useMemo, useState } from "react";
import type { CheckId, Issue, Severity } from "@shared/types/Issue";
import type { OverlayPaintItem, ScanScope } from "@shared/types/Message";
import { send, subscribe } from "@ui/services/bridge";
import { WelcomeView } from "@ui/views/WelcomeView";
import { ResultsListView } from "@ui/views/ResultsListView";
import { DetailDrawer } from "@ui/views/DetailDrawer";
import AnnotateView from "@ui/views/AnnotateView";
import { SettingsDrawer } from "@ui/components/SettingsDrawer";
import { OverlayLegend } from "@ui/components/OverlayLegend";

type Phase =
  | { kind: "welcome" }
  | { kind: "scanning"; progress: { current: number; total: number; checkRunning: string } | null }
  | { kind: "results" }
  | { kind: "annotate" };

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "welcome" });
  const [issues, setIssues] = useState<Issue[]>([]);
  const [meta, setMeta] = useState<{ totalNodes: number; durationMs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [focusedIssueIds, setFocusedIssueIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Sorted + indexed view of the current issues. Dismissed issues stay in
  // the model but disappear from the list and the canvas.
  const visibleIssues = useMemo(() => sortAndIndex(issues), [issues]);

  // Whenever the visible set changes, push the canvas dots back in sync.
  useEffect(() => {
    if (phase.kind !== "results") return;
    const items: OverlayPaintItem[] = visibleIssues.map((i) => ({
      issueId: i.id,
      nodeId: i.nodeId,
      severity: i.severity,
      index: i.index ?? 0,
    }));
    send({ type: "overlay-repaint", items });
  }, [visibleIssues, phase.kind]);

  useEffect(() => {
    return subscribe((msg) => {
      switch (msg.type) {
        case "scan-progress":
          setPhase({
            kind: "scanning",
            progress: {
              current: msg.current,
              total: msg.total,
              checkRunning: msg.checkRunning,
            },
          });
          return;
        case "scan-complete":
          setError(null);
          setIssues(msg.issues);
          setMeta(msg.meta);
          setPhase({ kind: "results" });
          return;
        case "scan-cancelled":
          setPhase({ kind: "welcome" });
          return;
        case "node-focused":
          setFocusedIssueIds(msg.issueIds);
          if (msg.issueIds.length > 0) {
            setSelectedIssueId(null); // clicking a dot returns user to list
          }
          return;
        case "fix-applied":
          setIssues((prev) =>
            prev.map((i) =>
              i.id === msg.issueId
                ? {
                    ...i,
                    status: "resolved",
                    details: { ...i.details, ...msg.after },
                  }
                : i,
            ),
          );
          return;
        case "error":
          setError(`${msg.code}: ${msg.message}`);
          return;
      }
    });
  }, []);

  const handleRun = useCallback((scope: ScanScope) => {
    setError(null);
    setFocusedIssueIds([]);
    setSelectedIssueId(null);
    setIssues([]);
    setMeta(null);
    setPhase({ kind: "scanning", progress: null });
    send({ type: "scan-request", scope });
  }, []);

  const handleJump = useCallback((nodeId: string) => {
    send({ type: "jump-to-node", nodeId });
  }, []);

  const handleSelect = useCallback((issue: Issue) => {
    setSelectedIssueId(issue.id);
    setFocusedIssueIds([]);
  }, []);

  const handleHover = useCallback((nodeId: string | null) => {
    setHoveredNodeId(nodeId);
    send({ type: "highlight-node", nodeId });
  }, []);

  const handleApplyFix = useCallback(
    (issueId: string, checkId: CheckId, params: Record<string, unknown>) => {
      send({ type: "apply-fix", issueId, checkId, params });
    },
    [],
  );

  const handleDismiss = useCallback((issueId: string) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, status: "dismissed" } : i)),
    );
    setSelectedIssueId(null);
    send({ type: "dismiss-issue", issueId });
  }, []);

  const selectedIssue = useMemo(
    () => issues.find((i) => i.id === selectedIssueId) ?? null,
    [issues, selectedIssueId],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      <SettingsDrawer
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {phase.kind === "results" && selectedIssue ? (
        <DetailDrawer
          issue={selectedIssue}
          onBack={() => setSelectedIssueId(null)}
          onJump={handleJump}
          onApplyFix={handleApplyFix}
          onDismiss={handleDismiss}
        />
      ) : phase.kind === "results" ? (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e0e0e0", background: "#fafafa", display: "flex", gap: "8px", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={() => setPhase({ kind: "annotate" })}
              style={{
                background: "#1e3a5f",
                color: "white",
                border: "none",
                padding: "6px 12px",
                borderRadius: "4px",
                fontSize: "12px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Annotate
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <OverlayLegend />
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#666",
                  cursor: "pointer",
                  fontSize: "16px",
                  padding: "4px 8px",
                }}
                title="Settings"
              >
                ⚙️
              </button>
            </div>
          </div>
          <ResultsListView
            issues={visibleIssues}
            meta={meta}
            selectedIssueId={selectedIssueId}
            hoveredNodeId={hoveredNodeId}
            focusedIssueIds={focusedIssueIds}
            onSelect={handleSelect}
            onHover={handleHover}
            onRescan={() => handleRun("page")}
          />
        </div>
      ) : phase.kind === "annotate" ? (
        <AnnotateView onBack={() => setPhase({ kind: "results" })} />
      ) : (
        <WelcomeView
          isScanning={phase.kind === "scanning"}
          progress={phase.kind === "scanning" ? phase.progress : null}
          onRun={handleRun}
        />
      )}
    </div>
  );
}

/**
 * Drop dismissed issues, sort by severity rank then by check id then by
 * node path so the order is stable across rescans, and assign 1..N indices.
 */
function sortAndIndex(issues: Issue[]): Issue[] {
  const open = issues.filter((i) => i.status !== "dismissed");
  const sorted = [...open].sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    if (a.checkId !== b.checkId) return a.checkId.localeCompare(b.checkId);
    const pa = a.nodePath.join(" / ");
    const pb = b.nodePath.join(" / ");
    return pa.localeCompare(pb);
  });
  return sorted.map((issue, i) => ({ ...issue, index: i + 1 }));
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      style={{
        background: "var(--sev-critical)",
        color: "var(--bg-primary)",
        padding: "var(--space-2) var(--space-4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-2)",
        fontSize: "var(--text-sm)",
      }}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "1px solid var(--bg-primary)",
          color: "var(--bg-primary)",
          padding: "2px var(--space-2)",
          fontSize: "var(--text-xs)",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
