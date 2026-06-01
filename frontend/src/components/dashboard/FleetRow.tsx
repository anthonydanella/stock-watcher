import { ArrowRight, LoaderCircle, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { formatDate, statusLabel, timeAgo } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { EventRow, Monitor } from "../../types";
import { MonitorQuantitySparkline } from "../monitors/MonitorQuantitySparkline";
import { Button } from "../ui/button";
import { FleetStatusDot } from "./FleetStatusDot";
import { nextCheckText, shortStatus, stateText, statusTextClass } from "./helpers";

export function FleetRow({
  monitor,
  change,
  running,
  onRun
}: {
  monitor: Monitor;
  change: EventRow | undefined;
  running: boolean;
  onRun: (monitor: Monitor) => void;
}) {
  const trend = monitor.recent_quantities ?? [];
  const hasTrend = monitor.stock_mode === "quantity" && trend.length > 1;
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-md border bg-card px-3 py-2 transition-colors hover:bg-accent/40",
        !monitor.enabled && "opacity-70 hover:opacity-100"
      )}
    >
      <FleetStatusDot status={monitor.status} enabled={monitor.enabled} />
      <div className="min-w-0 flex-1">
        <Link
          to={`/monitors/${monitor.id}`}
          className="block truncate text-sm font-medium leading-tight hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {monitor.name}
        </Link>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs">
          <span className={cn("truncate", statusTextClass(monitor.status, monitor.enabled))}>
            {stateText(monitor)}
          </span>
          {/* On narrow screens the last change rides under the name instead of its own column. */}
          <FleetLastChange change={change} className="shrink-0 sm:hidden" />
        </div>
      </div>

      {hasTrend ? (
        <MonitorQuantitySparkline
          values={trend}
          threshold={monitor.low_stock_threshold}
          width={72}
          height={24}
          className="hidden shrink-0 sm:block"
        />
      ) : null}

      <FleetLastChange change={change} className="hidden w-36 shrink-0 justify-end sm:flex" />

      <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground lg:block">
        {nextCheckText(monitor)}
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground/70 hover:text-foreground"
        disabled={running}
        aria-busy={running}
        aria-label={`Run check for ${monitor.name}`}
        title="Run check now"
        onClick={() => onRun(monitor)}
      >
        {running ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

function FleetLastChange({
  change,
  className
}: {
  change: EventRow | undefined;
  className?: string;
}) {
  if (!change?.new_status) {
    return <span className={cn("text-xs text-muted-foreground/50", className)}>—</span>;
  }
  const when = timeAgo(change.created_at);
  return (
    <span
      className={cn(
        "flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground",
        className
      )}
      title={`${statusLabel(change.old_status)} → ${statusLabel(change.new_status)} · ${formatDate(change.created_at)}`}
    >
      {change.old_status ? (
        <>
          <span>{shortStatus(change.old_status)}</span>
          <ArrowRight className="h-3 w-3 opacity-50" aria-hidden="true" />
        </>
      ) : null}
      <span className={statusTextClass(change.new_status, true)}>
        {shortStatus(change.new_status)}
      </span>
      {when ? <span className="text-muted-foreground/70">· {when}</span> : null}
    </span>
  );
}
