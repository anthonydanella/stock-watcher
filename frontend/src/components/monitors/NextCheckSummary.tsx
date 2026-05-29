import { formatCadence, formatShortDate, timeAgo } from "../../lib/format";
import type { Monitor } from "../../types";

export function NextCheckSummary({ monitor, cooling }: { monitor: Monitor; cooling: boolean }) {
  if (!monitor.enabled) {
    return (
      <>
        <span className="block leading-tight lg:truncate">Paused</span>
        <span className="block text-xs leading-tight text-muted-foreground lg:truncate">
          {formatCadence(monitor.interval_seconds, monitor.jitter_percent)}
        </span>
      </>
    );
  }
  if (cooling) {
    return (
      <>
        <span className="block leading-tight text-violet-700 lg:truncate dark:text-violet-300">
          Cooling {timeAgo(monitor.cooldown_until)}
        </span>
        <span className="block text-xs leading-tight text-muted-foreground lg:truncate">
          then {formatShortDate(monitor.cooldown_until)}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="block leading-tight lg:truncate">
        {monitor.next_check_at ? formatShortDate(monitor.next_check_at) : "—"}
      </span>
      <span className="block text-xs leading-tight text-muted-foreground lg:truncate">
        {formatCadence(monitor.interval_seconds, monitor.jitter_percent)}
      </span>
    </>
  );
}
