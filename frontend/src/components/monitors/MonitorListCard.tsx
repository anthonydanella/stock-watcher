import { Link } from "react-router-dom";

import {
  failureTypeLabel,
  formatCadence,
  formatDate,
  formatScheduleState,
  statusBadgeClass,
  statusLabel,
  warningAlertClass
} from "../../lib/format";
import { cn } from "../../lib/utils";
import type { Monitor } from "../../types";
import { Info } from "../shared/Info";
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { type MonitorActionKind, MonitorActions } from "./MonitorActions";
import { MonitorQuantitySparkline } from "./MonitorQuantitySparkline";
import { MonitorScreenshot } from "./MonitorScreenshot";

function getStatusTheme(status: string | null | undefined, enabled: boolean) {
  if (!enabled) {
    return {
      borderHover: "hover:border-zinc-300/40 dark:hover:border-zinc-700/40"
    };
  }

  switch (status) {
    case "in_stock":
      return {
        borderHover: "hover:border-emerald-500/30 dark:hover:border-emerald-500/20"
      };
    case "out_of_stock":
      return {
        borderHover: "hover:border-slate-400/30 dark:hover:border-slate-500/20"
      };
    case "error":
      return {
        borderHover: "hover:border-amber-500/30 dark:hover:border-amber-500/20"
      };
    case "challenge":
      return {
        borderHover: "hover:border-violet-500/30 dark:hover:border-violet-500/20"
      };
    default:
      return {
        borderHover: "hover:border-zinc-400/30 dark:hover:border-zinc-500/20"
      };
  }
}

export function MonitorListCard({
  monitor,
  busyActions,
  onAction
}: {
  monitor: Monitor;
  busyActions: Record<number, MonitorActionKind>;
  onAction: (
    monitorId: number,
    kind: MonitorActionKind,
    fn: () => Promise<Monitor>
  ) => Promise<void>;
}) {
  const theme = getStatusTheme(monitor.status, monitor.enabled);
  const isQuantity = monitor.stock_mode === "quantity";
  return (
    <Card
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-border shadow-sm transition-shadow duration-200 hover:shadow-md",
        !monitor.enabled && "opacity-75 hover:opacity-100",
        theme.borderHover
      )}
    >
      <CardHeader>
        <Link to={`/monitors/${monitor.id}`}>
          <CardTitle>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {monitor.name}
                <p className="truncate text-xs text-muted-foreground">{monitor.url}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isQuantity && monitor.last_quantity != null ? (
                  <span className="inline-flex items-baseline gap-1 font-mono text-base font-semibold tabular-nums text-foreground">
                    {monitor.last_quantity.toLocaleString()}
                    <span className="text-xs font-normal text-muted-foreground">in stock</span>
                  </span>
                ) : null}
                <Badge className={cn(statusBadgeClass(monitor.status), "shrink-0")}>
                  {statusLabel(monitor.status)}
                </Badge>
              </div>
            </div>
          </CardTitle>
        </Link>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        {isQuantity && monitor.recent_quantities && monitor.recent_quantities.length > 1 ? (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-secondary/30 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                Quantity trend
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
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <Info
            label="Cadence"
            value={formatCadence(monitor.interval_seconds, monitor.jitter_percent)}
          />
          <Info label="Last check" value={formatDate(monitor.last_checked_at)} />
          <Info label="Next check" value={formatScheduleState(monitor)} />
        </div>
        <MonitorScreenshot monitor={monitor} />
        {monitor.last_error ? (
          <Alert className={warningAlertClass}>
            {monitor.last_error_type ? `${failureTypeLabel(monitor.last_error_type)}: ` : ""}
            {monitor.last_error}
          </Alert>
        ) : null}
        <MonitorActions monitor={monitor} busyActions={busyActions} onAction={onAction} />
      </CardContent>
    </Card>
  );
}
