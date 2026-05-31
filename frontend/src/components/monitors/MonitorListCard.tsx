import { Link } from "react-router-dom";

import {
  failureTypeLabel,
  statusBadgeClass,
  statusLabel,
  timeAgo,
  warningAlertClass
} from "../../lib/format";
import { isCoolingDown } from "../../lib/monitor";
import { cn } from "../../lib/utils";
import type { Monitor } from "../../types";
import { TagChips } from "../shared/TagChips";
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { type MonitorActionKind, MonitorActions } from "./MonitorActions";
import { MonitorQuantitySparkline } from "./MonitorQuantitySparkline";
import { MonitorScreenshot } from "./MonitorScreenshot";
import { NextCheckSummary } from "./NextCheckSummary";
import { NotificationsCell } from "./NotificationsCell";
import { ScheduleEditPopover } from "./ScheduleEditPopover";
import { StockEditPopover } from "./StockEditPopover";

// `accent` colors the card's 3px top border for an at-a-glance status hue;
// using the border itself keeps it flush with the corners and unmasked.
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

export function MonitorListCard({
  monitor,
  busyActions,
  onAction,
  onDuplicate,
  onPatch,
  selected = false,
  onSelectedChange
}: {
  monitor: Monitor;
  busyActions: Record<number, MonitorActionKind>;
  onAction: (
    monitorId: number,
    kind: MonitorActionKind,
    fn: () => Promise<Monitor>
  ) => Promise<void>;
  onDuplicate?: (monitor: Monitor) => Promise<void> | void;
  onPatch: (updated: Monitor) => void;
  selected?: boolean;
  onSelectedChange?: (checked: boolean) => void;
}) {
  const theme = getStatusTheme(monitor.status, monitor.enabled);
  const isQuantity = monitor.stock_mode === "quantity";
  const cooling = isCoolingDown(monitor);
  const trend = monitor.recent_quantities ?? [];
  const hasTrend = trend.length > 1;
  return (
    <Card
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-border border-t-[3px] shadow-sm transition-shadow duration-200 hover:shadow-md",
        !monitor.enabled && "opacity-75 hover:opacity-100",
        selected && "border-primary/50 bg-primary/5",
        theme.accent
      )}
    >
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-3">
          {onSelectedChange ? (
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onSelectedChange(checked === true)}
              aria-label={`Select ${monitor.name}`}
              className="mt-1 shrink-0"
            />
          ) : null}
          <Link to={`/monitors/${monitor.id}`} className="block min-w-0 flex-1">
            <div className="truncate font-heading text-base font-medium leading-normal hover:underline">
              {monitor.name}
            </div>
            <p className="truncate text-xs text-muted-foreground">{monitor.url}</p>
          </Link>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <Badge className={cn(statusBadgeClass(monitor.status), "shrink-0")}>
              {statusLabel(monitor.status)}
            </Badge>
            {cooling ? (
              <span className="text-xs leading-tight text-violet-700 dark:text-violet-300">
                Cooling {timeAgo(monitor.cooldown_until)}
              </span>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <TagChips tags={monitor.tags} />
        {isQuantity ? (
          <StockEditPopover monitor={monitor} onSaved={onPatch}>
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <span className="min-w-0 text-left">
                <span className="block text-xs font-medium text-muted-foreground">In stock</span>
                <span className="block font-mono text-lg font-semibold tabular-nums text-foreground">
                  {monitor.last_quantity != null ? monitor.last_quantity.toLocaleString() : "—"}
                  {monitor.low_stock_threshold != null ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      low ≤ {monitor.low_stock_threshold}
                    </span>
                  ) : null}
                </span>
              </span>
              {hasTrend ? (
                <MonitorQuantitySparkline values={trend} threshold={monitor.low_stock_threshold} />
              ) : null}
            </span>
          </StockEditPopover>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">Notifications</span>
          <NotificationsCell monitor={monitor} onSaved={onPatch} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">Last check</span>
          <span className="text-right text-sm leading-tight">
            {monitor.last_checked_at ? timeAgo(monitor.last_checked_at) || "Just now" : "Never"}
          </span>
        </div>

        <ScheduleEditPopover monitor={monitor} onSaved={onPatch}>
          <span className="flex w-full items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">Next check</span>
            <span className="flex min-w-0 flex-col items-end text-right text-sm">
              <NextCheckSummary monitor={monitor} cooling={cooling} />
            </span>
          </span>
        </ScheduleEditPopover>

        <MonitorScreenshot monitor={monitor} />
        {monitor.last_error ? (
          <Alert className={cn(warningAlertClass, "block")}>
            <p className="line-clamp-3 min-w-0 break-words [overflow-wrap:anywhere]">
              {monitor.last_error_type ? (
                <span className="font-medium">{failureTypeLabel(monitor.last_error_type)}: </span>
              ) : null}
              {monitor.last_error}
            </p>
          </Alert>
        ) : null}
        <MonitorActions
          monitor={monitor}
          busyActions={busyActions}
          onAction={onAction}
          onDuplicate={onDuplicate}
          stretch
        />
      </CardContent>
    </Card>
  );
}
