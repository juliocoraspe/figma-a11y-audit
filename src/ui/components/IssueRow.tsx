import type { Issue } from "@shared/types/Issue";
import { SeverityDot } from "./SeverityBadge";

interface Props {
  issue: Issue;
  isFocused: boolean;
  onClick: (issue: Issue) => void;
}

export function IssueRow({ issue, isFocused, onClick }: Props) {
  const path = issue.nodePath.length
    ? issue.nodePath.join(" / ")
    : "(unnamed)";

  return (
    <button
      onClick={() => onClick(issue)}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "start",
        gap: "var(--space-3)",
        width: "100%",
        textAlign: "left",
        background: isFocused ? "var(--bg-secondary)" : "transparent",
        border: "none",
        borderBottom: "1px solid var(--border-faint)",
        borderRadius: 0,
        padding: "var(--space-3) var(--space-4)",
        cursor: "pointer",
      }}
    >
      <span style={{ paddingTop: 6 }}>
        <SeverityDot severity={issue.severity} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span
          style={{
            color: "var(--ink-primary)",
            fontSize: "var(--text-sm)",
            lineHeight: 1.35,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={issue.message}
        >
          {issue.message}
        </span>
        <span
          className="mono-label"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={path}
        >
          {path}
        </span>
      </span>
      <span
        className="mono-label"
        style={{ paddingTop: 4, color: "var(--ink-tertiary)" }}
      >
        WCAG {issue.wcagCriterion}
      </span>
    </button>
  );
}
