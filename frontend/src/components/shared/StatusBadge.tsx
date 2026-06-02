import { statusBadgeClass, statusLabel } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

// Statuses that represent a live, actionable opportunity ("go buy it now") earn a
// softly pulsing dot, so the eye lands on them first when scanning a dense list.
const PULSE_STATUSES = new Set(["in_stock", "low_stock"]);

export function StatusBadge({
  status,
  className,
  live = true
}: {
  status: string | null | undefined;
  className?: string;
  /** Disabled/paused monitors keep the color but drop the pulse — nothing is live. */
  live?: boolean;
}) {
  const pulse = live && PULSE_STATUSES.has(status ?? "");
  return (
    <Badge className={cn(statusBadgeClass(status), className)} title={statusLabel(status)}>
      {pulse ? (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full motion-safe:animate-pulse",
            status === "low_stock" ? "bg-caution-solid" : "bg-success-solid"
          )}
        />
      ) : null}
      {statusLabel(status)}
    </Badge>
  );
}
