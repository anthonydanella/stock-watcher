import {
  Calendar,
  ChevronRight,
  Clock,
  ExternalLink,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldAlert
} from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { api } from "../../api";
import {
  errorMessage,
  failureTypeLabel,
  formatCadence,
  formatDate,
  formatScheduleState,
  formatShortDate,
  statusBadgeClass,
  statusLabel,
  timeAgo,
  warningAlertClass
} from "../../lib/format";
import { cn } from "../../lib/utils";
import type { Monitor } from "../../types";
import { EmptyState } from "../shared/EmptyState";
import { LinkButton } from "../shared/LinkButton";
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { MonitorQuantitySparkline } from "./MonitorQuantitySparkline";
import { MonitorScreenshot } from "./MonitorScreenshot";

// `accent` colors the card's 3px top border, giving each card an at-a-glance
// status hue. Using the border itself (rather than an overlay) keeps it flush
// with the rounded corners and never gets masked by overflow clipping.
function getStatusTheme(status: string | null | undefined, enabled: boolean) {
  if (!enabled) {
    return { accent: "border-t-zinc-300 dark:border-t-zinc-600" };
  }

  switch (status) {
    case "in_stock":
      return { accent: "border-t-emerald-500/80" };
    case "out_of_stock":
      return { accent: "border-t-slate-400/70 dark:border-t-slate-500/60" };
    case "error":
      return { accent: "border-t-amber-500/80" };
    case "challenge":
      return { accent: "border-t-violet-500/80" };
    default:
      return { accent: "border-t-zinc-400/70" };
  }
}

export function MonitorCards({
  monitors,
  onChanged
}: {
  monitors: Monitor[];
  onChanged: () => Promise<void> | void;
}) {
  const [runningIds, setRunningIds] = React.useState<Set<number>>(() => new Set());

  async function run(monitor: Monitor) {
    setRunningIds((current) => new Set(current).add(monitor.id));
    try {
      await api.runMonitor(monitor.id);
      await onChanged();
    } catch (exc) {
      toast.error(errorMessage(exc, `Could not run ${monitor.name}`));
    } finally {
      setRunningIds((current) => {
        const next = new Set(current);
        next.delete(monitor.id);
        return next;
      });
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {monitors.map((monitor, index) => {
        const running = runningIds.has(monitor.id);
        const theme = getStatusTheme(monitor.status, monitor.enabled);
        const hasCooldown = Boolean(monitor.cooldown_until);
        return (
          <Card
            key={monitor.id}
            // Subtle staggered entrance, capped so longer lists don't crawl in.
            style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            className={cn(
              "min-w-0 overflow-hidden rounded-lg border border-border border-t-[3px] shadow-sm transition duration-200 ease-in-out hover:-translate-y-1 hover:shadow-lg",
              // fill-mode-backwards holds the pre-animation state during the staggered
              // delay (no flash) without pinning transform, so hover:-translate-y keeps working.
              "fade-in slide-in-from-bottom-2 fill-mode-backwards animate-in duration-500",
              !monitor.enabled && "opacity-75 hover:opacity-100",
              theme.accent
            )}
          >
            <CardHeader>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CardTitle className="min-w-0 wrap-break-word">
                    <Link
                      to={`/monitors/${monitor.id}`}
                      className="text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                    >
                      {monitor.name}
                    </Link>
                  </CardTitle>
                  {monitor.last_checked_at ? (
                    <time
                      dateTime={monitor.last_checked_at}
                      title={formatDate(monitor.last_checked_at)}
                      className="text-xs text-muted-foreground/80 flex items-center gap-1.5 mt-0.5"
                    >
                      <Clock className="h-3 w-3 shrink-0 opacity-70" />
                      <span>Checked {timeAgo(monitor.last_checked_at)}</span>
                    </time>
                  ) : (
                    <span className="text-xs text-muted-foreground/80 flex items-center gap-1.5 mt-0.5">
                      <Clock className="h-3 w-3 shrink-0 opacity-70" />
                      <span>Never checked</span>
                    </span>
                  )}
                  <CardDescription className="mt-1.5 min-w-0 max-w-full">
                    <a
                      href={monitor.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 max-w-full items-center gap-1 font-mono text-[11px] text-muted-foreground/75 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
                      title={monitor.url}
                    >
                      <span className="min-w-0 truncate">{monitor.url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  </CardDescription>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {monitor.stock_mode === "quantity" && monitor.last_quantity != null ? (
                    <span className="inline-flex items-baseline gap-1 font-mono text-base font-semibold tabular-nums text-foreground">
                      {monitor.last_quantity.toLocaleString()}
                      <span className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                        left
                      </span>
                    </span>
                  ) : null}
                  <Badge
                    className={cn(
                      "shrink-0 shadow-xs border text-xs font-semibold px-2 py-0.5",
                      statusBadgeClass(monitor.status)
                    )}
                    title={statusLabel(monitor.status)}
                  >
                    {statusLabel(monitor.status)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3.5">
              <MonitorScreenshot monitor={monitor} />
              {monitor.stock_mode === "quantity" &&
              monitor.recent_quantities &&
              monitor.recent_quantities.length > 1 ? (
                <div className="flex items-center justify-between gap-3 rounded-md border bg-secondary/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/90">
                      Trend
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Last {monitor.recent_quantities.length} checks
                      {monitor.low_stock_threshold != null
                        ? ` · low ≤ ${monitor.low_stock_threshold}`
                        : ""}
                    </p>
                  </div>
                  <MonitorQuantitySparkline
                    values={monitor.recent_quantities}
                    threshold={monitor.low_stock_threshold}
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 text-xs py-1">
                <div className="min-w-0 flex items-start gap-1.5">
                  <Calendar className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/80 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/90">
                      Next Check
                    </span>
                    <span
                      className="block truncate font-medium text-foreground/90"
                      title={formatScheduleState(monitor)}
                    >
                      {formatScheduleState(monitor, true)}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 flex items-start gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/80 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/90">
                      Cadence
                    </span>
                    <span
                      className="block truncate font-medium text-foreground/90"
                      title={formatCadence(monitor.interval_seconds, monitor.jitter_percent)}
                    >
                      {formatCadence(monitor.interval_seconds, monitor.jitter_percent)}
                    </span>
                  </div>
                </div>
                {hasCooldown ? (
                  <div className="min-w-0 flex items-start gap-1.5 col-span-2">
                    <ShieldAlert className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-amber-500/90">
                        Cooldown
                      </span>
                      <span
                        className="block truncate font-medium text-amber-600 dark:text-amber-400"
                        title={formatDate(monitor.cooldown_until)}
                      >
                        {formatShortDate(monitor.cooldown_until)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {monitor.last_error ? (
                <Alert
                  className={cn(
                    "block text-xs py-2 px-3 border rounded-md shadow-2xs",
                    warningAlertClass
                  )}
                >
                  <p className="line-clamp-3 min-w-0 break-words [overflow-wrap:anywhere]">
                    <span className="font-semibold">
                      {monitor.last_error_type
                        ? `${failureTypeLabel(monitor.last_error_type)}: `
                        : "Error: "}
                    </span>
                    {monitor.last_error}
                  </p>
                </Alert>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={running}
                  aria-busy={running}
                  onClick={() => run(monitor)}
                >
                  {running ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {running ? "Running" : "Run check"}
                </Button>
                <LinkButton variant="outline" size="sm" to={`/monitors/${monitor.id}`}>
                  Open
                  <ChevronRight className="h-3.5 w-3.5" />
                </LinkButton>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {!monitors.length ? (
        <EmptyState
          className="md:col-span-2 xl:col-span-3"
          message="No monitors yet. Add one to start checking stock."
        />
      ) : null}
    </div>
  );
}
