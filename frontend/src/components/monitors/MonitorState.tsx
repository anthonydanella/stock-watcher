import {
  failureTypeLabel,
  formatCadence,
  formatDate,
  formatScheduleState,
  statusLabel
} from "../../lib/format";
import type { Monitor } from "../../types";
import { Info } from "../shared/Info";
import { PanelCard } from "../shared/PanelCard";
import { CardContent, CardHeader, CardTitle } from "../ui/card";

export function MonitorState({ monitor }: { monitor: Monitor }) {
  const isQuantity = monitor.stock_mode === "quantity";
  return (
    <PanelCard>
      <CardHeader>
        <CardTitle>Current state</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <Info label="Status" value={statusLabel(monitor.status)} />
        {isQuantity ? (
          <Info
            label="Quantity"
            value={
              monitor.last_quantity != null
                ? `${monitor.last_quantity.toLocaleString()}${monitor.last_quantity_at ? ` (as of ${formatDate(monitor.last_quantity_at)})` : ""}`
                : "—"
            }
          />
        ) : (
          <Info
            label="Last failure"
            value={monitor.last_error_type ? failureTypeLabel(monitor.last_error_type) : "-"}
          />
        )}
        <Info label="Last checked" value={formatDate(monitor.last_checked_at)} />
        {isQuantity ? (
          <Info
            label="Last failure"
            value={monitor.last_error_type ? failureTypeLabel(monitor.last_error_type) : "-"}
          />
        ) : null}
        <Info label="Next check" value={formatScheduleState(monitor)} />
        <Info
          label="Cadence"
          value={formatCadence(monitor.interval_seconds, monitor.jitter_percent)}
        />
        <Info label="Failures" value={String(monitor.failure_count)} />
        <Info label="Challenges" value={String(monitor.challenge_count)} />
        <Info label="Cooldown until" value={formatDate(monitor.cooldown_until)} />
        {isQuantity ? (
          <>
            <Info
              label="Low-stock threshold"
              value={
                monitor.low_stock_threshold != null ? `≤ ${monitor.low_stock_threshold}` : "Not set"
              }
            />
            <Info label="Quantity regex" value={monitor.quantity_pattern || "first integer"} />
          </>
        ) : null}
        <div className="min-w-0 md:col-span-3">
          <p className="text-xs font-medium text-muted-foreground">Evidence</p>
          <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-secondary p-3 text-sm [overflow-wrap:anywhere]">
            {monitor.last_evidence || "-"}
          </p>
        </div>
      </CardContent>
    </PanelCard>
  );
}
