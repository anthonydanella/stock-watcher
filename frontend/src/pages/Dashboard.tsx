import { Activity, Bell, Clock, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import React from "react";

import { EventsTable } from "../components/events/EventsTable";
import { MonitorCards } from "../components/monitors/MonitorCards";
import { SchedulerObservabilityPanel } from "../components/scheduler/SchedulerObservabilityPanel";
import { LinkButton } from "../components/shared/LinkButton";
import { Metric } from "../components/shared/Metric";
import { PageHeader } from "../components/shared/PageHeader";
import { SectionHeader } from "../components/shared/SectionHeader";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { useDashboardData } from "../hooks/useDashboardData";

export function Dashboard() {
  const { monitors, events, schedulerStatus, refresh, busy, error } = useDashboardData();
  const counts = React.useMemo(
    () => ({
      total: monitors.length,
      inStock: monitors.filter((monitor) => monitor.status === "in_stock").length,
      challenge: monitors.filter((monitor) => monitor.status === "challenge").length,
      errors: monitors.filter((monitor) => monitor.status === "error").length
    }),
    [monitors]
  );

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
      <section className="space-y-3" aria-labelledby="dashboard-monitors">
        <SectionHeader id="dashboard-monitors" title="Monitors" />
        <MonitorCards monitors={monitors} onChanged={refresh} />
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
