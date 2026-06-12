import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CheckId, Issue, Severity } from "@shared/types/Issue";
import type { OverlayPaintItem, ScanScope } from "@shared/types/Message";
import { suggestContrastFix } from "@shared/wcag/contrast-fix";
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
  const [fixPanelOpen, setFixPanelOpen] = useState(false);
  const [applyingBatch, setApplyingBatch] = useState(false);
  // Whether the in-flight batch came from the proposals panel (triggers a
  // verification re-scan) vs a single drawer fix (stays in place).
  const batchFromPanelRef = useRef(false);

  // Grouped + sorted + indexed view of the current issues: identical
  // findings across instances of the same component collapse into one row.
  // Dismissed issues stay in the model but disappear from list and canvas.
  const visibleIssues = useMemo(() => sortAndIndex(issues), [issues]);

  const dismissedCount = useMemo(
    () => issues.filter((i) => i.status === "dismissed").length,
    [issues],
  );

  // Everything the plugin knows how to fix, precomputed as a reviewable
  // batch — the proactive half of the audit.
  const proposals = useMemo(() => buildFixProposals(visibleIssues), [visibleIssues]);

  // Whenever the visible set changes, push the canvas dots back in sync.
  // Every member of a group gets a dot carrying the group's number, so 40
  // instances of the same broken button all point at the same list row.
  useEffect(() => {
    if (phase.kind !== "results") return;
    const items: OverlayPaintItem[] = visibleIssues.flatMap((i) =>
      (i.groupMembers ?? [{ issueId: i.id, nodeId: i.nodeId }]).map((m) => ({
        issueId: m.issueId,
        nodeId: m.nodeId,
        severity: i.severity,
        index: i.index ?? 0,
      })),
    );
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
        case "batch-fix-complete":
          setApplyingBatch(false);
          setFixPanelOpen(false);
          if (msg.failed > 0) {
            setError(`BATCH_PARTIAL: ${msg.applied} applied, ${msg.failed} failed.`);
          }
          // Panel batches get a verification re-scan: the list must reflect
          // what the file actually looks like now, not what we assume.
          if (batchFromPanelRef.current) {
            batchFromPanelRef.current = false;
            handleRun("page");
          }
          return;
        case "error":
          setError(`${msg.code}: ${msg.message}`);
          return;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // A fix on a grouped row applies to every member: fixing 1 of 40
  // identical instances would be a lie of omission.
  const handleApplyFix = useCallback(
    (issueId: string, checkId: CheckId, params: Record<string, unknown>) => {
      const rep = visibleIssues.find((i) => i.id === issueId);
      const members = rep?.groupMembers ?? [{ issueId, nodeId: "" }];
      batchFromPanelRef.current = false;
      send({
        type: "apply-fix-batch",
        items: members.map((m) => ({ issueId: m.issueId, checkId, params })),
      });
    },
    [visibleIssues],
  );

  const handleDismiss = useCallback(
    (issueId: string) => {
      const rep = visibleIssues.find((i) => i.id === issueId);
      const memberIds = rep?.groupMembers?.map((m) => m.issueId) ?? [issueId];
      const idSet = new Set(memberIds);
      setIssues((prev) =>
        prev.map((i) => (idSet.has(i.id) ? { ...i, status: "dismissed" } : i)),
      );
      setSelectedIssueId(null);
      for (const id of memberIds) send({ type: "dismiss-issue", issueId: id });
    },
    [visibleIssues],
  );

  const handleApplyAll = useCallback(() => {
    if (proposals.items.length === 0) return;
    batchFromPanelRef.current = true;
    setApplyingBatch(true);
    send({ type: "apply-fix-batch", items: proposals.items });
  }, [proposals]);

  const handleRestoreDismissed = useCallback(() => {
    send({ type: "restore-dismissed" });
    handleRun("page");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedIssue = useMemo(
    () => visibleIssues.find((i) => i.id === selectedIssueId) ?? null,
    [visibleIssues, selectedIssueId],
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

          {proposals.items.length > 0 && (
            <div
              style={{
                padding: "8px 16px",
                borderBottom: "1px solid #e0e0e0",
                background: "#FFFDF2",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "12px" }}>
                  ⚡ <strong>{proposals.items.length} proposed change{proposals.items.length === 1 ? "" : "s"}</strong>{" "}
                  ready to apply
                </span>
                <button
                  onClick={() => setFixPanelOpen((v) => !v)}
                  style={{
                    background: "none",
                    border: "1px solid #1e3a5f",
                    color: "#1e3a5f",
                    padding: "3px 10px",
                    fontSize: "11px",
                    cursor: "pointer",
                    borderRadius: "4px",
                  }}
                >
                  {fixPanelOpen ? "Hide" : "Review"}
                </button>
              </div>

              {fixPanelOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "18px",
                      fontSize: "12px",
                      lineHeight: 1.6,
                    }}
                  >
                    {proposals.summary.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      onClick={handleApplyAll}
                      disabled={applyingBatch}
                      style={{
                        background: "#1e3a5f",
                        color: "#fff",
                        border: "none",
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                        borderRadius: "4px",
                      }}
                    >
                      {applyingBatch ? "Applying..." : "Apply all & re-audit"}
                    </button>
                    <span style={{ fontSize: "11px", color: "#666" }}>
                      One undo step reverts everything.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {dismissedCount > 0 && (
            <div
              style={{
                padding: "4px 16px",
                fontSize: "11px",
                color: "#666",
                borderBottom: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                {dismissedCount} dismissed finding{dismissedCount === 1 ? "" : "s"} hidden
                (remembered in this file)
              </span>
              <button
                onClick={handleRestoreDismissed}
                style={{
                  background: "none",
                  border: "none",
                  color: "#1e3a5f",
                  cursor: "pointer",
                  fontSize: "11px",
                  textDecoration: "underline",
                }}
              >
                Restore
              </button>
            </div>
          )}

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
 * Group, sort, index.
 *
 * Grouping: issues on nodes inside instances of the same main component,
 * with the same check and identical message (same colors/sizes — overridden
 * instances differ and correctly stay separate), collapse into one row. The
 * first member acts as representative; groupMembers carries the full set so
 * dismiss/fix/overlay can fan out. Then drop dismissed, sort by severity
 * rank / check id / node path, and assign 1..N indices.
 */
function sortAndIndex(issues: Issue[]): Issue[] {
  const open = issues.filter((i) => i.status !== "dismissed");

  const groups = new Map<string, Issue[]>();
  for (const issue of open) {
    const key = issue.componentId
      ? `${issue.checkId}::${issue.componentId}::${issue.message}`
      : issue.id;
    const bucket = groups.get(key);
    if (bucket) bucket.push(issue);
    else groups.set(key, [issue]);
  }

  const reps: Issue[] = [];
  for (const members of groups.values()) {
    const rep = members[0]!;
    reps.push({
      ...rep,
      // A group is "resolved" only when every member is.
      status: members.every((m) => m.status === "resolved")
        ? "resolved"
        : rep.status,
      groupCount: members.length,
      groupMembers: members.map((m) => ({ issueId: m.id, nodeId: m.nodeId })),
    });
  }

  const sorted = reps.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    if (a.checkId !== b.checkId) return a.checkId.localeCompare(b.checkId);
    const pa = a.nodePath.join(" / ");
    const pb = b.nodePath.join(" / ");
    return pa.localeCompare(pb);
  });
  return sorted.map((issue, i) => ({ ...issue, index: i + 1 }));
}

/**
 * Precompute every fix the plugin knows how to apply, as a reviewable batch:
 * contrast recolors (with the exact target hex), missing focus variants,
 * weak focus indicators. Returns the flat batch items plus human-readable
 * summary lines for the proposals panel.
 */
function buildFixProposals(groups: Issue[]): {
  items: Array<{ issueId: string; checkId: CheckId; params: Record<string, unknown> }>;
  summary: string[];
} {
  const items: Array<{
    issueId: string;
    checkId: CheckId;
    params: Record<string, unknown>;
  }> = [];
  let recolors = 0;
  let variants = 0;
  let indicators = 0;

  for (const g of groups) {
    if (g.status !== "open") continue;
    const members = g.groupMembers ?? [{ issueId: g.id, nodeId: g.nodeId }];

    if (g.checkId === "01-text-contrast") {
      const fg = g.details["textColor"];
      const bg = g.details["backgroundColor"];
      const threshold = g.details["threshold"];
      if (
        typeof fg === "string" &&
        typeof bg === "string" &&
        typeof threshold === "number"
      ) {
        try {
          const fix = suggestContrastFix(fg, bg, threshold);
          if (fix) {
            for (const m of members) {
              items.push({
                issueId: m.issueId,
                checkId: g.checkId,
                params: { targetHex: fix.hex },
              });
            }
            recolors += members.length;
          }
        } catch {
          // No reachable color — leave it as a manual finding.
        }
      }
    } else if (g.checkId === "05-focus-defined") {
      for (const m of members) {
        items.push({ issueId: m.issueId, checkId: g.checkId, params: {} });
      }
      variants += members.length;
    } else if (g.checkId === "06-focus-visibility") {
      for (const m of members) {
        items.push({ issueId: m.issueId, checkId: g.checkId, params: {} });
      }
      indicators += members.length;
    }
  }

  const summary: string[] = [];
  if (recolors > 0) {
    summary.push(
      `Recolor ${recolors} text${recolors === 1 ? "" : "s"} to meet contrast (hue-preserving)`,
    );
  }
  if (variants > 0) {
    summary.push(
      `Create ${variants} missing Focus variant${variants === 1 ? "" : "s"} (with visible ring)`,
    );
  }
  if (indicators > 0) {
    summary.push(
      `Strengthen ${indicators} weak focus indicator${indicators === 1 ? "" : "s"}`,
    );
  }
  return { items, summary };
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
