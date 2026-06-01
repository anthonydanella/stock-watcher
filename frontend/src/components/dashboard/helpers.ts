import { statusLabel, timeAgo } from "../../lib/format";
import { isCoolingDown } from "../../lib/monitor";
import type { EventRow, Monitor } from "../../types";

/** Map of monitor id → its most recent status-change event (for the "last change" column). */
export type LastChangeMap = Record<number, EventRow>;

// Statuses that demand a look right now. `out_of_stock` is the normal waiting
// state for most monitors, so it rests; `in_stock`/`low_stock` are the payoff,
// and `error`/`challenge` are problems. Paused monitors never demand attention.
const ATTENTION_STATUSES = new Set(["in_stock", "low_stock", "error", "challenge"]);

export function needsAttention(monitor: Monitor): boolean {
  if (!monitor.enabled) return false;
  if (ATTENTION_STATUSES.has(monitor.status)) return true;
  return isCoolingDown(monitor);
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

function changedAt(monitor: Monitor, lastChanges: LastChangeMap): number {
  const event = lastChanges[monitor.id];
  if (!event) return 0;
  const time = new Date(event.created_at).getTime();
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
export function partitionFleet(
  monitors: Monitor[],
  lastChanges: LastChangeMap
): { attention: Monitor[]; resting: Monitor[] } {
  const attention: Monitor[] = [];
  const resting: Monitor[] = [];
  for (const monitor of monitors) {
    (needsAttention(monitor) ? attention : resting).push(monitor);
  }
  attention.sort((a, b) => {
    const rank = attentionRank(a) - attentionRank(b);
    if (rank !== 0) return rank;
    const recency = changedAt(b, lastChanges) - changedAt(a, lastChanges);
    if (recency !== 0) return recency;
    return byName(a, b);
  });
  resting.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const recency = changedAt(b, lastChanges) - changedAt(a, lastChanges);
    if (recency !== 0) return recency;
    return byName(a, b);
  });
  return { attention, resting };
}

export function statusDotClass(status: string | null | undefined, enabled: boolean): string {
  if (!enabled) return "bg-zinc-400/70 dark:bg-zinc-500/60";
  switch (status) {
    case "in_stock":
      return "bg-emerald-500";
    case "low_stock":
      return "bg-yellow-500";
    case "out_of_stock":
      return "bg-slate-400 dark:bg-slate-500";
    case "error":
      return "bg-amber-500";
    case "challenge":
      return "bg-violet-500";
    default:
      return "bg-zinc-400";
  }
}

// Tints the "current state" text so an in-stock hit pops, while the routine
// out-of-stock/paused states stay quiet.
export function statusTextClass(status: string | null | undefined, enabled: boolean): string {
  if (!enabled) return "text-muted-foreground";
  switch (status) {
    case "in_stock":
      return "font-medium text-emerald-600 dark:text-emerald-400";
    case "low_stock":
      return "font-medium text-yellow-600 dark:text-yellow-400";
    case "error":
      return "text-amber-600 dark:text-amber-400";
    case "challenge":
      return "text-violet-600 dark:text-violet-400";
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
