import type { Monitor } from "../types";

export function statusLabel(status: string | null | undefined) {
  return sentenceCase((status || "unknown").split("_").join(" "));
}

export function eventLabel(eventType: string | null | undefined) {
  return sentenceCase((eventType || "event").split("_").join(" "));
}

function sentenceCase(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function failureTypeLabel(errorType: string | null | undefined) {
  const labels: Record<string, string> = {
    dns_error: "DNS",
    timeout_error: "Timeout",
    http_error: "HTTP error",
    selector_error: "Selector error",
    quantity_parse_error: "Quantity parse",
    screenshot_error: "Screenshot error",
    notification_error: "Notification error",
    error: "Error"
  };
  return labels[errorType || ""] ?? statusLabel(errorType || "error");
}

export function formatQuantity(monitor: Pick<Monitor, "stock_mode" | "last_quantity">): string {
  if (monitor.stock_mode !== "quantity") return "";
  if (monitor.last_quantity == null) return "—";
  return `${monitor.last_quantity.toLocaleString()} in stock`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}

export function formatDuration(ms: number | null | undefined) {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

export function formatSeconds(value: number | null | undefined) {
  const seconds = value ?? 0;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function formatCadence(
  intervalSeconds: number | null | undefined,
  jitterPercent: number | null | undefined
) {
  const jitter = jitterPercent ?? 0;
  return jitter
    ? `${formatSeconds(intervalSeconds)} + ${jitter}% jitter`
    : formatSeconds(intervalSeconds);
}

export function formatScheduleState(monitor: Monitor, short = false) {
  const formatter = short ? formatShortDate : formatDate;
  if (!monitor.enabled) return "Paused";
  if (isFuture(monitor.cooldown_until)) {
    return short
      ? `Cooldown until ${formatter(monitor.cooldown_until)}`
      : `Cooling down until ${formatter(monitor.cooldown_until)}`;
  }
  return formatter(monitor.next_check_at);
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function statusBadgeClass(status: string | null | undefined) {
  if (status === "in_stock" || status === "active" || status === "ok" || status === "healthy") {
    return "rounded-full border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (status === "low_stock") {
    return "rounded-full border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-950/40 dark:text-yellow-200";
  }
  if (status === "out_of_stock") {
    return "rounded-full border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200";
  }
  if (status === "error" || status === "degraded") {
    return "rounded-full border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200";
  }
  if (status === "challenge") {
    return "rounded-full border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/40 dark:text-violet-200";
  }
  if (status === "paused" || status === "idle" || status === "unknown") {
    return "rounded-full border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:text-zinc-300";
  }
  return "rounded-full";
}

export const warningAlertClass =
  "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200";
export const successAlertClass =
  "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200";

function isFuture(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}
