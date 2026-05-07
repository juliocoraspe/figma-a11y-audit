import { useCallback, useEffect, useState } from "react";
import type { Issue } from "@shared/types/Issue";
import type { ScanScope } from "@shared/types/Message";
import { send, subscribe } from "@ui/services/bridge";
import { WelcomeView } from "@ui/views/WelcomeView";
import { ResultsListView } from "@ui/views/ResultsListView";

type Phase =
  | { kind: "welcome" }
  | { kind: "scanning"; progress: { current: number; total: number; checkRunning: string } | null }
  | { kind: "results"; issues: Issue[]; meta: { totalNodes: number; durationMs: number } | null };

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "welcome" });
  const [error, setError] = useState<string | null>(null);
  const [focusedIssueIds, setFocusedIssueIds] = useState<string[]>([]);

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
          setPhase({
            kind: "results",
            issues: msg.issues,
            meta: msg.meta,
          });
          return;
        case "scan-cancelled":
          setPhase({ kind: "welcome" });
          return;
        case "node-focused":
          setFocusedIssueIds(msg.issueIds);
          return;
        case "error":
          setError(`${msg.code}: ${msg.message}`);
          setPhase({ kind: "welcome" });
          return;
      }
    });
  }, []);

  const handleRun = useCallback((scope: ScanScope) => {
    setError(null);
    setFocusedIssueIds([]);
    setPhase({ kind: "scanning", progress: null });
    send({ type: "scan-request", scope });
  }, []);

  const handleJump = useCallback((nodeId: string) => {
    send({ type: "jump-to-node", nodeId });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      {phase.kind === "results" ? (
        <ResultsListView
          issues={phase.issues}
          meta={phase.meta}
          focusedIssueIds={focusedIssueIds}
          onJump={handleJump}
          onRescan={() => handleRun("page")}
        />
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
