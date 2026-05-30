import {
  Activity,
  Bell,
  BellOff,
  ChevronRight,
  Clock,
  Plus,
  RefreshCw,
  ShieldAlert
} from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";

import { EventsTable } from "../components/events/EventsTable";
import { MonitorCards } from "../components/monitors/MonitorCards";
import { SchedulerObservabilityPanel } from "../components/scheduler/SchedulerObservabilityPanel";
import { EmptyState } from "../components/shared/EmptyState";
import { LinkButton } from "../components/shared/LinkButton";
import { Metric } from "../components/shared/Metric";
import { PageHeader } from "../components/shared/PageHeader";
import { SectionHeader } from "../components/shared/SectionHeader";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { useDashboardData } from "../hooks/useDashboardData";
import { timeAgo, warningAlertClass } from "../lib/format";
import type { Monitor } from "../types";

const ATTENTION_STATUSES = new Set(["in_stock", "low_stock", "error", "challenge"]);

function needsAttention(monitor: Monitor) {
  if (ATTENTION_STATUSES.has(monitor.status)) return true;
  const cooldown = monitor.cooldown_until ? new Date(monitor.cooldown_until).getTime() : 0;
  return cooldown > Date.now();
}

export function Dashboard() {
  const { monitors, events, notificationFailures, schedulerStatus, refresh, busy, error } =
    useDashboardData();
  const counts = React.useMemo(
    () => ({
      total: monitors.length,
      inStock: monitors.filter((monitor) => monitor.status === "in_stock").length,
      challenge: monitors.filter((monitor) => monitor.status === "challenge").length,
      errors: monitors.filter((monitor) => monitor.status === "error").length
    }),
    [monitors]
  );
  const attention = React.useMemo(() => monitors.filter(needsAttention), [monitors]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Current stock status, schedule health, and recent activity."
      >
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" />
          {busy ? "Refreshing" : "Refresh"}
        </Button>
        <LinkButton to="/monitors/new">
          <Plus className="h-4 w-4" />
          New monitor
        </LinkButton>
      </PageHeader>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {notificationFailures.count > 0 ? (
        <Alert className={warningAlertClass}>
          <BellOff className="h-4 w-4" />
          <p>
            <span className="font-medium">
              {notificationFailures.count === 1
                ? "1 notification failed to deliver"
                : `${notificationFailures.count} notifications failed to deliver`}
            </span>{" "}
            in the last 24h, even after automatic retries
            {notificationFailures.lastAt ? ` — last ${timeAgo(notificationFailures.lastAt)}` : ""}.
            Check the ntfy server and topic in{" "}
            <Link to="/settings" className="font-medium underline underline-offset-2">
              Settings
            </Link>{" "}
            or{" "}
            <Link to="/events" className="font-medium underline underline-offset-2">
              review the events
            </Link>
            .
          </p>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-3">
        <Metric title="Monitors" value={counts.total} icon={<Activity className="h-3.5 w-3.5" />} />
        <Metric title="In stock" value={counts.inStock} icon={<Bell className="h-3.5 w-3.5" />} />
        <Metric
          title="Challenges"
          value={counts.challenge}
          icon={<ShieldAlert className="h-3.5 w-3.5" />}
        />
        <Metric title="Errors" value={counts.errors} icon={<Clock className="h-3.5 w-3.5" />} />
      </div>
      <section className="space-y-3" aria-labelledby="dashboard-attention">
        <SectionHeader id="dashboard-attention" title="Needs attention">
          <LinkButton variant="outline" size="sm" to="/monitors">
            All monitors
            <ChevronRight className="h-3.5 w-3.5" />
          </LinkButton>
        </SectionHeader>
        {counts.total === 0 ? (
          <EmptyState message="No monitors yet. Add one to start checking stock." />
        ) : attention.length === 0 ? (
          <EmptyState message="All clear — every monitor is healthy and nothing needs attention." />
        ) : (
          <MonitorCards monitors={attention} onChanged={refresh} />
        )}
      </section>
      <section className="space-y-3" aria-labelledby="dashboard-events">
        <SectionHeader id="dashboard-events" title="Recent activity" />
        <EventsTable events={events} />
      </section>
      <section className="space-y-3" aria-labelledby="dashboard-scheduler">
        <SectionHeader id="dashboard-scheduler" title="Scheduler status" />
        <SchedulerObservabilityPanel status={schedulerStatus} />
      </section>
    </div>
  );
}
