import { Check, Copy, Search } from "lucide-react";
import React from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export type EvidenceHighlightMode = "text" | "regex";

type EvidenceField = {
  label: string;
  value: string;
  tone?: "default" | "warning" | "error";
};

export function EvidenceViewer({
  value,
  fields = [],
  primaryLabel = "Evidence",
  emptyMessage = "No evidence recorded.",
  initialQuery = "",
  initialMode = "text",
  externalQuery,
  searchable = true,
  searchPlaceholder = "Search evidence",
  className,
  bodyClassName
}: {
  value: string;
  fields?: EvidenceField[];
  primaryLabel?: string;
  emptyMessage?: string;
  initialQuery?: string;
  initialMode?: EvidenceHighlightMode;
  externalQuery?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  bodyClassName?: string;
}) {
  const [localQuery, setLocalQuery] = React.useState(initialQuery);
  const [mode, setMode] = React.useState<EvidenceHighlightMode>(initialMode);
  const [wrapped, setWrapped] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const query = externalQuery ?? localQuery;
  const visibleFields = fields.filter((field) => field.value.trim());
  const hasValue = Boolean(value.trim());
  const stats = textStats(value);
  const matcher = React.useMemo(() => createMatcher(query, mode), [query, mode]);
  const matchCount = React.useMemo(
    () =>
      [value, ...visibleFields.map((field) => field.value)].reduce(
        (total, item) => total + matcher.ranges(item).length,
        0
      ),
    [matcher, value, visibleFields]
  );

  React.useEffect(() => {
    setLocalQuery(initialQuery);
    setMode(initialMode);
  }, [initialMode, initialQuery]);

  async function copyText() {
    const fieldText = visibleFields.map((field) => `${field.label}\n${field.value}`).join("\n\n");
    const bodyText = hasValue ? `${primaryLabel}\n${value}` : "";
    const text = [fieldText, bodyText].filter(Boolean).join("\n\n") || emptyMessage;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{stats.characters.toLocaleString()} chars</span>
          <span>{stats.words.toLocaleString()} words</span>
          <span>{stats.lines.toLocaleString()} lines</span>
          {query.trim() ? (
            <span className={matcher.error ? "text-destructive" : "text-foreground"}>
              {matcher.error ? matcher.error : `${matchCount.toLocaleString()} matches`}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWrapped((current) => !current)}
          >
            {wrapped ? "No wrap" : "Wrap"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={copyText}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      {searchable && externalQuery === undefined ? (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 font-mono"
              value={localQuery}
              onChange={(event) => setLocalQuery(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
          <div className="flex rounded-md border bg-secondary/30 p-1">
            {(["text", "regex"] as const).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                className={cn(
                  "h-8 rounded px-3 text-xs font-medium capitalize text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
                  mode === nextMode && "bg-background text-foreground shadow-sm"
                )}
                onClick={() => setMode(nextMode)}
              >
                {nextMode}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {visibleFields.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {visibleFields.map((field) => (
            <div
              key={field.label}
              className={cn(
                "min-w-0 rounded-md border bg-background p-3",
                field.tone === "warning" && "border-warning-subtle bg-warning-subtle",
                field.tone === "error" && "border-danger-subtle bg-danger-subtle"
              )}
            >
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                {field.label}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-5 wrap-break-word">
                <HighlightedText value={field.value} query={query} mode={mode} />
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          "overflow-auto rounded-md border bg-background p-4",
          bodyClassName ?? "max-h-128"
        )}
      >
        <p className="mb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">
          {primaryLabel}
        </p>
        {hasValue ? (
          <pre
            className={cn(
              "font-mono text-sm leading-6 text-foreground",
              wrapped ? "whitespace-pre-wrap wrap-break-word" : "whitespace-pre"
            )}
          >
            <HighlightedText value={value} query={query} mode={mode} />
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}

export function HighlightedText({
  value,
  query,
  mode = "text"
}: {
  value: string;
  query: string;
  mode?: EvidenceHighlightMode;
}) {
  const matcher = React.useMemo(() => createMatcher(query, mode), [mode, query]);
  const ranges = matcher.ranges(value);
  if (!ranges.length) return <>{value}</>;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range) => {
    if (range.start > cursor) nodes.push(value.slice(cursor, range.start));
    nodes.push(
      <mark key={`${range.start}-${range.end}`} className="rounded mark-warning px-0.5">
        {value.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return <>{nodes}</>;
}

function createMatcher(query: string, mode: EvidenceHighlightMode) {
  const trimmed = query.trim();
  if (!trimmed) return { error: "", ranges: () => [] as TextRange[] };
  if (mode === "regex") {
    try {
      const regex = new RegExp(trimmed, "gim");
      return { error: "", ranges: (value: string) => regexRanges(value, regex) };
    } catch (exc) {
      return {
        error: exc instanceof Error ? exc.message : "Invalid regex",
        ranges: () => [] as TextRange[]
      };
    }
  }
  return { error: "", ranges: (value: string) => literalRanges(value, trimmed) };
}

type TextRange = {
  start: number;
  end: number;
};

function literalRanges(value: string, query: string): TextRange[] {
  const ranges: TextRange[] = [];
  const haystack = value.toLowerCase();
  const needle = query.toLowerCase();
  let cursor = 0;
  while (cursor < haystack.length) {
    const start = haystack.indexOf(needle, cursor);
    if (start === -1) break;
    ranges.push({ start, end: start + needle.length });
    cursor = start + needle.length;
    if (ranges.length >= 500) break;
  }
  return ranges;
}

function regexRanges(value: string, regex: RegExp): TextRange[] {
  const ranges: TextRange[] = [];
  regex.lastIndex = 0;
  let match = regex.exec(value);
  while (match) {
    const text = match[0];
    if (text.length) {
      ranges.push({ start: match.index, end: match.index + text.length });
    }
    if (!text.length) regex.lastIndex += 1;
    if (ranges.length >= 500) break;
    match = regex.exec(value);
  }
  return mergeRanges(ranges);
}

function mergeRanges(ranges: TextRange[]): TextRange[] {
  return ranges.reduce<TextRange[]>((merged, range) => {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
    return merged;
  }, []);
}

function textStats(value: string) {
  const trimmed = value.trim();
  return {
    characters: value.length,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    lines: value ? value.split(/\r\n|\r|\n/).length : 0
  };
}
