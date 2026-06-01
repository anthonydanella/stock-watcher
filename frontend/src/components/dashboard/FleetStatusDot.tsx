import { statusLabel } from "../../lib/format";
import { cn } from "../../lib/utils";
import { statusDotClass } from "./helpers";

// Live opportunities (in/low stock on an active monitor) get a soft ping so the
// eye lands on them first when scanning the fleet.
const PING_STATUSES = new Set(["in_stock", "low_stock"]);

export function FleetStatusDot({
  status,
  enabled,
  className
}: {
  status: string | null | undefined;
  enabled: boolean;
  className?: string;
}) {
  const ping = enabled && PING_STATUSES.has(status ?? "");
  const dot = statusDotClass(status, enabled);
  return (
    <span
      className={cn("relative flex h-2.5 w-2.5 shrink-0", className)}
      title={statusLabel(status)}
      aria-hidden="true"
    >
      {ping ? (
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping",
            dot
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", dot)} />
    </span>
  );
}
