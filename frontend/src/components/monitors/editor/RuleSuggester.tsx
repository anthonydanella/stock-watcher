import { Check, Loader2, Sparkles, X } from "lucide-react";
import React from "react";

import { api } from "../../../api";
import { errorMessage } from "../../../lib/format";
import type { Monitor, RuleSuggestion } from "../../../types";
import { Alert } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";

export function RuleSuggester({
  monitor,
  configured,
  onApply,
  className
}: {
  monitor: Partial<Monitor>;
  configured: boolean;
  onApply: (suggestion: RuleSuggestion) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [hint, setHint] = React.useState("");
  const [otherState, setOtherState] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [suggestion, setSuggestion] = React.useState<RuleSuggestion | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const quantityMode = (monitor.stock_mode ?? "binary") === "quantity";

  React.useEffect(() => {
    if (!open) return;
    function handle(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function generate() {
    if (!validUrl(monitor.url)) {
      setError("Set a valid product URL on the monitor first.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await api.suggestRule({
        url: monitor.url ?? "",
        hint,
        other_state_sample: quantityMode ? otherState : "",
        stock_mode: monitor.stock_mode ?? "binary",
        rule_type: monitor.rule_type ?? "text",
        selector_or_path: monitor.selector_or_path ?? "",
        user_agent_mode: monitor.user_agent_mode ?? "random",
        timeout_seconds: monitor.timeout_seconds ?? 20
      });
      setSuggestion(result);
    } catch (exc) {
      setError(errorMessage(exc, "AI rule suggestion failed"));
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!suggestion) return;
    onApply(suggestion);
    setOpen(false);
    setSuggestion(null);
    setHint("");
    setOtherState("");
  }

  const disabledReason = configured
    ? ""
    : "Set up an LLM API key and model in Settings to enable AI rule suggestions.";

  return (
    <div ref={containerRef} className={className}>
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        title={disabledReason || "Fetch the live page and ask an LLM to draft a full rule"}
        disabled={!configured}
        className="gap-1.5"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Configure rule with AI
      </Button>
      {open ? (
        <div className="mt-3 w-full min-w-0 space-y-3 rounded-md border bg-card p-3 shadow-sm">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="ai-rule-hint">
              What do you want to track?
            </label>
            <Textarea
              id="ai-rule-hint"
              value={hint}
              onChange={(event) => setHint(event.target.value)}
              placeholder="e.g. notify me when this drops back in stock, or alert when fewer than 3 units remain"
              rows={3}
            />
          </div>
          {quantityMode ? (
            <div className="space-y-2">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="ai-rule-other-state"
              >
                Text shown in the other stock state (optional)
              </label>
              <Textarea
                id="ai-rule-other-state"
                value={otherState}
                onChange={(event) => setOtherState(event.target.value)}
                placeholder={
                  "If configuring while out of stock, paste the in-stock text — one per line:\n5 in stock now\n120 in stock now"
                }
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                The page can only be fetched in its current state. Paste the wording from the
                opposite state and the quantity regex is verified to cover both.
              </p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Live-fetches the page and shares the cleaned HTML with the LLM, which drafts the
            extractor, target, and matching rule for you to review.
          </p>
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          {suggestion ? (
            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/40">
              <SuggestionRow
                label="Extractor"
                value={`${suggestion.rule_type}${suggestion.selector_or_path ? ` · ${suggestion.selector_or_path}` : ""}`}
              />
              {suggestion.stock_mode === "binary" ? (
                <SuggestionRow
                  label="Assertion"
                  value={`${suggestion.match_mode}${suggestion.match_value ? ` "${suggestion.match_value}"` : ""}`}
                />
              ) : null}
              {suggestion.stock_mode === "quantity" ? (
                <>
                  {suggestion.quantity_pattern ? (
                    <SuggestionRow
                      label="Quantity regex"
                      value={`/${suggestion.quantity_pattern}/`}
                      mono
                    />
                  ) : (
                    <SuggestionRow label="Quantity regex" value="(use first number)" mono />
                  )}
                  <SuggestionRow
                    label="Low threshold"
                    value={
                      suggestion.low_stock_threshold != null
                        ? `≤ ${suggestion.low_stock_threshold}`
                        : "Not set"
                    }
                  />
                </>
              ) : null}
              {suggestion.explanation ? (
                <p className="border-t border-emerald-200/60 pt-2 text-xs text-emerald-900/80 dark:border-emerald-900/40 dark:text-emerald-200/80">
                  {suggestion.explanation}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={apply} className="gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Apply
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSuggestion(null)}
                  className="gap-1.5"
                >
                  <X className="h-3.5 w-3.5" />
                  Discard
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={generate}
                disabled={busy}
                className="gap-1.5"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {busy ? "Fetching & drafting" : "Generate"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setError("");
                  setHint("");
                  setOtherState("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SuggestionRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-xs">
      <span className="text-emerald-900/70 dark:text-emerald-200/70">{label}</span>
      <span
        className={
          mono
            ? "break-all font-mono text-emerald-900 dark:text-emerald-200"
            : "break-words text-emerald-900 dark:text-emerald-200"
        }
      >
        {value}
      </span>
    </div>
  );
}

function validUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
