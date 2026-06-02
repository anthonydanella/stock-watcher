import type { StatusDetails } from "./types";

export const MAX_ATTEMPTS = 200;
export const DESKTOP_DOT_THRESHOLD = 100;
export const MOBILE_DOT_THRESHOLD = 40;

export const STATUS_DETAILS: Record<string, StatusDetails> = {
  in_stock: {
    label: "In stock",
    barClass: "trend-bar-success",
    glowClass: "trend-glow-success",
    dotClass: "trend-dot-success",
    textClass: "text-success-vivid",
    chartColor: "var(--success-solid)"
  },
  out_of_stock: {
    label: "Out of stock",
    barClass: "trend-bar-danger",
    glowClass: "trend-glow-danger",
    dotClass: "trend-dot-danger",
    textClass: "text-danger-vivid",
    chartColor: "var(--danger-solid)"
  },
  low_stock: {
    label: "Low stock",
    barClass: "trend-bar-caution",
    glowClass: "trend-glow-caution",
    dotClass: "trend-dot-caution",
    textClass: "text-caution-accent",
    chartColor: "var(--caution-solid)"
  },
  challenge: {
    label: "Challenge",
    barClass: "trend-bar-special",
    glowClass: "trend-glow-special",
    dotClass: "trend-dot-special",
    textClass: "text-special-vivid",
    chartColor: "var(--special-solid)"
  },
  error: {
    label: "Error",
    barClass: "trend-bar-warning",
    glowClass: "trend-glow-warning",
    dotClass: "trend-dot-warning",
    textClass: "text-warning-vivid",
    chartColor: "var(--warning-solid)"
  }
};

export const UNKNOWN_STATUS: StatusDetails = {
  label: "Unknown",
  barClass: "trend-bar-neutral",
  glowClass: "trend-glow-neutral",
  dotClass: "trend-dot-neutral",
  textClass: "text-neutral-accent",
  chartColor: "var(--neutral-solid)"
};

export function getStatusDetails(status: string): StatusDetails {
  return STATUS_DETAILS[status] ?? UNKNOWN_STATUS;
}
