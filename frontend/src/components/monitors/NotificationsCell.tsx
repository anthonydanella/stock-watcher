import { AlertTriangle, Bell, BellOff } from "lucide-react";
import React from "react";
import { toast } from "sonner";

import { api } from "../../api";
import { errorMessage } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { Monitor } from "../../types";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Switch } from "../ui/switch";

type ToggleKey =
  | "notifications_enabled"
  | "notify_on_stock_change"
  | "notify_on_error"
  | "notify_on_challenge";

const EVENT_TOGGLES: {
  key: Exclude<ToggleKey, "notifications_enabled">;
  label: string;
  help: string;
}[] = [
  {
    key: "notify_on_stock_change",
    label: "Stock change",
    help: "When the monitor's status flips (in / out / low stock)."
  },
  {
    key: "notify_on_error",
    label: "Error",
    help: "When a check fails (DNS, timeout, selector error, etc.)."
  },
  {
    key: "notify_on_challenge",
    label: "Challenge",
    help: "When a CAPTCHA / anti-bot page is detected."
  }
];

export function NotificationsCell({
  monitor,
  onSaved
}: {
  monitor: Monitor;
  onSaved: (updated: Monitor) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<ToggleKey | null>(null);
  const state = describeState(monitor);

  async function toggle(key: ToggleKey, next: boolean) {
    if (pending) return;
    setPending(key);
    try {
      const updated = await api.updateMonitor(monitor.id, {
        ...monitor,
        [key]: next,
        check_mode: "browser"
      });
      onSaved(updated);
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not update notifications"));
    } finally {
      setPending(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={state.ariaLabel}
        title={state.summary}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          state.tone
        )}
      >
        <state.Icon className="h-4 w-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-72 gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Notifications</div>
            <div className="text-[11px] text-muted-foreground">{state.summary}</div>
          </div>
          <Switch
            checked={monitor.notifications_enabled}
            disabled={pending === "notifications_enabled"}
            onCheckedChange={(checked) => void toggle("notifications_enabled", checked)}
            aria-label="Master notification toggle"
          />
        </div>

        <div
          className={cn(
            "space-y-2 rounded-md border bg-secondary/30 p-2",
            !monitor.notifications_enabled && "opacity-60"
          )}
        >
          {EVENT_TOGGLES.map((option) => {
            const checked = monitor[option.key];
            const isPending = pending === option.key;
            return (
              <div key={option.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">{option.label}</div>
                  <div className="text-[11px] text-muted-foreground">{option.help}</div>
                </div>
                <Switch
                  size="sm"
                  checked={checked}
                  disabled={!monitor.notifications_enabled || isPending}
                  onCheckedChange={(next) => void toggle(option.key, next)}
                  aria-label={`Notify on ${option.label.toLowerCase()}`}
                />
              </div>
            );
          })}
        </div>

        {state.warning ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{state.warning}</span>
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Delivered via ntfy. Configure the topic in Settings if alerts aren't arriving.
        </p>
      </PopoverContent>
    </Popover>
  );
}

type CellState = {
  Icon: typeof Bell;
  tone: string;
  summary: string;
  ariaLabel: string;
  warning: string | null;
};

function describeState(monitor: Monitor): CellState {
  if (!monitor.notifications_enabled) {
    return {
      Icon: BellOff,
      tone: "text-muted-foreground",
      summary: "Notifications muted",
      ariaLabel: "Notifications off",
      warning: null
    };
  }
  const enabled = [
    monitor.notify_on_stock_change,
    monitor.notify_on_error,
    monitor.notify_on_challenge
  ].filter(Boolean).length;
  if (enabled === 0) {
    return {
      Icon: Bell,
      tone: "text-amber-600 dark:text-amber-400",
      summary: "Master on, but no events selected",
      ariaLabel: "Notifications on but no events selected",
      warning: "No event types are enabled — this monitor will never notify."
    };
  }
  return {
    Icon: Bell,
    tone: "text-primary",
    summary: `On · ${enabled} of 3 events`,
    ariaLabel: `Notifications on, ${enabled} of 3 events`,
    warning: null
  };
}
