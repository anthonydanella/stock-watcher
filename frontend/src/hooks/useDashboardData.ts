import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";

import { errorMessage } from "../lib/format";
import { eventsQuery, monitorsQuery, queryKeys, schedulerStatusQuery } from "../lib/queries";
import type { EventRow } from "../types";

const AUTO_REFRESH_MS = 15_000;
const NOTIFICATION_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type NotificationFailureSummary = { count: number; lastAt: string | null };

function summarizeNotificationFailures(events: EventRow[]): NotificationFailureSummary {
  const cutoff = Date.now() - NOTIFICATION_FAILURE_WINDOW_MS;
  // Events arrive newest-first, so the first match is the most recent failure.
  const failures = events.filter(
    (event) =>
      event.event_type === "notification_error" && new Date(event.created_at).getTime() >= cutoff
  );
  return { count: failures.length, lastAt: failures[0]?.created_at ?? null };
}

// Build a map of monitor id → its most recent status-change event. Events arrive
// newest-first, so the first one seen per monitor wins. This powers the fleet
// list's "last change" column without a dedicated timestamp on the Monitor model.
function summarizeStatusChanges(events: EventRow[]): Record<number, EventRow> {
  const latest: Record<number, EventRow> = {};
  for (const event of events) {
    if (event.event_type !== "status_change" || event.monitor_id == null) continue;
    if (latest[event.monitor_id]) continue;
    latest[event.monitor_id] = event;
  }
  return latest;
}

export function useDashboardData() {
  const queryClient = useQueryClient();
  // refetchInterval polls every 15s while the tab is focused (React Query pauses
  // it in the background by default); window-focus revalidation is inherited
  // from the client defaults, replacing the hand-rolled visibility listeners.
  const monitorsQ = useQuery({ ...monitorsQuery(), refetchInterval: AUTO_REFRESH_MS });
  const eventsQ = useQuery({ ...eventsQuery(), refetchInterval: AUTO_REFRESH_MS });
  const schedulerQ = useQuery({ ...schedulerStatusQuery(), refetchInterval: AUTO_REFRESH_MS });

  // The manual Refresh button spins; the silent 15s poll and focus refetches do not.
  const [manualBusy, setManualBusy] = React.useState(false);
  const refresh = React.useCallback(async () => {
    setManualBusy(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.monitors, exact: true }),
        queryClient.refetchQueries({ queryKey: queryKeys.events, exact: true }),
        queryClient.refetchQueries({ queryKey: queryKeys.schedulerStatus, exact: true })
      ]);
    } finally {
      setManualBusy(false);
    }
  }, [queryClient]);

  const monitors = monitorsQ.data ?? [];
  const allEvents = React.useMemo(() => eventsQ.data ?? [], [eventsQ.data]);
  const notificationFailures = React.useMemo(
    () => summarizeNotificationFailures(allEvents),
    [allEvents]
  );
  const lastChanges = React.useMemo(() => summarizeStatusChanges(allEvents), [allEvents]);
  const events = React.useMemo(() => allEvents.slice(0, 8), [allEvents]);

  const firstError = monitorsQ.error ?? eventsQ.error ?? schedulerQ.error;
  const error = firstError ? errorMessage(firstError, "Could not refresh dashboard") : "";

  return {
    monitors,
    events,
    notificationFailures,
    lastChanges,
    schedulerStatus: schedulerQ.data ?? null,
    busy: manualBusy,
    error,
    refresh
  };
}
