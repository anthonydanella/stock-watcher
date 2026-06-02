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
    return "rounded-full surface-success";
  }
  if (status === "low_stock") {
    return "rounded-full surface-caution";
  }
  if (status === "out_of_stock") {
    return "rounded-full surface-neutral";
  }
  if (status === "error" || status === "degraded") {
    return "rounded-full surface-warning";
  }
  if (status === "challenge") {
    return "rounded-full surface-special";
  }
  if (status === "paused" || status === "idle" || status === "unknown") {
    return "rounded-full surface-neutral";
  }
  return "rounded-full";
}

export function eventBadgeClass(eventType: string | null | undefined) {
  switch (eventType) {
    case "recovery":
    case "alert_triggered":
      return "rounded-full surface-success";
    case "challenge":
      return "rounded-full surface-special";
    case "error":
    case "screenshot_error":
      return "rounded-full surface-warning";
    case "notification_error":
      return "rounded-full surface-danger";
    case "status_change":
      return "rounded-full surface-info";
    default:
      // manual + anything unrecognized: quiet, neutral pill so routine entries
      // recede and the colored ones above stand out when scanning.
      return "rounded-full surface-neutral";
  }
}

export const warningAlertClass = "surface-warning";
export const successAlertClass = "surface-success";

function isFuture(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}
