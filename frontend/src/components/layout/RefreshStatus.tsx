import { useIsFetching } from "@tanstack/react-query";
import React from "react";

import { timeAgo } from "../../lib/format";
import { cn } from "../../lib/utils";
import { InfoTooltip } from "../shared/InfoTooltip";

type Status = "syncing" | "live" | "paused";

const STATUS_META: Record<Status, { label: string; dot: string }> = {
  syncing: { label: "Refreshing…", dot: "bg-emerald-500" },
  live: { label: "Live", dot: "bg-emerald-500" },
  paused: { label: "Auto-refresh paused", dot: "bg-muted-foreground/50" }
};

// Footer indicator for the app-wide auto-refresh. TanStack Query polls on an
// interval (the dashboard) and revalidates on tab focus, pausing both while the
// tab is hidden — this surfaces that state: a ping while data is in flight, a
// steady "Live · updated …" when idle, and "paused" when the tab is backgrounded.
export function RefreshStatus() {
  const fetching = useIsFetching();
  const [lastSyncedAt, setLastSyncedAt] = React.useState<string | null>(null);
  const [hidden, setHidden] = React.useState(
    () => typeof document !== "undefined" && document.hidden
  );
  // Force a re-render on a slow cadence so the relative "updated …" stays current.
  const [, tick] = React.useReducer((n: number) => n + 1, 0);

  const wasFetching = React.useRef(false);
  React.useEffect(() => {
    if (fetching > 0) {
      wasFetching.current = true;
    } else if (wasFetching.current) {
      wasFetching.current = false;
      setLastSyncedAt(new Date().toISOString());
    }
  }, [fetching]);

  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, []);

  const status: Status = fetching > 0 ? "syncing" : hidden ? "paused" : "live";
  const meta = STATUS_META[status];
  const updated = status === "live" && lastSyncedAt ? timeAgo(lastSyncedAt) : null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        {status === "syncing" ? (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-70 motion-safe:animate-ping",
              meta.dot
            )}
          />
        ) : null}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", meta.dot)} />
      </span>
      <span>
        {meta.label}
        {updated ? <span className="text-muted-foreground/70"> · updated {updated}</span> : null}
      </span>
      <InfoTooltip>
        Data refreshes automatically every 15s and whenever you return to this tab. Auto-refresh
        pauses while the tab is in the background.
      </InfoTooltip>
    </div>
  );
}
