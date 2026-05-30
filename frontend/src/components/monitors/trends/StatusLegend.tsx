import { cn } from "../../../lib/utils";
import { STATUS_DETAILS } from "./constants";

export function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {Object.entries(STATUS_DETAILS).map(([status, details]) => (
        <span key={status} className="inline-flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-full", details.dotClass)} />
          {details.label}
        </span>
      ))}
    </div>
  );
}
