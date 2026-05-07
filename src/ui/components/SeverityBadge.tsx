import type { Severity } from "@shared/types/Issue";

const COLORS: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  serious: "var(--sev-serious)",
  moderate: "var(--sev-moderate)",
  minor: "var(--sev-minor)",
};

export function SeverityDot({ severity }: { severity: Severity }) {
  return (
    <span
      aria-label={severity}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: COLORS[severity],
        flex: "0 0 auto",
      }}
    />
  );
}

export function SeverityLabel({ severity }: { severity: Severity }) {
  return (
    <span
      className="mono-label"
      style={{ color: COLORS[severity] }}
    >
      {severity}
    </span>
  );
}
