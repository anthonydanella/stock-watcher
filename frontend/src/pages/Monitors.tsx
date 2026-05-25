import { Plus } from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { api } from "../api";
import { type MonitorActionKind, MonitorActions } from "../components/monitors/MonitorActions";
import { MonitorListCard } from "../components/monitors/MonitorListCard";
import { MonitorScreenshot } from "../components/monitors/MonitorScreenshot";
import { EmptyState } from "../components/shared/EmptyState";
import { LinkButton } from "../components/shared/LinkButton";
import { PageHeader } from "../components/shared/PageHeader";
import { MonitorListSkeleton } from "../components/shared/Skeletons";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableCell, TableHead } from "../components/ui/table";
import {
  errorMessage,
  failureTypeLabel,
  formatCadence,
  formatScheduleState,
  statusBadgeClass,
  statusLabel
} from "../lib/format";
import type { Monitor } from "../types";

export function Monitors() {
  const [monitors, setMonitors] = React.useState<Monitor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyActions, setBusyActions] = React.useState<Record<number, MonitorActionKind>>({});

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setMonitors(await api.monitors());
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not load monitors"));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  function patchMonitor(updated: Monitor) {
    setMonitors((current) =>
      current.map((monitor) => (monitor.id === updated.id ? updated : monitor))
    );
  }

  async function action(monitorId: number, kind: MonitorActionKind, fn: () => Promise<Monitor>) {
    setBusyActions((current) => ({ ...current, [monitorId]: kind }));
    try {
      patchMonitor(await fn());
    } catch (exc) {
      toast.error(errorMessage(exc, "Monitor action failed"));
    } finally {
      setBusyActions((current) => {
        const next = { ...current };
        delete next[monitorId];
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitors"
        description="Configure URLs, stock rules, intervals, and jitter."
      >
        <LinkButton to="/monitors/new">
          <Plus className="h-4 w-4" />
          New monitor
        </LinkButton>
      </PageHeader>
      {loading ? <MonitorListSkeleton /> : null}
      {!loading ? (
        <>
          <div className="grid gap-3 lg:hidden">
            {monitors.map((monitor) => (
              <MonitorListCard
                key={monitor.id}
                monitor={monitor}
                busyActions={busyActions}
                onAction={action}
              />
            ))}
            {!monitors.length ? <EmptyState message="No monitors configured." /> : null}
          </div>
          <Card className="hidden min-w-0 overflow-hidden rounded-md border border-border shadow-sm ring-0 lg:block">
            <CardContent>
              <Table className="table-fixed">
                <thead>
                  <tr>
                    <TableHead className="w-32">Screenshot</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-44">Schedule</TableHead>
                    <TableHead className="w-64">Last error</TableHead>
                    <TableHead className="w-40">Actions</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {monitors.map((monitor) => (
                    <tr key={monitor.id}>
                      <TableCell className="w-32">
                        <MonitorScreenshot monitor={monitor} compact />
                      </TableCell>
                      <TableCell className="min-w-0 whitespace-normal">
                        <Link
                          to={`/monitors/${monitor.id}`}
                          className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {monitor.name}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">{monitor.url}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadgeClass(monitor.status)}>
                          {statusLabel(monitor.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>{formatScheduleState(monitor)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCadence(monitor.interval_seconds, monitor.jitter_percent)}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-sm truncate text-muted-foreground">
                        {monitor.last_error ? (
                          <>
                            {monitor.last_error_type
                              ? `${failureTypeLabel(monitor.last_error_type)}: `
                              : ""}
                            {monitor.last_error}
                          </>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <MonitorActions
                          monitor={monitor}
                          busyActions={busyActions}
                          onAction={action}
                          compact
                        />
                      </TableCell>
                    </tr>
                  ))}
                  {!monitors.length ? (
                    <tr>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        No monitors configured.
                      </TableCell>
                    </tr>
                  ) : null}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
