import type { Monitor } from "../types";

export const blankMonitor: Partial<Monitor> = {
  name: "",
  url: "",
  enabled: true,
  check_mode: "browser",
  interval_seconds: 900,
  jitter_percent: 20,
  rule_type: "text",
  selector_or_path: "",
  match_mode: "contains",
  match_value: "in stock",
  user_agent_mode: "random",
  timeout_seconds: 20,
  stock_mode: "binary",
  quantity_pattern: "",
  low_stock_threshold: null,
  notifications_enabled: true,
  notify_on_stock_change: true,
  notify_on_error: true,
  notify_on_challenge: true
};

export function isFullMonitor(monitor: Partial<Monitor>): monitor is Monitor {
  return typeof monitor.id === "number" && typeof monitor.status === "string";
}

export function isCoolingDown(monitor: Monitor): boolean {
  if (!monitor.cooldown_until) return false;
  const t = new Date(monitor.cooldown_until).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

export function monitorCopyPayload(monitor: Monitor): Partial<Monitor> {
  return {
    name: `${monitor.name} (copy)`,
    url: monitor.url,
    enabled: monitor.enabled,
    check_mode: "browser",
    interval_seconds: monitor.interval_seconds,
    jitter_percent: monitor.jitter_percent,
    rule_type: monitor.rule_type,
    selector_or_path: monitor.selector_or_path,
    match_mode: monitor.match_mode,
    match_value: monitor.match_value,
    user_agent_mode: monitor.user_agent_mode,
    timeout_seconds: monitor.timeout_seconds,
    stock_mode: monitor.stock_mode,
    quantity_pattern: monitor.quantity_pattern,
    low_stock_threshold: monitor.low_stock_threshold,
    notifications_enabled: monitor.notifications_enabled,
    notify_on_stock_change: monitor.notify_on_stock_change,
    notify_on_error: monitor.notify_on_error,
    notify_on_challenge: monitor.notify_on_challenge
  };
}
