import { formatDate, formatDuration, statusBadgeClass } from "../../../lib/format";
import { cn } from "../../../lib/utils";
import type { CheckAttempt } from "../../../types";
import { Badge } from "../../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { getStatusDetails } from "./constants";
import { StatusLegend } from "./StatusLegend";

interface ResultHistoryCardProps {
  activeAttempt: CheckAttempt | null;
  activeAttemptId: number | null;
  recentAttempts: CheckAttempt[];
  onClearActive: () => void;
  onSetActiveId: (id: number) => void;
}

export function ResultHistoryCard({
  activeAttempt,
  activeAttemptId,
  recentAttempts,
  onClearActive,
  onSetActiveId
}: ResultHistoryCardProps) {
  return (
    <Card className="min-w-0 rounded-md border border-border shadow-sm ring-0">
      <CardHeader>
        <CardTitle>Result history </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="mt-1 text-xs text-muted-foreground">
              Last {recentAttempts.length} checks, oldest to newest
            </p>
          </div>
          {activeAttempt ? (
            <Badge className={cn(statusBadgeClass(activeAttempt.status), "shrink-0")}>
              {getStatusDetails(activeAttempt.status).label}
            </Badge>
          ) : null}
        </div>

        {/* biome-ignore lint/a11y/useSemanticElements: <fieldset> is for form controls; these are timeline buttons */}
        <div
          className="flex h-14 items-center justify-between gap-1 overflow-x-auto py-2"
          role="group"
          aria-label="Recent check result timeline"
          onMouseLeave={onClearActive}
        >
          {recentAttempts.map((attempt) => {
            const details = getStatusDetails(attempt.status);
            const active = activeAttemptId === attempt.id;
            return (
              <button
                key={attempt.id}
                type="button"
                aria-label={`${details.label} at ${formatDate(attempt.created_at)} in ${formatDuration(attempt.duration_ms)}`}
                title={`${details.label} - ${formatDate(attempt.created_at)}`}
                onBlur={onClearActive}
                onFocus={() => onSetActiveId(attempt.id)}
                onMouseEnter={() => onSetActiveId(attempt.id)}
                className={cn(
                  "h-10 w-full min-w-[7px] max-w-[13px] rounded-[4px] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  details.barClass,
                  active
                    ? cn("scale-y-125 opacity-100 ring-1 ring-white/80", details.glowClass)
                    : "opacity-85 shadow-sm hover:opacity-100"
                )}
              />
            );
          })}
        </div>

        <div className="flex min-h-12 flex-col justify-center border-t border-border/60 pt-3 text-xs">
          {activeAttempt ? (
            <div className="grid gap-2 text-muted-foreground sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <p className="min-w-0 truncate font-mono text-[11px] text-foreground">
                {formatDate(activeAttempt.created_at)}
              </p>
              <p className="flex flex-wrap items-center gap-2 sm:justify-end">
                {activeAttempt.http_status ? (
                  <span className="font-mono">HTTP {activeAttempt.http_status}</span>
                ) : null}
                <span
                  className={cn(
                    "font-mono font-semibold",
                    getStatusDetails(activeAttempt.status).textClass
                  )}
                >
                  {formatDuration(activeAttempt.duration_ms)}
                </span>
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground">
              <span>Hover or tab through checks for details</span>
              <StatusLegend />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
