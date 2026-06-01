import { Link } from "react-router-dom";

import { statusLabel } from "../../lib/format";
import type { Monitor } from "../../types";
import { FleetStatusDot } from "./FleetStatusDot";

// The resting tier collapses to a wrap of compact chips so the *whole* fleet
// stays visible on one screen without the routine monitors stealing attention.
export function FleetRestingStrip({ monitors }: { monitors: Monitor[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {monitors.map((monitor) => (
        <Link
          key={monitor.id}
          to={`/monitors/${monitor.id}`}
          title={`${monitor.name} — ${statusLabel(monitor.status)}`}
          className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FleetStatusDot status={monitor.status} enabled={monitor.enabled} />
          <span className="truncate">{monitor.name}</span>
        </Link>
      ))}
    </div>
  );
}
