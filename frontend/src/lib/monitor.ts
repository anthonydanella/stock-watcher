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
