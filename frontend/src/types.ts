export type StockMode = "binary" | "quantity";

export type Monitor = {
  id: number;
  name: string;
  url: string;
  enabled: boolean;
  check_mode: "browser";
  interval_seconds: number;
  jitter_percent: number;
  rule_type: "css" | "text";
  selector_or_path: string;
  match_mode: "contains" | "not_contains" | "equals" | "regex" | "exists";
  match_value: string;
  user_agent_mode: string;
  timeout_seconds: number;
  stock_mode: StockMode;
  quantity_pattern: string;
  low_stock_threshold: number | null;
  status: string;
  last_checked_at: string | null;
  next_check_at: string | null;
  failure_count: number;
  challenge_count: number;
  cooldown_until: string | null;
  last_error: string;
  last_error_type: string;
  last_evidence: string;
  last_quantity: number | null;
  last_quantity_at: string | null;
  last_screenshot_at: string | null;
  last_screenshot_error: string;
  last_screenshot_url: string | null;
  recent_quantities: number[];
  notifications_enabled: boolean;
  notify_on_stock_change: boolean;
  notify_on_error: boolean;
  notify_on_challenge: boolean;
  tags: string[];
};

export type CheckAttempt = {
  id: number;
  monitor_id: number;
  status: string;
  ok: boolean;
  duration_ms: number;
  http_status: number | null;
  error: string;
  error_type: string;
  evidence: string;
  reason: string;
  created_at: string | null;
  quantity: number | null;
};

export type AppSettings = {
  ntfy_enabled: boolean;
  ntfy_server: string;
  ntfy_topic: string;
  ntfy_token: string;
  ntfy_priority: string;
  llm_base_url: string;
  llm_model: string;
  llm_extra_params: string;
  llm_configured?: boolean;
};

export type RuleSuggestion = {
  stock_mode: StockMode;
  rule_type: Monitor["rule_type"];
  selector_or_path: string;
  match_mode: Monitor["match_mode"];
  match_value: string;
  quantity_pattern: string;
  low_stock_threshold: number | null;
  explanation: string;
};

export type SchedulerStatus = {
  running: boolean;
  loop_interval_seconds: number;
  due_monitor_count: number;
  next_due_at: string | null;
  monitor_counts: {
    total: number;
    enabled: number;
    paused: number;
    cooling_down: number;
  };
  last_run: {
    started_at: string | null;
    finished_at: string | null;
    due_count: number;
  };
  last_loop_error: string | null;
  last_loop_error_at: string | null;
  browser_checks: {
    available: boolean;
    reason: string;
  };
  database_path: string;
  retention: {
    events: number;
    attempts: number;
  };
};

export type EventRow = {
  id: number;
  monitor_id: number | null;
  monitor_name: string | null;
  event_type: string;
  old_status: string | null;
  new_status: string | null;
  message: string;
  evidence: string;
  created_at: string;
};

export type RuleLabElement = {
  index: number;
  tag: string;
  text: string;
  value: string;
  html: string;
  attributes: Record<string, string>;
};

export const ALERT_STATUSES = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "error",
  "challenge",
  "unknown"
] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export type NotificationRule = {
  id: number;
  name: string;
  enabled: boolean;
  monitor_ids: number[];
  trigger_statuses: AlertStatus[];
  threshold: number;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  last_satisfied: boolean;
  current_matching_count: number;
  current_matching_monitor_ids: number[];
  currently_satisfied: boolean;
};

export type NotificationRuleInput = {
  name: string;
  enabled: boolean;
  monitor_ids: number[];
  trigger_statuses: AlertStatus[];
  threshold: number;
  cooldown_minutes: number;
};

export type RuleLabResult = {
  matched: boolean;
  evidence: string;
  reason: string;
  fetch: {
    status_code: number | null;
    content_type: string;
    duration_ms: number;
    content_length: number;
    screenshot: string | null;
    screenshot_error: string;
    error_type: string;
  };
  diagnostics: {
    matched: boolean;
    evidence: string;
    reason: string;
    rule_type: Monitor["rule_type"];
    selector_or_path: string;
    match_mode: Monitor["match_mode"];
    match_value: string;
    extracted_text: string;
    extracted_text_length: number;
    extracted_text_is_excerpt: boolean;
    extracted_value: unknown;
    element_count: number;
    elements: RuleLabElement[];
    regex: {
      pattern: string;
      valid: boolean;
      matched: boolean;
      match_count: number;
      matches: string[];
      error: string;
    } | null;
    match_contexts: string[];
    quantity?: number | null;
    quantity_pattern?: string;
    quantity_error?: string;
  } | null;
};
