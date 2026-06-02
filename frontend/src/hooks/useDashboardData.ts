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
  const events = React.useMemo(() => allEvents.slice(0, 8), [allEvents]);

  const firstError = monitorsQ.error ?? eventsQ.error ?? schedulerQ.error;
  const error = firstError ? errorMessage(firstError, "Could not refresh dashboard") : "";

  // Most recent successful fetch across the three queries, powering the "Updated
  // <when>" stamp so the otherwise-silent 15s poll has something to show for it.
  // 0 means "never fetched yet" → null so the UI hides the stamp on cold load.
  const lastUpdatedAt =
    Math.max(monitorsQ.dataUpdatedAt, eventsQ.dataUpdatedAt, schedulerQ.dataUpdatedAt) || null;

  return {
    monitors,
    events,
    notificationFailures,
    schedulerStatus: schedulerQ.data ?? null,
    busy: manualBusy,
    // First load with nothing cached yet: lets the page show a skeleton instead
    // of flashing the "No monitors yet" empty state and 0/0/0/0 metrics.
    loading: monitorsQ.isPending,
    lastUpdatedAt,
    error,
    refresh
  };
}
