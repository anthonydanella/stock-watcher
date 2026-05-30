import React from "react";

import { api } from "../api";
import { errorMessage } from "../lib/format";
import type { EventRow, Monitor, SchedulerStatus } from "../types";

const AUTO_REFRESH_MS = 15_000;

export function useDashboardData() {
  const [monitors, setMonitors] = React.useState<Monitor[]>([]);
  const [events, setEvents] = React.useState<EventRow[]>([]);
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

  return { monitors, events, schedulerStatus, busy, error, refresh };
}
