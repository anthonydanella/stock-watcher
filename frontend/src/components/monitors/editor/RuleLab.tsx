import {
  CheckCircle2,
  Code2,
  FileText,
  FlaskConical,
  Loader2,
  MousePointer,
  Play
} from "lucide-react";
import React from "react";

import { api } from "../../../api";
import { errorMessage, failureTypeLabel, warningAlertClass } from "../../../lib/format";
import { cn } from "../../../lib/utils";
import type { Monitor, RuleLabResult } from "../../../types";
import { PanelCard } from "../../shared/PanelCard";
import { Alert } from "../../ui/alert";
import { Button } from "../../ui/button";
import { CardContent, CardHeader } from "../../ui/card";
import { SectionTitle } from "./EditorChrome";
import { ElementsPanel } from "./LabElementsPanel";
import { Overview } from "./LabOverview";
import { LabMetric } from "./LabPrimitives";
import { RegexPanel } from "./LabRegexPanel";
import { TextPanel } from "./LabTextPanel";
import { labPayload, labSignature, validLabUrl } from "./labShared";

type LabTab = "overview" | "text" | "elements" | "regex";

const tabs: { value: LabTab; label: string; icon: React.ElementType }[] = [
  { value: "overview", label: "Overview", icon: CheckCircle2 },
  { value: "text", label: "Text", icon: FileText },
  { value: "elements", label: "Elements", icon: MousePointer },
  { value: "regex", label: "Regex", icon: Code2 }
];

export function RuleLab({ monitor }: { monitor: Partial<Monitor> }) {
  const [result, setResult] = React.useState<RuleLabResult | null>(null);
  const [resultSignature, setResultSignature] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState<LabTab>("overview");
  const currentSignature = React.useMemo(() => labSignature(monitor), [monitor]);
  const stale = Boolean(result && resultSignature !== currentSignature);

  const ruleType = monitor.rule_type ?? "text";
  const matchMode = monitor.match_mode ?? "contains";

  const activeTabs = React.useMemo(() => {
    return tabs.filter((t) => {
      if (t.value === "overview" || t.value === "text") return true;
      if (t.value === "elements") return ruleType === "css";
      if (t.value === "regex") return matchMode === "regex";
      return false;
    });
  }, [ruleType, matchMode]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: clear error when the rule signature changes
  React.useEffect(() => {
    setError("");
  }, [currentSignature]);

  React.useEffect(() => {
    if (!activeTabs.some((t) => t.value === tab)) {
      setTab("overview");
    }
  }, [activeTabs, tab]);

  async function inspect() {
    if (!validLabUrl(monitor.url)) {
      setError("Enter a valid http(s) URL before fetching the rule lab.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api.ruleLab(labPayload(monitor));
      setResult(next);
      setResultSignature(currentSignature);
      setTab("overview");
    } catch (exc) {
      setError(errorMessage(exc, "Rule lab failed"));
    } finally {
      setBusy(false);
    }
  }

  const diagnostics = result?.diagnostics ?? null;

  const runButton = (
    <Button
      type="button"
      onClick={inspect}
      disabled={busy || !monitor.url}
      aria-busy={busy}
      size="sm"
      className="gap-1.5"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
      {busy ? "Running" : result ? "Run again" : "Run rule lab"}
    </Button>
  );

  return (
    <PanelCard>
      <CardHeader>
        <SectionTitle
          icon={FlaskConical}
          title="Rule lab"
          description="Fetch the page and verify the current draft against it."
          action={runButton}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {stale ? (
          <Alert className={warningAlertClass}>
            Draft values changed after this fetch. Run again before trusting the result.
          </Alert>
        ) : null}
        {!result && !error ? (
          <div className="rounded-md border border-dashed bg-secondary/30 p-4 text-sm text-muted-foreground">
            No result yet. Run the lab after changing selectors, operands, or regex — it uses the
            current draft values.
          </div>
        ) : null}
        {result ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <LabMetric
                label="Rule"
                value={result.matched ? "Matched" : "Missed"}
                tone={result.matched ? "success" : "error"}
              />
              <LabMetric
                label="HTTP"
                value={result.fetch.status_code ? String(result.fetch.status_code) : "No response"}
              />
              <LabMetric label="Fetch" value={`${result.fetch.duration_ms} ms`} />
              <LabMetric label="Payload" value={formatBytes(result.fetch.content_length)} />
              {result.fetch.error_type ? (
                <LabMetric
                  label="Failure"
                  value={failureTypeLabel(result.fetch.error_type)}
                  tone="error"
                />
              ) : null}
            </div>

            <div className="flex gap-1 overflow-x-auto rounded-md border bg-secondary/30 p-1">
              {activeTabs.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-2 rounded px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
                      tab === item.value && "bg-background text-foreground shadow-sm"
                    )}
                    onClick={() => setTab(item.value)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            {tab === "overview" ? <Overview result={result} /> : null}
            {tab === "text" ? <TextPanel diagnostics={diagnostics} /> : null}
            {tab === "elements" ? <ElementsPanel diagnostics={diagnostics} /> : null}
            {tab === "regex" ? <RegexPanel diagnostics={diagnostics} /> : null}
          </>
        ) : null}
      </CardContent>
    </PanelCard>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
