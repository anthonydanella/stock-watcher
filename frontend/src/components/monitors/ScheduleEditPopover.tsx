import { LoaderCircle } from "lucide-react";
import React from "react";
import { toast } from "sonner";

import { api } from "../../api";
import { errorMessage, formatDate } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { Monitor } from "../../types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Slider } from "../ui/slider";

const INTERVAL_PRESETS: { label: string; seconds: number }[] = [
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
  { label: "1h", seconds: 3600 }
];

export function ScheduleEditPopover({
  monitor,
  onSaved,
  children
}: {
  monitor: Monitor;
  onSaved: (updated: Monitor) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [interval, setInterval] = React.useState<string>(String(monitor.interval_seconds));
  const [jitter, setJitter] = React.useState<number>(monitor.jitter_percent);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setInterval(String(monitor.interval_seconds));
    setJitter(monitor.jitter_percent);
  }, [open, monitor.interval_seconds, monitor.jitter_percent]);

  const intervalParsed = parseInterval(interval);
  const dirty =
    intervalParsed.kind === "ok"
      ? intervalParsed.value !== monitor.interval_seconds || jitter !== monitor.jitter_percent
      : false;
  const jitterWindow =
    intervalParsed.kind === "ok"
      ? Math.round((intervalParsed.value * jitter) / 100)
      : Math.round((monitor.interval_seconds * monitor.jitter_percent) / 100);

  async function save() {
    if (intervalParsed.kind !== "ok") {
      toast.error(intervalParsed.message);
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateMonitor(monitor.id, {
        ...monitor,
        interval_seconds: intervalParsed.value,
        jitter_percent: jitter,
        check_mode: "browser"
      });
      onSaved(updated);
      toast.success("Schedule updated");
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not update schedule"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Schedule for ${monitor.name}`}
        className="-mx-1 -my-0.5 flex w-full flex-col items-start gap-0 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {children}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-80">
        <div className="space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Next check</div>
            <div className="font-mono text-sm">
              {monitor.enabled
                ? monitor.next_check_at
                  ? formatDate(monitor.next_check_at)
                  : "—"
                : "Paused"}
            </div>
            {monitor.cooldown_until ? (
              <div className="mt-0.5 text-[11px] text-violet-700 dark:text-violet-300">
                Cooling until {formatDate(monitor.cooldown_until)}
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <label
              htmlFor={`interval-${monitor.id}`}
              className="block text-xs font-medium text-foreground"
            >
              Check interval
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={`interval-${monitor.id}`}
                type="number"
                inputMode="numeric"
                min={30}
                step={1}
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                disabled={saving}
                className="h-8 max-w-28"
                aria-invalid={intervalParsed.kind !== "ok"}
              />
              <span className="text-xs text-muted-foreground">seconds</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {INTERVAL_PRESETS.map((preset) => {
                const active =
                  intervalParsed.kind === "ok" && intervalParsed.value === preset.seconds;
                return (
                  <button
                    key={preset.seconds}
                    type="button"
                    onClick={() => setInterval(String(preset.seconds))}
                    disabled={saving}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">Minimum 30 seconds.</p>
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <div className="flex items-baseline justify-between">
              <label
                htmlFor={`jitter-${monitor.id}`}
                className="block text-xs font-medium text-foreground"
              >
                Random jitter
              </label>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {jitter}% (±{formatSeconds(jitterWindow)})
              </span>
            </div>
            <Slider
              value={[jitter]}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? value[0] : value;
                if (typeof next === "number") setJitter(next);
              }}
              min={0}
              max={100}
              step={5}
              disabled={saving}
            />
            <p className="text-[11px] text-muted-foreground">
              Spreads checks so similar monitors don't all hit a site at once.
            </p>
          </div>

          <div className="flex justify-end border-t pt-3">
            <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : "Save schedule"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type IntervalParse = { kind: "ok"; value: number } | { kind: "error"; message: string };

function parseInterval(value: string): IntervalParse {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "error", message: "Interval is required" };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return { kind: "error", message: "Interval must be a whole number of seconds" };
  }
  if (parsed < 30) return { kind: "error", message: "Interval must be at least 30 seconds" };
  return { kind: "ok", value: parsed };
}

function formatSeconds(total: number): string {
  if (total <= 0) return "0s";
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) {
    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
