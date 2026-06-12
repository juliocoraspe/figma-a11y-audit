import type { Issue } from "@shared/types/Issue";
import { SeverityDot } from "./SeverityBadge";

interface Props {
  issue: Issue;
  index: number; // 1-indexed display number, mirrors canvas dot
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (issue: Issue) => void;
  onHover: (nodeId: string | null) => void;
}

export function IssueRow({
  issue,
  index,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: Props) {
  const path = issue.nodePath.length ? issue.nodePath.join(" / ") : "(unnamed)";

  const baseBg = isSelected || isHovered ? "var(--bg-secondary)" : "transparent";
  const borderLeft = isSelected
    ? "3px solid var(--accent-blueprint)"
    : "3px solid transparent";

  return (
    <button
      onClick={() => onSelect(issue)}
      onMouseEnter={() => onHover(issue.nodeId)}
      onMouseLeave={() => onHover(null)}
      style={{
        display: "grid",
        gridTemplateColumns: "20px auto 1fr auto",
        alignItems: "start",
        gap: "var(--space-3)",
        width: "100%",
        textAlign: "left",
        background: baseBg,
        border: "none",
        borderBottom: "1px solid var(--border-faint)",
        borderLeft,
        borderRadius: 0,
        padding: "var(--space-3) var(--space-4) var(--space-3) calc(var(--space-4) - 3px)",
        cursor: "pointer",
      }}
    >
      <span
        className="mono-label"
        style={{
          paddingTop: 4,
          fontWeight: 700,
          color: "var(--ink-secondary)",
          textAlign: "right",
          letterSpacing: 0,
        }}
      >
        {index}
      </span>
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
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
          paddingTop: 4,
        }}
      >
        <span className="mono-label" style={{ color: "var(--ink-tertiary)" }}>
          WCAG {issue.wcagCriterion}
        </span>
        {(issue.groupCount ?? 1) > 1 ? (
          <span
            className="mono-label"
            style={{
              background: "var(--accent-blueprint, #1e3a5f)",
              color: "var(--bg-primary, #fff)",
              padding: "1px 6px",
              borderRadius: 7,
              letterSpacing: 0,
            }}
            title={`Same finding on ${issue.groupCount} instances of ${issue.componentName ?? "this component"}`}
          >
            ×{issue.groupCount}
          </span>
        ) : null}
      </span>
    </button>
  );
}
