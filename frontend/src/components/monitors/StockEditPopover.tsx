import { LoaderCircle, Pencil } from "lucide-react";
import React from "react";
import { toast } from "sonner";

import { api } from "../../api";
import { errorMessage, formatDate } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { Monitor } from "../../types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { MonitorQuantitySparkline } from "./MonitorQuantitySparkline";

export function StockEditPopover({
  monitor,
  onSaved,
  children
}: {
  monitor: Monitor;
  onSaved: (updated: Monitor) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [threshold, setThreshold] = React.useState<string>(thresholdToInput(monitor));
  const [saving, setSaving] = React.useState(false);
  const trend = monitor.recent_quantities ?? [];

  React.useEffect(() => {
    if (open) setThreshold(thresholdToInput(monitor));
  }, [open, monitor]);

  const initial = thresholdToInput(monitor);
  const dirty = threshold.trim() !== initial.trim();

  async function save() {
    const parsed = parseThreshold(threshold);
    if (parsed === "invalid") {
      toast.error("Low-stock threshold must be a whole number ≥ 0 (or empty for none)");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateMonitor(monitor.id, {
        ...monitor,
        low_stock_threshold: parsed,
        check_mode: "browser"
      });
      onSaved(updated);
      toast.success("Threshold updated");
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not update threshold"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Stock details for ${monitor.name}`}
        className="-mx-1 flex min-h-11 w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-muted/50 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:min-h-0 lg:py-0.5"
      >
        {children}
        <Pencil
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground lg:hidden"
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-[min(20rem,calc(100vw-2rem))]">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">In stock</div>
              <div className="font-mono text-2xl font-semibold tabular-nums">
                {monitor.last_quantity != null ? monitor.last_quantity.toLocaleString() : "—"}
              </div>
            </div>
            {monitor.last_quantity_at ? (
              <div className="text-right text-[11px] text-muted-foreground">
                <div>Last value</div>
                <div className="font-mono">{formatDate(monitor.last_quantity_at)}</div>
              </div>
            ) : null}
          </div>

          {trend.length > 1 ? (
            <div className="rounded-md border bg-secondary/30 p-2">
              <MonitorQuantitySparkline
                values={trend}
                threshold={monitor.low_stock_threshold}
                width={288}
                height={72}
                className="w-full"
              />
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Last {trend.length} checks</span>
                {monitor.low_stock_threshold != null ? (
                  <span className="text-emerald-700/80 dark:text-emerald-300/80">
                    ⋯ low ≤ {monitor.low_stock_threshold}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-secondary/20 p-3 text-center text-xs text-muted-foreground">
              Not enough history yet to chart a trend.
            </div>
          )}

          <div className="space-y-1.5 border-t pt-3">
            <label
              htmlFor={`threshold-${monitor.id}`}
              className="block text-xs font-medium text-foreground"
            >
              Low-stock threshold
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={`threshold-${monitor.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={threshold}
                placeholder="None"
                onChange={(event) => setThreshold(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && dirty && !saving) {
                    event.preventDefault();
                    void save();
                  }
                }}
                disabled={saving}
                className="h-8 max-w-32"
              />
              <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
                {saving ? <LoaderCircle className={cn("h-3.5 w-3.5", "animate-spin")} /> : "Save"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Status flips to <span className="font-medium">Low stock</span> when quantity is at or
              below this number. Leave empty to disable.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function thresholdToInput(monitor: Monitor): string {
  return monitor.low_stock_threshold == null ? "" : String(monitor.low_stock_threshold);
}

function parseThreshold(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return "invalid";
  return parsed;
}
