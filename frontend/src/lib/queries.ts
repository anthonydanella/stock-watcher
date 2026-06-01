import { queryOptions } from "@tanstack/react-query";

import { api } from "../api";

// Centralised query keys so reads, cache patches, and invalidations all refer
// to the same identity. `monitorDetail`/`monitorHistory` nest under `monitors`
// so invalidating the list does not disturb open detail views and vice versa.
export const queryKeys = {
  monitors: ["monitors"] as const,
  monitorDetail: (id: string | number) => ["monitors", "detail", String(id)] as const,
  monitorHistory: (id: string | number) => ["monitors", "history", String(id)] as const,
  events: ["events"] as const,
  schedulerStatus: ["scheduler-status"] as const,
  notificationRules: ["notification-rules"] as const,
  settings: ["settings"] as const
};

// queryOptions() keeps each query's key and fetcher typed and reusable: pass the
// result straight to useQuery, or spread it to override options per consumer
// (e.g. the dashboard adds refetchInterval).
export const monitorsQuery = () =>
  queryOptions({ queryKey: queryKeys.monitors, queryFn: api.monitors });

export const monitorDetailQuery = (id: string | number) =>
  queryOptions({ queryKey: queryKeys.monitorDetail(id), queryFn: () => api.monitor(id) });

export const monitorHistoryQuery = (id: string | number) =>
  queryOptions({ queryKey: queryKeys.monitorHistory(id), queryFn: () => api.monitorHistory(id) });

export const eventsQuery = () => queryOptions({ queryKey: queryKeys.events, queryFn: api.events });

export const schedulerStatusQuery = () =>
  queryOptions({ queryKey: queryKeys.schedulerStatus, queryFn: api.schedulerStatus });

export const notificationRulesQuery = () =>
  queryOptions({ queryKey: queryKeys.notificationRules, queryFn: api.notificationRules });

export const settingsQuery = () =>
  queryOptions({
    queryKey: queryKeys.settings,
    queryFn: api.settings,
    // Settings only change when this client saves them, so never let a
    // background refetch clobber in-progress form edits.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false
  });
