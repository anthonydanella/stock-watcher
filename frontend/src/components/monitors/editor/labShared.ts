import type { Monitor } from "../../../types";

export function labPayload(monitor: Partial<Monitor>): Partial<Monitor> {
  return {
    ...monitor,
    name: (monitor.name ?? "").trim() || "Rule lab",
    enabled: monitor.enabled ?? true,
    check_mode: "browser",
    interval_seconds: monitor.interval_seconds ?? 900,
    jitter_percent: monitor.jitter_percent ?? 20,
    rule_type: monitor.rule_type ?? "text",
    selector_or_path: monitor.selector_or_path ?? "",
    match_mode: monitor.match_mode ?? "contains",
    match_value: monitor.match_value ?? "",
    user_agent_mode: monitor.user_agent_mode ?? "random",
    timeout_seconds: monitor.timeout_seconds ?? 20,
    stock_mode: monitor.stock_mode ?? "binary",
    quantity_pattern: monitor.quantity_pattern ?? "",
    low_stock_threshold: monitor.low_stock_threshold ?? null
  };
}

export function labSignature(monitor: Partial<Monitor>): string {
  return JSON.stringify(labPayload(monitor));
}

export function validLabUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
