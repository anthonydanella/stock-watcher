import { LoaderCircle, Pencil } from "lucide-react";
import React from "react";
import { toast } from "sonner";

import { api } from "../../api";
import { formatDuration, parseDuration } from "../../lib/duration";
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

const MIN_INTERVAL_SECONDS = 30;

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
  const [intervalText, setIntervalText] = React.useState<string>(() =>
    formatDuration(monitor.interval_seconds)
  );
  const [intervalSeconds, setIntervalSeconds] = React.useState<number>(monitor.interval_seconds);
  const [jitter, setJitter] = React.useState<number>(monitor.jitter_percent);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setIntervalText(formatDuration(monitor.interval_seconds));
    setIntervalSeconds(monitor.interval_seconds);
    setJitter(monitor.jitter_percent);
  }, [open, monitor.interval_seconds, monitor.jitter_percent]);

  const parsedFromText = parseDuration(intervalText);
  const textIsValid = parsedFromText != null && parsedFromText >= MIN_INTERVAL_SECONDS;
  const dirty = intervalSeconds !== monitor.interval_seconds || jitter !== monitor.jitter_percent;
  const jitterWindow = Math.round((intervalSeconds * jitter) / 100);

  function commitIntervalText(text: string) {
    const parsed = parseDuration(text);
    if (parsed != null && parsed >= MIN_INTERVAL_SECONDS) {
      setIntervalSeconds(parsed);
      setIntervalText(formatDuration(parsed));
    } else {
      // Roll back display to whatever value we last accepted.
      setIntervalText(formatDuration(intervalSeconds));
    }
  }

  function applyPreset(seconds: number) {
    setIntervalSeconds(seconds);
    setIntervalText(formatDuration(seconds));
  }

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      const updated = await api.updateMonitor(monitor.id, {
        ...monitor,
        interval_seconds: intervalSeconds,
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
        className="-mx-1 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:-my-0.5"
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0">{children}</span>
        <Pencil
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground lg:hidden"
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[min(20rem,calc(100vw-2rem))]">
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
              <div className="mt-0.5 text-[11px] text-special-accent">
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
            <Input
              id={`interval-${monitor.id}`}
              type="text"
              inputMode="text"
              value={intervalText}
              placeholder="5m"
              onChange={(event) => setIntervalText(event.target.value)}
              onBlur={(event) => commitIntervalText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitIntervalText(event.currentTarget.value);
                }
              }}
              disabled={saving}
              aria-invalid={!textIsValid}
              className="h-8"
            />
            <div className="flex flex-wrap gap-1">
              {INTERVAL_PRESETS.map((preset) => {
                const active = intervalSeconds === preset.seconds;
                return (
                  <button
                    key={preset.seconds}
                    type="button"
                    onClick={() => applyPreset(preset.seconds)}
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
            <p className="text-[11px] text-muted-foreground">
              Type a duration like <span className="font-mono">30s</span>,{" "}
              <span className="font-mono">5m</span>, or <span className="font-mono">1h30m</span>. A
              bare number is read as minutes. Minimum 30 seconds.
            </p>
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
