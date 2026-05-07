import { useEffect, useMemo, useRef } from "react";
import type { Issue, Severity } from "@shared/types/Issue";
import { IssueRow } from "@ui/components/IssueRow";

interface Props {
  issues: Issue[];
  meta: { totalNodes: number; durationMs: number } | null;
  focusedIssueIds: string[];
  onJump: (nodeId: string) => void;
  onRescan: () => void;
}

const SEVERITY_ORDER: Severity[] = ["critical", "serious", "moderate", "minor"];

export function ResultsListView({
  issues,
  meta,
  focusedIssueIds,
  onJump,
  onRescan,
}: Props) {
  const counts = useMemo(() => countBySeverity(issues), [issues]);

  const listRef = useRef<HTMLDivElement>(null);
  const focusedSet = useMemo(() => new Set(focusedIssueIds), [focusedIssueIds]);

  // Best-effort: scroll the first focused row into view when selection
  // arrives from the sandbox (click-on-dot).
  useEffect(() => {
    if (focusedIssueIds.length === 0 || !listRef.current) return;
    const target = listRef.current.querySelector<HTMLElement>(
      `[data-issue-id="${focusedIssueIds[0]}"]`,
    );
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIssueIds]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <header
        style={{
          padding: "var(--space-4) var(--space-4) var(--space-3)",
          borderBottom: "1px solid var(--border-faint)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <span className="mono-label">RESULTS</span>
          {meta ? (
            <span className="mono-label" style={{ color: "var(--ink-tertiary)" }}>
              {meta.totalNodes} nodes · {meta.durationMs}ms
            </span>
          ) : null}
        </div>

        <div
          role="list"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "var(--space-2)",
          }}
        >
          {SEVERITY_ORDER.map((sev) => (
            <StatCell key={sev} severity={sev} count={counts[sev]} />
          ))}
        </div>
      </header>

      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
        }}
      >
        {issues.length === 0 ? (
          <EmptyState />
        ) : (
          issues.map((issue) => (
            <div key={issue.id} data-issue-id={issue.id}>
              <IssueRow
                issue={issue}
                isFocused={focusedSet.has(issue.id)}
                onClick={(i) => onJump(i.nodeId)}
              />
            </div>
          ))
        )}
      </div>

      <footer
        style={{
          padding: "var(--space-3) var(--space-4)",
          borderTop: "1px solid var(--border-faint)",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button onClick={onRescan}>Re-run audit</button>
      </footer>
    </div>
  );
}

function StatCell({ severity, count }: { severity: Severity; count: number }) {
  const color = `var(--sev-${severity})`;
  return (
    <div
      role="listitem"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "var(--space-2)",
        border: "1px solid var(--border-faint)",
      }}
    >
      <span
        className="display"
        style={{
          fontSize: "var(--text-xl)",
          color: count > 0 ? color : "var(--ink-tertiary)",
          lineHeight: 1,
        }}
      >
        {count}
      </span>
      <span className="mono-label" style={{ color: count > 0 ? color : undefined }}>
        {severity}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-6)",
        color: "var(--ink-secondary)",
      }}
    >
      <span className="mono-label">NO ISSUES FOUND</span>
      <p
        style={{
          margin: 0,
          fontSize: "var(--text-sm)",
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        This page passes the text-contrast check. Add more checks in
        Phase&nbsp;2 to keep auditing.
      </p>
    </div>
  );
}

function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const out: Record<Severity, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  for (const i of issues) out[i.severity]++;
  return out;
}
