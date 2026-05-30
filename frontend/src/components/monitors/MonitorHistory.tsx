import { ChevronDown, ChevronUp, Search } from "lucide-react";
import React from "react";

import {
  failureTypeLabel,
  formatDate,
  formatDuration,
  statusBadgeClass,
  statusLabel
} from "../../lib/format";
import { cn } from "../../lib/utils";
import type { CheckAttempt, Monitor } from "../../types";
import { EmptyState } from "../shared/EmptyState";
import { EvidenceViewer, HighlightedText } from "../shared/EvidenceViewer";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Table, TableCell, TableHead } from "../ui/table";

const HISTORY_PAGE_SIZE = 10;

export function MonitorHistory({
  attempts,
  monitor
}: {
  attempts: CheckAttempt[];
  monitor?: Monitor | null;
}) {
  const [visibleCount, setVisibleCount] = React.useState(HISTORY_PAGE_SIZE);
  const [expandedIds, setExpandedIds] = React.useState<Set<number>>(new Set());
  const [query, setQuery] = React.useState("");
  const showQuantity = monitor?.stock_mode === "quantity";

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset paging when the attempts list changes
  React.useEffect(() => {
    setVisibleCount(HISTORY_PAGE_SIZE);
    setExpandedIds(new Set());
  }, [attempts]);

  const matchingAttempts = React.useMemo(
    () => attempts.filter((attempt) => attemptMatchesQuery(attempt, query)),
    [attempts, query]
  );
  const visibleAttempts = matchingAttempts.slice(0, visibleCount);
  const hiddenCount = Math.max(0, matchingAttempts.length - visibleAttempts.length);
  const searching = Boolean(query.trim());

  function toggleExpanded(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <Card className="min-w-0 overflow-hidden rounded-md border border-border shadow-sm ring-0">
      <CardHeader>
        <CardTitle>Check history</CardTitle>
        <CardDescription>
          {historyDescription(
            attempts.length,
            matchingAttempts.length,
            visibleAttempts.length,
            searching
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {attempts.length ? (
          <div className="space-y-4">
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleCount(HISTORY_PAGE_SIZE);
                }}
                placeholder="Search evidence, reason, errors, status, or HTTP"
              />
            </div>

            {matchingAttempts.length ? (
              <>
                <div className="grid gap-3 lg:hidden">
                  {visibleAttempts.map((attempt) => {
                    const expanded = expandedIds.has(attempt.id);
                    return (
                      <div key={attempt.id} className="min-w-0 rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">
                              {formatDate(attempt.created_at)}
                            </p>
                            <p className="mt-1 font-medium">
                              {formatDuration(attempt.duration_ms)}
                            </p>
                          </div>
                          <Badge className={statusBadgeClass(attempt.status)}>
                            {statusLabel(attempt.status)}
                          </Badge>
                        </div>
                        <dl
                          className={cn(
                            "mt-3 grid gap-3 text-sm",
                            showQuantity ? "grid-cols-3" : "grid-cols-2"
                          )}
                        >
                          {showQuantity ? (
                            <div>
                              <dt className="text-xs font-medium text-muted-foreground">Qty</dt>
                              <dd className="font-mono tabular-nums">
                                {attempt.quantity != null ? attempt.quantity.toLocaleString() : "—"}
                              </dd>
                            </div>
                          ) : null}
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">HTTP</dt>
                            <dd>{attempt.http_status ?? "-"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">Outcome</dt>
                            <dd>{attempt.ok ? "Fetched" : "Failed"}</dd>
                          </div>
                        </dl>
                        <EvidencePreview
                          attempt={attempt}
                          expanded={expanded}
                          query={query}
                          onToggle={() => toggleExpanded(attempt.id)}
                          className="mt-3"
                        />
                        {expanded ? (
                          <AttemptEvidenceDetails
                            attempt={attempt}
                            query={query}
                            className="mt-3"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="hidden max-h-[36rem] overflow-auto rounded-md border lg:block">
                  <Table className="table-fixed">
                    <thead>
                      <tr>
                        <TableHead className="sticky top-0 z-10 w-48 bg-card">Time</TableHead>
                        <TableHead className="sticky top-0 z-10 w-36 bg-card">Status</TableHead>
                        {showQuantity ? (
                          <TableHead className="sticky top-0 z-10 w-24 bg-card text-right">
                            Qty
                          </TableHead>
                        ) : null}
                        <TableHead className="sticky top-0 z-10 w-28 bg-card">Duration</TableHead>
                        <TableHead className="sticky top-0 z-10 w-24 bg-card">HTTP</TableHead>
                        <TableHead className="sticky top-0 z-10 bg-card">Evidence</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAttempts.map((attempt) => {
                        const expanded = expandedIds.has(attempt.id);
                        return (
                          <React.Fragment key={attempt.id}>
                            <tr className={expanded ? "bg-secondary/20" : undefined}>
                              <TableCell className="whitespace-nowrap">
                                {formatDate(attempt.created_at)}
                              </TableCell>
                              <TableCell>
                                <Badge className={statusBadgeClass(attempt.status)}>
                                  {statusLabel(attempt.status)}
                                </Badge>
                              </TableCell>
                              {showQuantity ? (
                                <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                                  {attempt.quantity != null
                                    ? attempt.quantity.toLocaleString()
                                    : "—"}
                                </TableCell>
                              ) : null}
                              <TableCell className="whitespace-nowrap">
                                {formatDuration(attempt.duration_ms)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {attempt.http_status ?? "-"}
                              </TableCell>
                              <TableCell>
                                <EvidencePreview
                                  attempt={attempt}
                                  expanded={expanded}
                                  query={query}
                                  onToggle={() => toggleExpanded(attempt.id)}
                                />
                              </TableCell>
                            </tr>
                            {expanded ? (
                              <tr>
                                <TableCell
                                  colSpan={showQuantity ? 6 : 5}
                                  className="bg-secondary/10 p-4"
                                >
                                  <AttemptEvidenceDetails attempt={attempt} query={query} />
                                </TableCell>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>

                {hiddenCount || visibleAttempts.length > HISTORY_PAGE_SIZE ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-secondary/30 p-3">
                    <p className="min-w-0 text-sm text-muted-foreground">
                      {hiddenCount
                        ? `${hiddenCount} older matching attempts hidden`
                        : "All matching attempts are visible"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {visibleAttempts.length > HISTORY_PAGE_SIZE ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setVisibleCount(HISTORY_PAGE_SIZE)}
                        >
                          Collapse
                        </Button>
                      ) : null}
                      {hiddenCount ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setVisibleCount((current) => current + HISTORY_PAGE_SIZE)}
                        >
                          Show next {Math.min(HISTORY_PAGE_SIZE, hiddenCount)}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState message="No loaded attempts match this evidence search." />
            )}
          </div>
        ) : (
          <EmptyState message="Run this monitor or wait for the scheduler to record check attempts." />
        )}
      </CardContent>
    </Card>
  );
}

function EvidencePreview({
  attempt,
  expanded,
  query,
  onToggle,
  className
}: {
  attempt: CheckAttempt;
  expanded: boolean;
  query: string;
  onToggle: () => void;
  className?: string;
}) {
  const text = previewText(attempt);
  return (
    <div className={cn("flex min-w-0 items-start gap-2 text-sm", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label={expanded ? "Collapse evidence" : "Expand evidence"}
        onClick={onToggle}
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </Button>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{attemptLabel(attempt)}</p>
        <p className="line-clamp-2 whitespace-pre-wrap break-words leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          <HighlightedText value={text} query={query} />
        </p>
      </div>
    </div>
  );
}

function AttemptEvidenceDetails({
  attempt,
  query,
  className
}: {
  attempt: CheckAttempt;
  query: string;
  className?: string;
}) {
  const primaryValue = attempt.evidence || (attempt.error ? attempt.error : "");
  const fields = [
    { label: "Reason", value: attempt.reason },
    { label: "Failure", value: attempt.error_type ? failureTypeLabel(attempt.error_type) : "" },
    {
      label: "Error",
      value: attempt.error && attempt.error !== primaryValue ? attempt.error : "",
      tone: "error" as const
    }
  ];
  return (
    <EvidenceViewer
      value={primaryValue}
      fields={fields}
      primaryLabel={attempt.evidence ? "Evidence" : attempt.error ? "Error" : "Evidence"}
      emptyMessage="No evidence was recorded for this attempt."
      externalQuery={query}
      searchable={false}
      bodyClassName="max-h-80"
      className={className}
    />
  );
}

function historyDescription(total: number, matching: number, visible: number, searching: boolean) {
  if (!total) return "No attempts recorded yet";
  if (searching) return `Showing ${visible} of ${matching} matching attempts from ${total} loaded`;
  return `Showing ${visible} of ${total} recent attempts`;
}

function attemptLabel(attempt: CheckAttempt) {
  if (attempt.error_type) return failureTypeLabel(attempt.error_type);
  if (attempt.error) return "Error";
  if (attempt.reason) return "Reason";
  return "Evidence";
}

function previewText(attempt: CheckAttempt) {
  return attempt.reason || attempt.error || attempt.evidence || "No evidence recorded.";
}

function attemptMatchesQuery(attempt: CheckAttempt, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    statusLabel(attempt.status),
    attempt.status,
    attempt.http_status == null ? "" : String(attempt.http_status),
    attempt.error_type ? failureTypeLabel(attempt.error_type) : "",
    attempt.error,
    attempt.evidence,
    attempt.reason
  ]
    .join("\n")
    .toLowerCase()
    .includes(needle);
}
