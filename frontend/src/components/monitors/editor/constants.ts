import type { Monitor } from "../../../types";

export type Choice<T extends string> = {
  value: T;
  label: string;
  detail?: string;
};

export const CHROME_DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36";
export const SAFARI_MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";
export const MOBILE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

export const ruleTypes = [
  { value: "text", label: "Text body", detail: "Body text, optional CSS scope" },
  { value: "css", label: "CSS extract", detail: "Element text or ::attr()" }
] satisfies Choice<Monitor["rule_type"]>[];

export const comparisonModes = [
  { value: "contains", label: "Contains", detail: "Case-insensitive substring" },
  { value: "not_contains", label: "Excludes", detail: "Substring must be absent" },
  { value: "equals", label: "Equals", detail: "Case-insensitive full value" },
  { value: "regex", label: "Regex", detail: "Python re, ignore case" }
] satisfies Choice<Monitor["match_mode"]>[];

export const userAgentPresets = [
  { value: "random", label: "Random" },
  { value: CHROME_DESKTOP_UA, label: "Chrome" },
  { value: SAFARI_MAC_UA, label: "Safari" },
  { value: MOBILE_SAFARI_UA, label: "Mobile" },
  { value: "custom", label: "Custom" }
] as const;

export const stockModes = [
  { value: "binary", label: "In stock / Out", detail: "Rule match decides status" },
  { value: "quantity", label: "Quantity", detail: "Extract a number, track over time" }
] satisfies Choice<Monitor["stock_mode"]>[];

export const rulePresets = [
  {
    label: "In stock text",
    patch: {
      stock_mode: "binary",
      rule_type: "text",
      selector_or_path: "",
      match_mode: "contains",
      match_value: "in stock"
    }
  },
  {
    label: "Sold out guard",
    patch: {
      stock_mode: "binary",
      rule_type: "text",
      selector_or_path: "",
      match_mode: "not_contains",
      match_value: "sold out"
    }
  },
  {
    label: "Availability CSS",
    patch: {
      stock_mode: "binary",
      rule_type: "css",
      selector_or_path: ".availability",
      match_mode: "contains",
      match_value: "in stock"
    }
  },
  {
    label: "Qty in CSS",
    patch: {
      stock_mode: "quantity",
      rule_type: "css",
      selector_or_path: ".stock-count, [data-stock]",
      quantity_pattern: "(\\d+)"
    }
  },
  {
    label: "Qty in body text",
    patch: {
      stock_mode: "quantity",
      rule_type: "text",
      selector_or_path: "",
      quantity_pattern: "(\\d+)\\s*(?:left|in stock|available|remaining)"
    }
  }
] satisfies { label: string; patch: Partial<Monitor> }[];

export const schedulePresets = [
  { label: "5m", interval: 300, jitter: 15 },
  { label: "15m", interval: 900, jitter: 20 },
  { label: "30m", interval: 1800, jitter: 25 },
  { label: "1h", interval: 3600, jitter: 30 }
];
