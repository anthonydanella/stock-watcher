import { statusBadgeClass, statusLabel } from "../../lib/format";
import { cn } from "../../lib/utils";
import { ALERT_STATUSES, type AlertStatus } from "../../types";
import { InfoTooltip } from "../shared/InfoTooltip";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";

const STATUS_DESCRIPTIONS: Record<AlertStatus, string> = {
  in_stock: "Item is available",
  low_stock: "Quantity below the low-stock threshold",
  out_of_stock: "Item is sold out",
  error: "Check failed",
  challenge: "CAPTCHA or bot challenge detected",
  unknown: "Never checked or status unclear"
};

export function TriggerStatusPicker({
  value,
  onToggle
}: {
  value: AlertStatus[];
  onToggle: (status: AlertStatus, checked: boolean) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-3 rounded-md border bg-background p-3">
      <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Trigger when status is
        <InfoTooltip>
          The rule looks at the live status of every monitor in scope and counts the ones in any of
          the selected statuses.
        </InfoTooltip>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {ALERT_STATUSES.map((status) => {
          const checked = value.includes(status);
          const inputId = `alert-status-${status}`;
          return (
            <label
              key={status}
              htmlFor={inputId}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                checked ? "border-primary bg-accent" : "border-border bg-card hover:bg-accent/40"
              )}
            >
              <Checkbox
                id={inputId}
                checked={checked}
                onCheckedChange={(value) => onToggle(status, Boolean(value))}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge className={statusBadgeClass(status)}>{statusLabel(status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{STATUS_DESCRIPTIONS[status]}</p>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
