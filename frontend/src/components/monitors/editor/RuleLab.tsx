import {
  CheckCircle2,
  Code2,
  FileText,
  FlaskConical,
  ImageIcon,
  Loader2,
  MousePointer,
  Play,
  XCircle
} from "lucide-react";
import React from "react";

import { api } from "../../../api";
import {
  errorMessage,
  failureTypeLabel,
  statusBadgeClass,
  warningAlertClass
} from "../../../lib/format";
import { cn } from "../../../lib/utils";
import type { Monitor, RuleLabResult } from "../../../types";
import { type EvidenceHighlightMode, EvidenceViewer } from "../../shared/EvidenceViewer";
import { PanelCard } from "../../shared/PanelCard";
import { Alert } from "../../ui/alert";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { CardContent, CardHeader } from "../../ui/card";
import { SectionTitle } from "./EditorChrome";
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

function Overview({ result }: { result: RuleLabResult }) {
  const diagnostics = result.diagnostics;
  const quantityMode = Boolean(
    diagnostics?.quantity_pattern ||
      diagnostics?.quantity_error ||
      diagnostics?.quantity !== undefined
  );
  const hasQuantity = diagnostics?.quantity != null;
  const hasScope = Boolean(diagnostics?.selector_or_path?.trim());
  // Zero-element scope is the most common cause of "Extracted text was empty" — surface it
  // explicitly so the user doesn't waste time fiddling with a regex that never ran.
  const scopeMissed = Boolean(diagnostics && hasScope && diagnostics.element_count === 0);
  const showElementsMetric = Boolean(diagnostics && (hasScope || diagnostics.rule_type === "css"));
  const showRegexHits = Boolean(diagnostics?.regex);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-3">
        {scopeMissed && diagnostics ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/40">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
              <XCircle className="h-4 w-4" />
              <span>Scope matched 0 elements</span>
            </div>
            <p className="mt-2 break-words text-sm leading-6 text-amber-900 dark:text-amber-100 [overflow-wrap:anywhere]">
              <span className="font-mono">{diagnostics.selector_or_path}</span> did not match
              anything on this page, so{" "}
              {quantityMode
                ? "the quantity regex had no text to inspect"
                : "the assertion had no text to compare against"}
              . The selector might be wrong, or the page may load that section after the initial
              render.
            </p>
          </div>
        ) : quantityMode ? (
          <div
            className={cn(
              "rounded-md border p-4",
              hasQuantity
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/40"
                : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/40"
            )}
          >
            <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
              Parsed quantity
            </p>
            <p className="mt-1 break-all font-mono text-3xl font-semibold">
              {hasQuantity ? (diagnostics?.quantity ?? "—") : "—"}
            </p>
            {diagnostics?.quantity_pattern ? (
              <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                /{diagnostics.quantity_pattern}/
              </p>
            ) : null}
            {diagnostics?.quantity_error ? (
              <p className="mt-2 break-words text-sm text-amber-900 dark:text-amber-200">
                {diagnostics.quantity_error}
              </p>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              "rounded-md border p-4",
              result.matched
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/40"
                : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/40"
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              {result.matched ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              ) : (
                <XCircle className="h-4 w-4 text-amber-800" />
              )}
              <span>{result.matched ? "Rule matched" : "Rule did not match"}</span>
            </div>
            <p className="mt-2 break-words text-sm leading-6 [overflow-wrap:anywhere]">
              {result.reason}
            </p>
          </div>
        )}
        <KeyValue label="Evidence" value={result.evidence || "-"} />
        <KeyValue label="Content type" value={result.fetch.content_type || "-"} />
        {result.fetch.screenshot_error ? (
          <Alert className={warningAlertClass}>
            Screenshot failed: {result.fetch.screenshot_error}
          </Alert>
        ) : null}
      </div>
      <div className="space-y-3">
        <MiniScreenshot result={result} />
        {diagnostics && (showElementsMetric || showRegexHits) ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {showElementsMetric ? (
              <LabMetric
                label="Elements"
                value={String(diagnostics.element_count)}
                tone={diagnostics.element_count === 0 ? "error" : undefined}
              />
            ) : null}
            {showRegexHits ? (
              <LabMetric
                label="Regex hits"
                value={String(diagnostics.regex?.match_count ?? 0)}
                tone={diagnostics.regex?.matched ? "success" : undefined}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TextPanel({ diagnostics }: { diagnostics: RuleLabResult["diagnostics"] }) {
  if (!diagnostics) return <EmptyPanel message="The rule was not evaluated." />;
  const extractedText = diagnostics.extracted_text || "";
  const regexError = diagnostics.regex && !diagnostics.regex.valid ? diagnostics.regex.error : "";
  const hasMatchContext = diagnostics.match_contexts.length > 0;
  const initialQuery = diagnostics.match_mode === "exists" ? "" : diagnostics.match_value;
  const initialMode: EvidenceHighlightMode = diagnostics.match_mode === "regex" ? "regex" : "text";
  const sourceSummary = diagnostics.extracted_text_is_excerpt
    ? hasMatchContext
      ? `Full extracted text is ${diagnostics.extracted_text_length.toLocaleString()} characters; showing the area around the rule match.`
      : `Full extracted text is ${diagnostics.extracted_text_length.toLocaleString()} characters; showing a shortened excerpt.`
    : "";
  const primaryLabel = diagnostics.extracted_text_is_excerpt
    ? hasMatchContext
      ? "Matched excerpt"
      : "Extracted text excerpt"
    : "Extracted text";

  return (
    <EvidenceViewer
      value={extractedText}
      fields={[
        { label: "Source", value: sourceSummary },
        { label: "Regex error", value: regexError, tone: "error" }
      ]}
      primaryLabel={primaryLabel}
      emptyMessage={textEmptyMessage(diagnostics)}
      initialQuery={initialQuery}
      initialMode={initialMode}
      searchPlaceholder="Search extracted text"
    />
  );
}

function ElementsPanel({ diagnostics }: { diagnostics: RuleLabResult["diagnostics"] }) {
  if (!diagnostics) return <EmptyPanel message="The rule was not evaluated." />;
  if (!diagnostics.elements.length) return <EmptyPanel message="No matched elements were found." />;
  return (
    <div className="space-y-3">
      {diagnostics.elements.map((element) => (
        <div key={element.index} className="rounded-md border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusBadgeClass("unknown")}>#{element.index}</Badge>
            <span className="font-mono text-sm">&lt;{element.tag}&gt;</span>
            {Object.entries(element.attributes).map(([key, value]) => (
              <span
                key={key}
                className="inline-block max-w-full truncate rounded bg-secondary px-2 py-1 font-mono text-xs text-muted-foreground"
              >
                {key}="{value}"
              </span>
            ))}
          </div>
          <p className="mt-3 break-words text-sm">{element.value || element.text || "-"}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              HTML
            </summary>
            <CodeBlock value={element.html} className="mt-2" />
          </details>
        </div>
      ))}
    </div>
  );
}

function RegexPanel({ diagnostics }: { diagnostics: RuleLabResult["diagnostics"] }) {
  if (!diagnostics) return <EmptyPanel message="The rule was not evaluated." />;
  if (!diagnostics.regex) return <EmptyPanel message="This assertion is not using regex." />;
  const regex = diagnostics.regex;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LabMetric
          label="Valid"
          value={regex.valid ? "Yes" : "No"}
          tone={regex.valid ? "success" : "error"}
        />
        <LabMetric
          label="Matches"
          value={String(regex.match_count)}
          tone={regex.matched ? "success" : undefined}
        />
      </div>
      {regex.error ? <Alert variant="destructive">{regex.error}</Alert> : null}
      <CodeBlock value={regex.matches.length ? regex.matches.join("\n") : "No regex matches"} />
    </div>
  );
}

function MiniScreenshot({ result }: { result: RuleLabResult }) {
  if (!result.fetch.screenshot) return <EmptyPanel message="No screenshot captured." />;
  return (
    <div className="group relative overflow-hidden rounded-md border bg-secondary transition-all hover:border-primary/50">
      <a
        href={result.fetch.screenshot}
        target="_blank"
        rel="noreferrer"
        className="block cursor-zoom-in"
        title="Click to view full screenshot in a new tab"
      >
        <img
          src={result.fetch.screenshot}
          alt="Rule lab screenshot preview"
          className="aspect-video w-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="rounded bg-black/70 px-2.5 py-1.5 text-xs font-medium text-white flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" />
            View Fullscreen
          </span>
        </div>
      </a>
    </div>
  );
}

function LabMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "success" | "error";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border bg-background p-3",
        tone === "success" &&
          "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/40",
        tone === "error" && "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/40"
      )}
    >
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-sm">{value}</p>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed bg-secondary/30 p-4 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function CodeBlock({ value, className }: { value: string; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-96 max-w-full overflow-auto rounded-md border bg-muted p-3 text-xs leading-5 text-foreground",
        className
      )}
    >
      <code>{value}</code>
    </pre>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function textEmptyMessage(diagnostics: NonNullable<RuleLabResult["diagnostics"]>) {
  if (diagnostics.selector_or_path.trim())
    return "The selector matched no readable text for this rule.";
  return "No readable text was extracted from the response.";
}
