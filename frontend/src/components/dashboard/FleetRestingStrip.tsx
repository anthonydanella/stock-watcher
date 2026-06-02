import { PackageX } from "lucide-react";
import { Link } from "react-router-dom";

import { statusLabel, timeAgo } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { Monitor } from "../../types";
import { FleetStatusDot } from "./FleetStatusDot";
import { recentlySoldOut } from "./helpers";

// The resting tier collapses to a wrap of compact chips so the *whole* fleet
// stays visible on one screen without the routine monitors stealing attention.
// One exception gets a quiet highlight: a monitor that just dropped out of stock
// ("you just missed it"). It's still not actionable, so it stays here rather
// than jumping to "Needs attention" — it just gets a fill + "sold out <when>"
// for the short window the recency check covers.
export function FleetRestingStrip({ monitors }: { monitors: Monitor[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {monitors.map((monitor) => {
        const soldOut = recentlySoldOut(monitor);
        const ago = soldOut ? timeAgo(monitor.last_status_change_at) : "";
        return (
          <Link
            key={monitor.id}
            to={`/monitors/${monitor.id}`}
            title={
              soldOut
                ? `${monitor.name} — sold out ${ago}`
                : `${monitor.name} — ${statusLabel(monitor.status)}`
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              soldOut
                ? "max-w-[18rem] bg-secondary text-foreground hover:bg-secondary/80"
                : "max-w-[14rem] bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <FleetStatusDot status={monitor.status} enabled={monitor.enabled} />
            <span className="truncate">{monitor.name}</span>
            {soldOut && ago ? (
              <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                <PackageX className="h-3 w-3" aria-hidden="true" />
                sold out {ago}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
