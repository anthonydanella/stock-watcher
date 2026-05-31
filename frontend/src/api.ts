import type {
  AppSettings,
  CheckAttempt,
  EventRow,
  Monitor,
  NotificationRule,
  NotificationRuleInput,
  RuleLabResult,
  RuleSuggestion,
  SchedulerStatus
} from "./types";

type SuggestRuleInput = {
  url: string;
  hint?: string;
  other_state_sample?: string;
  stock_mode?: Monitor["stock_mode"];
  rule_type?: Monitor["rule_type"];
  selector_or_path?: string;
  user_agent_mode?: string;
  timeout_seconds?: number;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    ...init
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(body, response.status));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  monitors: () => request<Monitor[]>("/api/monitors"),
  monitor: (id: string | number) => request<Monitor>(`/api/monitors/${id}`),
  createMonitor: (monitor: Partial<Monitor>) =>
    request<Monitor>("/api/monitors", { method: "POST", body: JSON.stringify(monitor) }),
  updateMonitor: (id: string | number, monitor: Partial<Monitor>) =>
    request<Monitor>(`/api/monitors/${id}`, { method: "PUT", body: JSON.stringify(monitor) }),
  deleteMonitor: (id: string | number) =>
    request<void>(`/api/monitors/${id}`, { method: "DELETE" }),
  toggleMonitor: (id: string | number) =>
    request<Monitor>(`/api/monitors/${id}/toggle`, { method: "POST" }),
  runMonitor: (id: string | number) =>
    request<Monitor>(`/api/monitors/${id}/run`, { method: "POST" }),
  monitorHistory: (id: string | number, limit = 200) =>
    request<CheckAttempt[]>(`/api/monitors/${id}/history?limit=${limit}`),
  testMonitor: (id: string | number) =>
    request<{ matched: boolean; evidence: string }>(`/api/monitors/${id}/test`, { method: "POST" }),
  ruleLab: (monitor: Partial<Monitor>) =>
    request<RuleLabResult>("/api/rule-lab", {
      method: "POST",
      body: JSON.stringify({ ...monitor, check_mode: "browser" })
    }),
  settings: () => request<AppSettings>("/api/settings"),
  saveSettings: (settings: AppSettings) =>
    request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(settings) }),
  testNotification: () =>
    request<{ sent: boolean }>("/api/settings/test-notification", { method: "POST" }),
  testWebhook: () => request<{ sent: boolean }>("/api/webhook/test", { method: "POST" }),
  pushPublicKey: () => request<{ key: string; configured: boolean }>("/api/push/public-key"),
  pushSubscribe: (subscription: PushSubscriptionJSON) =>
    request<{ ok: boolean }>("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription)
    }),
  pushUnsubscribe: (endpoint: string) =>
    request<{ ok: boolean }>("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint })
    }),
  testPush: () => request<{ sent: boolean }>("/api/push/test", { method: "POST" }),
  schedulerStatus: () => request<SchedulerStatus>("/api/scheduler/status"),
  events: () => request<EventRow[]>("/api/events"),
  notificationRules: () => request<NotificationRule[]>("/api/notification-rules"),
  createNotificationRule: (rule: NotificationRuleInput) =>
    request<NotificationRule>("/api/notification-rules", {
      method: "POST",
      body: JSON.stringify(rule)
    }),
  updateNotificationRule: (id: number, rule: NotificationRuleInput) =>
    request<NotificationRule>(`/api/notification-rules/${id}`, {
      method: "PUT",
      body: JSON.stringify(rule)
    }),
  deleteNotificationRule: (id: number) =>
    request<void>(`/api/notification-rules/${id}`, { method: "DELETE" }),
  suggestRule: (input: SuggestRuleInput) =>
    request<RuleSuggestion>("/api/llm/suggest-rule", {
      method: "POST",
      body: JSON.stringify({
        url: input.url,
        hint: input.hint ?? "",
        other_state_sample: input.other_state_sample ?? "",
        stock_mode: input.stock_mode ?? "binary",
        rule_type: input.rule_type ?? "text",
        selector_or_path: input.selector_or_path ?? "",
        user_agent_mode: input.user_agent_mode ?? "random",
        timeout_seconds: input.timeout_seconds ?? 20
      })
    })
};

function apiErrorMessage(body: unknown, status: number) {
  if (!isRecord(body)) return `Request failed: ${status}`;
  const detail = body.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => validationMessage(item)).filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  return `Request failed: ${status}`;
}

function validationMessage(item: unknown) {
  if (!isRecord(item)) return "";
  const message = typeof item.msg === "string" ? item.msg : "";
  const field = Array.isArray(item.loc)
    ? item.loc
        .filter((part) => typeof part === "string" || typeof part === "number")
        .filter((part) => part !== "body")
        .join(".")
    : "";
  if (field && message) return `${field}: ${message}`;
  return message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
