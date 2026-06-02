import { statusLabel, timeAgo } from "../../lib/format";
import { isCoolingDown } from "../../lib/monitor";
import type { Monitor } from "../../types";

// Statuses that demand a look right now. `out_of_stock` is the normal waiting
// state for most monitors, so it rests; `in_stock`/`low_stock` are the payoff,
// and `error`/`challenge` are problems. Paused monitors never demand attention.
const ATTENTION_STATUSES = new Set(["in_stock", "low_stock", "error", "challenge"]);

export function needsAttention(monitor: Monitor): boolean {
  if (!monitor.enabled) return false;
  if (ATTENTION_STATUSES.has(monitor.status)) return true;
  return isCoolingDown(monitor);
}

// A monitor that just dropped from in/low stock to out of stock is the "you
// just missed it" case: not actionable (so it still rests), but worth a glance
// for a day after it happens. Plain out-of-stock — the steady waiting state —
// and a first-check unknown→out-of-stock do not qualify.
const RECENTLY_SOLD_OUT_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOST_AVAILABILITY_FROM = new Set(["in_stock", "low_stock"]);

export function recentlySoldOut(monitor: Monitor): boolean {
  if (monitor.status !== "out_of_stock") return false;
  if (!LOST_AVAILABILITY_FROM.has(monitor.last_status_change_from)) return false;
  if (!monitor.last_status_change_at) return false;
  const changed = new Date(monitor.last_status_change_at).getTime();
  if (Number.isNaN(changed)) return false;
  return Date.now() - changed <= RECENTLY_SOLD_OUT_WINDOW_MS;
}

// Lower rank floats to the top of the attention tier: opportunities first, then
// problems, then anything that's merely cooling down.
const STATUS_RANK: Record<string, number> = {
  in_stock: 0,
  low_stock: 1,
  challenge: 2,
  error: 3
};

function attentionRank(monitor: Monitor): number {
  const rank = STATUS_RANK[monitor.status];
  if (rank != null) return rank;
  return isCoolingDown(monitor) ? 4 : 9;
}

function changedAt(monitor: Monitor): number {
  if (!monitor.last_status_change_at) return 0;
  const time = new Date(monitor.last_status_change_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function byName(a: Monitor, b: Monitor): number {
  return a.name.localeCompare(b.name);
}

/**
 * Split the fleet into the monitors that need attention (sorted by urgency, then
 * by most-recent change) and the resting ones (sorted by most-recent change so
 * anything that just settled stays near the top).
 */
export function partitionFleet(monitors: Monitor[]): {
  attention: Monitor[];
  resting: Monitor[];
} {
  const attention: Monitor[] = [];
  const resting: Monitor[] = [];
  for (const monitor of monitors) {
    (needsAttention(monitor) ? attention : resting).push(monitor);
  }
  attention.sort((a, b) => {
    const rank = attentionRank(a) - attentionRank(b);
    if (rank !== 0) return rank;
    const recency = changedAt(b) - changedAt(a);
    if (recency !== 0) return recency;
    return byName(a, b);
  });
  resting.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const recency = changedAt(b) - changedAt(a);
    if (recency !== 0) return recency;
    return byName(a, b);
  });
  return { attention, resting };
}

export function statusDotClass(status: string | null | undefined, enabled: boolean): string {
  if (!enabled) return "bg-neutral-muted";
  switch (status) {
    case "in_stock":
      return "bg-success-solid";
    case "low_stock":
      return "bg-caution-solid";
    case "out_of_stock":
      return "bg-neutral-solid";
    case "error":
      return "bg-warning-solid";
    case "challenge":
      return "bg-special-solid";
    default:
      return "bg-neutral-solid";
  }
}

// Tints the "current state" text so an in-stock hit pops, while the routine
// out-of-stock/paused states stay quiet.
export function statusTextClass(status: string | null | undefined, enabled: boolean): string {
  if (!enabled) return "text-muted-foreground";
  switch (status) {
    case "in_stock":
      return "font-medium text-success-vivid";
    case "low_stock":
      return "font-medium text-caution-vivid";
    case "error":
      return "text-warning-vivid";
    case "challenge":
      return "text-special-vivid";
    default:
      return "text-muted-foreground";
  }
}

const SHORT_STATUS: Record<string, string> = {
  in_stock: "In",
  low_stock: "Low",
  out_of_stock: "Out",
  error: "Error",
  challenge: "Block",
  unknown: "?"
};

export function shortStatus(status: string | null | undefined): string {
  return SHORT_STATUS[status ?? ""] ?? statusLabel(status);
}

/** The current-state descriptor shown on each row: quantity when known, else the status label. */
export function stateText(monitor: Monitor): string {
  if (monitor.stock_mode === "quantity" && monitor.last_quantity != null) {
    return `${monitor.last_quantity.toLocaleString()} left`;
  }
  return statusLabel(monitor.status);
}

export function nextCheckText(monitor: Monitor): string {
  if (!monitor.enabled) return "Paused";
  if (isCoolingDown(monitor)) {
    const ago = timeAgo(monitor.cooldown_until);
    return ago ? `Cooling ${ago}` : "Cooling down";
  }
  const next = monitor.next_check_at ? timeAgo(monitor.next_check_at) : "";
  return next ? `Next ${next}` : "—";
}
