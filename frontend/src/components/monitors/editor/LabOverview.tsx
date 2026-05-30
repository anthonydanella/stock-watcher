import { CheckCircle2, ImageIcon, XCircle } from "lucide-react";

import { warningAlertClass } from "../../../lib/format";
import { cn } from "../../../lib/utils";
import type { RuleLabResult } from "../../../types";
import { Alert } from "../../ui/alert";
import { EmptyPanel, KeyValue, LabMetric } from "./LabPrimitives";

export function Overview({ result }: { result: RuleLabResult }) {
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
