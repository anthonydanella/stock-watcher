import React from "react";

import { api } from "../api";
import { errorMessage } from "../lib/format";
import type { EventRow, Monitor, SchedulerStatus } from "../types";

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
  const [monitors, setMonitors] = React.useState<Monitor[]>([]);
  const [events, setEvents] = React.useState<EventRow[]>([]);
  const [notificationFailures, setNotificationFailures] =
    React.useState<NotificationFailureSummary>({ count: 0, lastAt: null });
  const [lastChanges, setLastChanges] = React.useState<Record<number, EventRow>>({});
  const [schedulerStatus, setSchedulerStatus] = React.useState<SchedulerStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const refreshRequest = React.useRef(0);
  const refreshInFlight = React.useRef(false);

  const refresh = React.useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const requestId = refreshRequest.current + 1;
    refreshRequest.current = requestId;
    if (!silent) {
      setBusy(true);
      setError("");
    }
    try {
      const [nextMonitors, nextEvents, nextSchedulerStatus] = await Promise.all([
        api.monitors(),
        api.events(),
        api.schedulerStatus()
      ]);
      if (requestId !== refreshRequest.current) return;
      setMonitors(nextMonitors);
      setEvents(nextEvents.slice(0, 8));
      setNotificationFailures(summarizeNotificationFailures(nextEvents));
      setLastChanges(summarizeStatusChanges(nextEvents));
      setSchedulerStatus(nextSchedulerStatus);
      setError("");
    } catch (exc) {
      if (requestId !== refreshRequest.current) return;
      setError(errorMessage(exc, "Could not refresh dashboard"));
    } finally {
      refreshInFlight.current = false;
      if (!silent && requestId === refreshRequest.current) setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refresh({ silent: true });
    };
    const timerId = window.setInterval(refreshIfVisible, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [refresh]);

  return {
    monitors,
    events,
    notificationFailures,
    lastChanges,
    schedulerStatus,
    busy,
    error,
    refresh
  };
}
