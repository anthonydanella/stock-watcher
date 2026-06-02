import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Database,
  Hourglass,
  RotateCw
} from "lucide-react";
import type React from "react";

import { formatDate, formatSeconds, statusBadgeClass, warningAlertClass } from "../../lib/format";
import type { SchedulerStatus } from "../../types";
import { InfoTooltip } from "../shared/InfoTooltip";
import { PanelCard } from "../shared/PanelCard";
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { CardContent } from "../ui/card";

export function SchedulerObservabilityPanel({ status }: { status: SchedulerStatus | null }) {
  const health = schedulerHealth(status);
  const browser = browserHealth(status);

  return (
    <PanelCard className="min-w-0">
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {/* No heading text here: the "Scheduler status" section header above
                already titles this panel. We lead with the health icon + badge. */}
            <div className="flex flex-wrap items-center gap-2">
              {health.icon}
              <Badge className={statusBadgeClass(health.status)}>{health.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{health.detail}</p>
          </div>
          <div className="w-full rounded-md bg-secondary px-3 py-2 text-left sm:w-auto sm:text-right">
            <div className="flex items-center gap-1.5 sm:justify-end">
              <p className="text-xs font-medium text-muted-foreground">Loop cadence</p>
              <InfoTooltip side="left">
                How often the scheduler sweeps for monitors due to run. Set via
                CHECK_LOOP_INTERVAL_SECONDS (default: 15 s).
              </InfoTooltip>
            </div>
            <p className="text-sm font-semibold">
              {status ? formatSeconds(status.loop_interval_seconds) : "-"}
            </p>
          </div>
        </div>

        {status?.last_loop_error ? (
          <Alert className={warningAlertClass}>
            Scheduler loop error: {status.last_loop_error}
            {status.last_loop_error_at ? ` (${formatDate(status.last_loop_error_at)})` : ""}
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SchedulerStat
            icon={<Hourglass className="h-4 w-4" />}
            label="Due now"
            value={status ? status.due_monitor_count.toLocaleString() : "-"}
            detail={status ? "Past their scheduled check time" : "Loading queue"}
          />
          <SchedulerStat
            icon={<CalendarClock className="h-4 w-4" />}
            label="Next check"
            value={status ? formatNextDue(status) : "-"}
            detail={
              status?.next_due_at ? "Earliest enabled monitor" : "No enabled monitor is scheduled"
            }
          />
          <SchedulerStat
            icon={<RotateCw className="h-4 w-4" />}
            label="Last sweep"
            value={status ? formatLastSweep(status) : "-"}
            detail={
              status
                ? `${status.last_run.due_count.toLocaleString()} due in last pass`
                : "Loading run state"
            }
          />
          <SchedulerStat
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Website checks"
            value={<Badge className={statusBadgeClass(browser.status)}>{browser.label}</Badge>}
            detail={browser.detail}
            tooltip="Playwright-backed browser rendering."
          />
        </div>

        <div className="grid gap-3 border-t pt-4 md:grid-cols-3">
          <SchedulerDatum
            label="Enabled monitors"
            value={status ? status.monitor_counts.enabled.toLocaleString() : "-"}
          />
          <SchedulerDatum
            label="Paused monitors"
            value={status ? status.monitor_counts.paused.toLocaleString() : "-"}
          />
          <SchedulerDatum
            label="Cooling down"
            value={status ? status.monitor_counts.cooling_down.toLocaleString() : "-"}
            tooltip="Monitors temporarily pause after a CAPTCHA or anti-bot challenge is detected. They resume automatically once the cooldown window expires."
          />
        </div>

        <div className="flex min-w-0 items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
          <Database className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p>
                Retention keeps {status ? status.retention.attempts.toLocaleString() : "-"} attempts
                and {status ? status.retention.events.toLocaleString() : "-"} events.
              </p>
              <InfoTooltip side="top">
                Older check records are pruned automatically when these limits are reached. Adjust
                via ATTEMPT_RETENTION_LIMIT and EVENT_RETENTION_LIMIT.
              </InfoTooltip>
            </div>
            <p className="mt-1 break-all font-mono">{status?.database_path ?? "-"}</p>
          </div>
        </div>
      </CardContent>
    </PanelCard>
  );
}

function SchedulerStat({
  icon,
  label,
  value,
  detail,
  tooltip
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
  tooltip?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-background p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
        {tooltip ? <InfoTooltip side="right">{tooltip}</InfoTooltip> : null}
      </div>
      <div className="mt-2 min-h-7 break-words text-xl font-semibold">{value}</div>
      <p className="mt-1 break-words text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function SchedulerDatum({
  label,
  value,
  tooltip
}: {
  label: string;
  value: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {tooltip ? <InfoTooltip side="right">{tooltip}</InfoTooltip> : null}
      </div>
      <div className="mt-1 break-words text-sm font-semibold">{value}</div>
    </div>
  );
}

function schedulerHealth(status: SchedulerStatus | null) {
  if (!status) {
    return {
      icon: <RotateCw className="h-4 w-4 animate-spin text-muted-foreground" />,
      label: "Loading",
      status: "unknown",
      detail: "Fetching scheduler runtime state."
    };
  }
  if (status.last_loop_error) {
    return {
      icon: <AlertTriangle className="h-4 w-4 text-warning-accent" />,
      label: "Needs attention",
      status: "error",
      detail: "The background loop is alive enough to report state, but the last sweep failed."
    };
  }
  if (!status.running) {
    return {
      icon: <AlertTriangle className="h-4 w-4 text-neutral-accent" />,
      label: "Stopped",
      status: "paused",
      detail: "Automatic checks are not currently running."
    };
  }
  return {
    icon: <CheckCircle2 className="h-4 w-4 text-success-accent" />,
    label: "Running",
    status: "in_stock",
    detail: status.due_monitor_count
      ? "The scheduler has monitors ready to check on the next pass."
      : "The scheduler is waiting for the next monitor window."
  };
}

function browserHealth(status: SchedulerStatus | null) {
  if (!status)
    return { label: "Loading", status: "unknown", detail: "Checking page-rendering support" };
  if (status.browser_checks.available) {
    return { label: "Available", status: "in_stock", detail: status.browser_checks.reason };
  }
  return { label: "Unavailable", status: "error", detail: status.browser_checks.reason };
}

function formatNextDue(status: SchedulerStatus) {
  if (status.due_monitor_count > 0) return "Now";
  return formatDate(status.next_due_at);
}

function formatLastSweep(status: SchedulerStatus) {
  if (status.last_run.finished_at) return formatDate(status.last_run.finished_at);
  if (status.last_run.started_at) return `Started ${formatDate(status.last_run.started_at)}`;
  return "Not run yet";
}
