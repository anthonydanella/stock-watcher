import type { Monitor } from "../../../types";
import { type Choice, comparisonModes } from "./constants";

export type ValidationIssue = {
  tone: "error" | "warning";
  message: string;
};

export function serializeMonitor(monitor: Partial<Monitor>) {
  return JSON.stringify({
    name: monitor.name ?? "",
    url: monitor.url ?? "",
    enabled: Boolean(monitor.enabled),
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
    low_stock_threshold: monitor.low_stock_threshold ?? null,
    notifications_enabled: monitor.notifications_enabled ?? true,
    notify_on_stock_change: monitor.notify_on_stock_change ?? true,
    notify_on_error: monitor.notify_on_error ?? true,
    notify_on_challenge: monitor.notify_on_challenge ?? true,
    tags: monitor.tags ?? []
  });
}

export function validateMonitor(monitor: Partial<Monitor>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ruleType = monitor.rule_type ?? "text";
  const matchMode = monitor.match_mode ?? "contains";
  const stockMode = monitor.stock_mode ?? "binary";
  if (!(monitor.name ?? "").trim()) issues.push({ tone: "error", message: "Name is required." });
  if (!validUrl(monitor.url))
    issues.push({ tone: "error", message: "A valid product URL is required." });
  if (ruleType === "css" && !(monitor.selector_or_path ?? "").trim()) {
    issues.push({ tone: "error", message: "CSS rules need a selector." });
  }
  if (stockMode === "binary") {
    if (matchMode !== "exists" && !(monitor.match_value ?? "").trim()) {
      issues.push({ tone: "error", message: "Operand is required for this assertion." });
    }
    if (matchMode === "regex" && (monitor.match_value ?? "").trim()) {
      try {
        new RegExp(monitor.match_value ?? "");
      } catch {
        issues.push({ tone: "error", message: "Regex pattern is invalid." });
      }
    }
  } else {
    const pattern = (monitor.quantity_pattern ?? "").trim();
    if (pattern) {
      // The checker compiles quantity patterns with Python's `re`, whose syntax
      // diverges from JavaScript's RegExp in two ways that would otherwise make
      // backend-valid patterns fail this check:
      //   - inline-flag prefixes like `(?i)` / `(?im)` (JS rejects them outright)
      //   - named groups spelled `(?P<name>...)` (JS spells them `(?<name>...)`)
      // The named-group form matters here because the qty/oos convention the AI
      // emits — e.g. `(?P<qty>\d+)\s*in stock|(?P<oos>out of stock)` — is the only
      // way to express both in-stock and out-of-stock detection in one pattern.
      const jsCompatible = pattern.replace(/^\(\?[aiLmsux-]+\)/, "").replace(/\(\?P</g, "(?<");
      try {
        new RegExp(jsCompatible);
      } catch {
        issues.push({ tone: "error", message: "Quantity regex is invalid." });
      }
    } else {
      issues.push({
        tone: "warning",
        message: "Without a quantity regex the first number in the extracted text will be used."
      });
    }
    const threshold = monitor.low_stock_threshold;
    if (threshold != null && (Number.isNaN(threshold) || threshold < 0)) {
      issues.push({ tone: "error", message: "Low-stock threshold must be zero or higher." });
    }
    const fragile = selectorEncodesStockState(monitor.selector_or_path ?? "");
    if (fragile) {
      issues.push({
        tone: "warning",
        message: `Scope "${fragile}" looks tied to stock state and may not exist when the item is in stock. Prefer a container present in both states and let the regex find the number.`
      });
    }
  }
  if (
    ruleType === "text" &&
    matchMode === "exists" &&
    !(monitor.selector_or_path ?? "").trim() &&
    stockMode === "binary"
  ) {
    issues.push({
      tone: "warning",
      message: "Text body + Text present matches any non-empty response body unless a scope is set."
    });
  }
  if ((monitor.interval_seconds ?? 0) < 300) {
    issues.push({ tone: "warning", message: "Short intervals can create noisy checks." });
  }
  return issues;
}

export function hostFromUrl(value?: string) {
  if (!value) return "";
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function nameFromUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    const leaf = url.pathname
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    if (!leaf) return host;
    return `${titleCase(leaf)} (${host})`;
  } catch {
    return "";
  }
}

export function matchModesForRule(ruleType: Monitor["rule_type"]): Choice<Monitor["match_mode"]>[] {
  if (ruleType === "text") {
    return [
      ...comparisonModes,
      { value: "exists", label: "Text present", detail: "Non-empty body or scope" }
    ];
  }
  return [{ value: "exists", label: "Exists", detail: "Non-empty extraction" }, ...comparisonModes];
}

export function nextTargetForRule(
  currentRuleType: Monitor["rule_type"],
  nextRuleType: Monitor["rule_type"],
  currentTarget: string
) {
  const cssCompatible = new Set<Monitor["rule_type"]>(["text", "css"]);
  if (currentRuleType === nextRuleType) return currentTarget;
  if (cssCompatible.has(currentRuleType) && cssCompatible.has(nextRuleType)) return currentTarget;
  return "";
}

export function targetLabel(ruleType: Monitor["rule_type"]) {
  if (ruleType === "text") return "Scope";
  return "CSS selector";
}

export function targetPlaceholder(ruleType?: Monitor["rule_type"]) {
  if (ruleType === "text") return ".availability, #buy-box, [data-stock]";
  return ".availability, [data-stock]::attr(data-stock)";
}

export function targetDescription(ruleType: Monitor["rule_type"]) {
  if (ruleType === "text") return "Optional CSS selector. Blank scans the full response body.";
  return "Use ::attr(name) to extract an attribute instead of element text.";
}

export function operandLabel(matchMode?: Monitor["match_mode"]) {
  if (matchMode === "not_contains") return "Forbidden text";
  if (matchMode === "equals") return "Expected value";
  if (matchMode === "regex") return "Pattern";
  return "Needle";
}

export function operandDescription(matchMode?: Monitor["match_mode"]) {
  if (matchMode === "regex") return "Evaluated case-insensitively with multiline enabled.";
  if (matchMode === "equals") return "Whitespace is trimmed before comparison.";
  return "Comparison is case-insensitive.";
}

export function existsDescription(monitor: Partial<Monitor>) {
  const ruleType = monitor.rule_type ?? "text";
  if (ruleType === "text" && (monitor.selector_or_path ?? "").trim())
    return "Matches when the scoped CSS text is not empty.";
  if (ruleType === "text") return "Matches when the HTTP response body is not empty.";
  return "Matches when the selector or attribute extraction returns non-empty text.";
}

export function matchPlaceholder(matchMode?: Monitor["match_mode"]) {
  if (matchMode === "regex") return "in\\s+stock|available";
  if (matchMode === "not_contains") return "sold out";
  if (matchMode === "equals") return "available";
  return "in stock";
}

export function ruleSummary(monitor: Partial<Monitor>) {
  const type = monitor.rule_type ?? "text";
  const target = monitor.selector_or_path?.trim() || (type === "text" ? "response.body" : "root");
  const match = monitor.match_mode ?? "contains";
  const value = monitor.match_value ?? "";
  const stockMode = monitor.stock_mode ?? "binary";
  if (stockMode === "quantity") {
    const sourceLabel =
      type === "text"
        ? `text(${target === "response.body" ? "response.body" : `css("${target}")`})`
        : `css("${target}")`;
    const pattern = (monitor.quantity_pattern ?? "").trim() || "\\d+";
    const threshold = monitor.low_stock_threshold;
    const lowSuffix = threshold != null ? ` (≤${threshold} low)` : "";
    return `quantity from ${sourceLabel} matching /${pattern}/${lowSuffix}`;
  }
  if (type === "text" && match === "exists") return `${textTarget(target)} is non-empty`;
  if (type === "text") return `${textTarget(target)} ${matchLabel(match)} "${value}"`;
  if (match === "exists") return `css("${target}") returns non-empty text`;
  return `css("${target}") ${matchLabel(match)} "${value}"`;
}

const STATE_SELECTOR_TOKENS = [
  "outofstock",
  "instock",
  "soldout",
  "backorder",
  "preorder",
  "unavailable"
];
const STATE_SELECTOR_RE = /[.#]([A-Za-z0-9_-]+)|\[[\w:-]+[*^$|~]?=\s*['"]?([^'"\]]+)/g;

// Mirror of app/rules.py:selector_encodes_stock_state — flags class/id/attr-value
// selectors whose presence depends on stock state (e.g. `.out-of-stock`), which
// break quantity rules by returning empty text in the opposite state. Stable
// attribute names like `[data-availability]` are intentionally left alone.
export function selectorEncodesStockState(selectorOrPath: string): string {
  if (!selectorOrPath) return "";
  for (const match of selectorOrPath.matchAll(STATE_SELECTOR_RE)) {
    const raw = match[1] || match[2];
    if (!raw) continue;
    const collapsed = raw.replace(/[_-]/g, "").toLowerCase();
    if (STATE_SELECTOR_TOKENS.some((token) => collapsed.includes(token))) {
      return raw;
    }
  }
  return "";
}

function validUrl(value?: string) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function textTarget(target: string) {
  if (target === "response.body") return target;
  return `text(css("${target}"))`;
}

function matchLabel(matchMode: Monitor["match_mode"]) {
  if (matchMode === "not_contains") return "does not contain";
  if (matchMode === "regex") return "matches";
  return matchMode;
}
