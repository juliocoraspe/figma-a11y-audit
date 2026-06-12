import { useMemo, useState } from "react";
import type { CheckId, Issue, Severity } from "@shared/types/Issue";
import { suggestContrastFix } from "@shared/wcag/contrast-fix";
import { wcagFor } from "@shared/wcag/criteria";
import { SeverityLabel } from "@ui/components/SeverityBadge";

interface Props {
  issue: Issue;
  onBack: () => void;
  onJump: (nodeId: string) => void;
  onApplyFix: (issueId: string, checkId: CheckId, params: Record<string, unknown>) => void;
  onDismiss: (issueId: string) => void;
}

const SEVERITY_BG: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  serious: "var(--sev-serious)",
  moderate: "var(--sev-moderate)",
  minor: "var(--sev-minor)",
};

export function DetailDrawer({
  issue,
  onBack,
  onJump,
  onApplyFix,
  onDismiss,
}: Props) {
  const wcag = wcagFor(issue.checkId);
  const [showWhy, setShowWhy] = useState(false);
  const fixSuggestion = useMemo(() => computeFixSuggestion(issue), [issue]);
  const actionFixLabel = actionFixLabelFor(issue.checkId);
  const isResolved = issue.status === "resolved";
  const isDismissed = issue.status === "dismissed";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-primary)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--border-faint)",
        }}
      >
        <button
          onClick={onBack}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--ink-primary)",
            padding: "4px var(--space-2)",
            fontSize: "var(--text-sm)",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
      </header>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-4) var(--space-4) var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <Section>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <SeverityChip severity={issue.severity} />
            {isResolved ? <ChipBadge label="resolved" tone="resolved" /> : null}
            {isDismissed ? <ChipBadge label="dismissed" tone="muted" /> : null}
          </div>
          <h2
            className="display"
            style={{
              margin: 0,
              fontSize: "var(--text-lg)",
              lineHeight: 1.25,
              color: "var(--ink-primary)",
            }}
          >
            {titleFor(issue.checkId)}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-sm)",
              color: "var(--ink-secondary)",
            }}
          >
            {issue.message}
          </p>
          <span className="mono-label">
            WCAG {wcag.number} · Level {wcag.level} · {wcag.title}
          </span>
        </Section>

        <Divider />

        <Section heading="LOCATION">
          <span style={{ fontSize: "var(--text-sm)", color: "var(--ink-primary)" }}>
            {issue.nodePath.length ? issue.nodePath.join(" / ") : "(unnamed)"}
          </span>
          <button
            onClick={() => onJump(issue.nodeId)}
            style={{
              alignSelf: "flex-start",
              border: "none",
              background: "transparent",
              padding: 0,
              color: "var(--accent-blueprint)",
              cursor: "pointer",
              fontSize: "var(--text-sm)",
              textDecoration: "underline",
            }}
          >
            Jump to canvas →
          </button>
        </Section>

        <Section heading="DETAILS">
          <DetailRows checkId={issue.checkId} details={issue.details} />
        </Section>

        {fixSuggestion ? (
          <>
            <Section heading="PREVIEW">
              <ContrastPreview
                fg={String(issue.details["textColor"] ?? "#000000")}
                bg={String(issue.details["backgroundColor"] ?? "#FFFFFF")}
                suggestedHex={fixSuggestion.hex}
                currentRatio={Number(issue.details["ratio"] ?? 0)}
                suggestedRatio={fixSuggestion.ratio}
              />
            </Section>

            <Section heading="SUGGESTED FIX">
              <span style={{ fontSize: "var(--text-sm)", color: "var(--ink-primary)" }}>
                Change text color to{" "}
                <span style={{ fontFamily: "var(--font-mono)" }}>{fixSuggestion.hex}</span>{" "}
                <span style={{ color: "var(--ink-tertiary)" }}>
                  (preserves hue, ratio {fixSuggestion.ratio.toFixed(2)}:1)
                </span>
              </span>
            </Section>
          </>
        ) : (
          <Section heading="SUGGESTED FIX">
            <span style={{ fontSize: "var(--text-sm)", color: "var(--ink-primary)" }}>
              {issue.fix?.suggestion ?? "Manual fix required."}
            </span>
          </Section>
        )}

        <Section>
          <button
            onClick={() => setShowWhy((v) => !v)}
            style={{
              alignSelf: "flex-start",
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <span className="mono-label">{showWhy ? "▾" : "▸"} WHY THIS MATTERS</span>
          </button>
          {showWhy ? (
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-sm)",
                color: "var(--ink-secondary)",
                lineHeight: 1.5,
              }}
            >
              {whyMatters(issue.checkId)}
            </p>
          ) : null}
        </Section>
      </div>

      <footer
        style={{
          display: "flex",
          gap: "var(--space-2)",
          padding: "var(--space-3) var(--space-4)",
          borderTop: "1px solid var(--border-faint)",
        }}
      >
        {fixSuggestion && !isResolved ? (
          <button
            className="primary"
            style={{ flex: 1 }}
            onClick={() =>
              onApplyFix(issue.id, issue.checkId, { targetHex: fixSuggestion.hex })
            }
          >
            Apply fix
          </button>
        ) : null}
        {actionFixLabel && !isResolved ? (
          <button
            className="primary"
            style={{ flex: 1 }}
            onClick={() => onApplyFix(issue.id, issue.checkId, {})}
          >
            {actionFixLabel}
          </button>
        ) : null}
        {!isDismissed ? (
          <button
            style={{ flex: fixSuggestion && !isResolved ? "0 0 auto" : 1 }}
            onClick={() => onDismiss(issue.id)}
          >
            Dismiss
          </button>
        ) : null}
      </footer>
    </div>
  );
}

// ---------- subcomponents ----------

function Section({
  heading,
  children,
}: {
  heading?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      {heading ? <span className="mono-label">{heading}</span> : null}
      {children}
    </section>
  );
}

function Divider() {
  return (
    <div
      role="separator"
      style={{
        height: 1,
        background: "var(--border-faint)",
        margin: "0 calc(-1 * var(--space-4))",
      }}
    />
  );
}

function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span
      className="mono-label"
      style={{
        background: SEVERITY_BG[severity],
        color: "var(--bg-primary)",
        padding: "2px var(--space-2)",
        letterSpacing: "var(--tracking-mono)",
      }}
    >
      {severity}
    </span>
  );
}

function ChipBadge({
  label,
  tone,
}: {
  label: string;
  tone: "resolved" | "muted";
}) {
  const bg = tone === "resolved" ? "var(--sev-resolved)" : "var(--ink-tertiary)";
  return (
    <span
      className="mono-label"
      style={{
        background: bg,
        color: "var(--bg-primary)",
        padding: "2px var(--space-2)",
        letterSpacing: "var(--tracking-mono)",
      }}
    >
      {label}
    </span>
  );
}

function DetailRows({
  checkId,
  details,
}: {
  checkId: CheckId;
  details: Record<string, unknown>;
}) {
  const rows = formatDetails(checkId, details);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map(([k, v]) => (
        <div
          key={k}
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "var(--space-3)",
            fontSize: "var(--text-sm)",
          }}
        >
          <span className="mono-label" style={{ minWidth: 110 }}>
            {k}
          </span>
          <span
            style={{
              color: "var(--ink-primary)",
              fontFamily:
                typeof v === "string" && v.startsWith("#")
                  ? "var(--font-mono)"
                  : undefined,
            }}
          >
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

function ContrastPreview({
  fg,
  bg,
  suggestedHex,
  currentRatio,
  suggestedRatio,
}: {
  fg: string;
  bg: string;
  suggestedHex: string;
  currentRatio: number;
  suggestedRatio: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        border: "1px solid var(--border-faint)",
      }}
    >
      <PreviewCell
        label="CURRENT"
        bg={bg}
        fg={fg}
        ratio={currentRatio}
      />
      <PreviewCell
        label="SUGGESTED"
        bg={bg}
        fg={suggestedHex}
        ratio={suggestedRatio}
        leftBorder
      />
    </div>
  );
}

function PreviewCell({
  label,
  bg,
  fg,
  ratio,
  leftBorder,
}: {
  label: string;
  bg: string;
  fg: string;
  ratio: number;
  leftBorder?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
        padding: "var(--space-3)",
        background: bg,
        borderLeft: leftBorder ? "1px solid var(--border-faint)" : undefined,
      }}
    >
      <span
        className="mono-label"
        style={{
          color: fg,
          opacity: 0.7,
          letterSpacing: "var(--tracking-mono)",
        }}
      >
        {label}
      </span>
      <span
        className="display"
        style={{ color: fg, fontSize: "var(--text-xl)", lineHeight: 1 }}
      >
        Aa
      </span>
      <span
        className="mono-label"
        style={{ color: fg, opacity: 0.85, letterSpacing: 0 }}
      >
        {ratio.toFixed(2)}:1
      </span>
    </div>
  );
}

// ---------- helpers ----------

function titleFor(checkId: CheckId): string {
  switch (checkId) {
    case "01-text-contrast":
      return "Text contrast too low";
    case "02-ui-contrast":
      return "Non-text contrast too low";
    case "03-tap-target":
      return "Tap target too small";
    case "04-text-size":
      return "Text size below minimum";
    case "05-focus-defined":
      return "Focus state missing";
    case "06-focus-visibility":
      return "Focus not visible enough";
  }
}

function whyMatters(checkId: CheckId): string {
  switch (checkId) {
    case "01-text-contrast":
      return "Users with low vision or color blindness rely on strong contrast to read text. A ratio below 4.5:1 makes content inaccessible to roughly 1 in 12 men and many others with vision impairments.";
    case "02-ui-contrast":
      return "Borders, icons, and focus indicators must contrast with adjacent surfaces so users can perceive them — especially with magnification, glare, or low-quality displays.";
    case "03-tap-target":
      return "Small targets cause mis-taps for everyone but disproportionately for users with motor impairments. 24×24px is the WCAG 2.5.8 minimum; 44×44px is the recommended comfortable size.";
    case "04-text-size":
      return "Text below 12px is hard to read, especially for users with low vision or on smaller screens. Larger sizes also improve comprehension and reduce eye strain.";
    case "05-focus-defined":
      return "Keyboard users move through interactive elements with Tab. Without a visible focus indicator they can't tell where they are — one of the top accessibility failures in production.";
    case "06-focus-visibility":
      return "A focus indicator must be visible — thin, low-contrast, or hidden by overflow defeats its purpose. 2px thickness with 3:1 contrast ensures it's always clear.";
  }
}

function formatDetails(
  checkId: CheckId,
  details: Record<string, unknown>,
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  switch (checkId) {
    case "01-text-contrast": {
      out.push(["Text", String(details["textColor"] ?? "—")]);
      out.push(["Background", String(details["backgroundColor"] ?? "—")]);
      const ratio = details["ratio"];
      out.push([
        "Current ratio",
        typeof ratio === "number" ? `${ratio.toFixed(2)} : 1` : "n/a (over media)",
      ]);
      out.push([
        "Required",
        `${Number(details["threshold"] ?? 0).toFixed(1)} : 1 (AA)`,
      ]);
      out.push([
        "Size",
        `${details["fontSize"]}px ${details["isLarge"] ? "(large)" : "(normal)"}`,
      ]);
      break;
    }
    case "02-ui-contrast": {
      out.push(["Element type", String(details["elementType"] ?? "—")]);
      out.push(["Element color", String(details["elementColor"] ?? "—")]);
      out.push(["Background", String(details["backgroundColor"] ?? "—")]);
      const ratio = details["ratio"];
      out.push([
        "Current ratio",
        typeof ratio === "number" ? `${ratio.toFixed(2)} : 1` : "n/a (over media)",
      ]);
      out.push([
        "Required",
        `${Number(details["threshold"] ?? 0).toFixed(1)} : 1 (AA)`,
      ]);
      if (typeof details["strokeWeight"] === "number") {
        out.push(["Stroke weight", `${details["strokeWeight"]} px`]);
      }
      break;
    }
    case "03-tap-target":
      out.push([
        "Size",
        `${details["width"]} × ${details["height"]} px`,
      ]);
      out.push(["Min dimension", `${details["minDimension"]} px`]);
      out.push([
        "Spacing",
        details["spacing"] == null ? "no neighbors" : `${details["spacing"]} px`,
      ]);
      out.push([
        "Required",
        `${details["thresholdAA"]} px (AA), ${details["thresholdAAA"]} px (AAA)`,
      ]);
      break;
    case "04-text-size":
      out.push(["Font size", `${details["fontSize"]} px`]);
      out.push([
        "Recommended min",
        `${details["recommendedMin"]} px`,
      ]);
      out.push(["Hard floor", `${details["hardFloor"]} px`]);
      if (details["exceptionApplies"]) {
        out.push(["Exception", "legal/disclaimer/caption — floor lowered"]);
      }
      if (typeof details["characters"] === "string" && details["characters"]) {
        out.push(["Segment", `"${details["characters"]}"`]);
      }
      break;
    case "05-focus-defined":
      out.push([
        "Existing variants",
        String(details["existingVariants"] ?? "—"),
      ]);
      if (details["suggestedProperty"]) {
        out.push(["Suggested prop", String(details["suggestedProperty"])]);
      }
      break;
    case "06-focus-visibility":
      out.push([
        "Focus variant",
        String(details["focusVariant"] ?? "—"),
      ]);
      if (details["baselineVariant"]) {
        out.push([
          "Compared with",
          String(details["baselineVariant"]),
        ]);
      }
      if (typeof details["thickness"] === "number") {
        out.push([
          "Indicator thickness",
          `${details["thickness"]} px (needs ${details["thicknessThreshold"]} px)`,
        ]);
      }
      if (details["indicatorColor"]) {
        out.push(["Indicator color", String(details["indicatorColor"])]);
      }
      if (typeof details["indicatorContrast"] === "number") {
        out.push([
          "Indicator contrast",
          `${(details["indicatorContrast"] as number).toFixed(2)} : 1 (needs ${Number(details["contrastThreshold"]).toFixed(1)} : 1)`,
        ]);
      }
      if (details["backgroundColor"]) {
        out.push(["Background", String(details["backgroundColor"])]);
      }
      break;
    default:
      for (const [k, v] of Object.entries(details)) {
        out.push([k, JSON.stringify(v)]);
      }
  }
  return out;
}

/**
 * Checks whose fix is an action on canvas rather than a computed value.
 * 05 clones the Default variant into a styled Focus variant inside the
 * component set; 06 strengthens the existing-but-weak focus indicator.
 */
function actionFixLabelFor(checkId: CheckId): string | null {
  switch (checkId) {
    case "05-focus-defined":
      return "Create focus variant";
    case "06-focus-visibility":
      return "Strengthen indicator";
    default:
      return null;
  }
}

function computeFixSuggestion(issue: Issue): {
  hex: string;
  ratio: number;
} | null {
  if (issue.checkId !== "01-text-contrast") return null;
  if (issue.status === "resolved") return null;
  const fg = issue.details["textColor"];
  const bg = issue.details["backgroundColor"];
  const threshold = issue.details["threshold"];
  if (typeof fg !== "string" || typeof bg !== "string" || typeof threshold !== "number") {
    return null;
  }
  try {
    const result = suggestContrastFix(fg, bg, threshold);
    return result ? { hex: result.hex, ratio: result.ratio } : null;
  } catch {
    return null;
  }
}
