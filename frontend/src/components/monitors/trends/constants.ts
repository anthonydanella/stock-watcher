import type { StatusDetails } from "./types";

export const MAX_ATTEMPTS = 200;
export const DESKTOP_DOT_THRESHOLD = 100;
export const MOBILE_DOT_THRESHOLD = 40;

export const STATUS_DETAILS: Record<string, StatusDetails> = {
  in_stock: {
    label: "In stock",
    barClass:
      "bg-gradient-to-t from-emerald-700 via-emerald-500 to-emerald-300 hover:from-emerald-600 hover:via-emerald-400 hover:to-emerald-200",
    glowClass: "shadow-[0_7px_18px_rgba(16,185,129,0.24)]",
    dotClass: "bg-gradient-to-br from-emerald-300 to-emerald-600",
    textClass: "text-emerald-600",
    chartColor: "rgb(16 185 129)"
  },
  out_of_stock: {
    label: "Out of stock",
    barClass:
      "bg-gradient-to-t from-rose-700 via-rose-500 to-rose-300 hover:from-rose-600 hover:via-rose-400 hover:to-rose-200",
    glowClass: "shadow-[0_7px_18px_rgba(244,63,94,0.18)]",
    dotClass: "bg-gradient-to-br from-rose-300 to-rose-600",
    textClass: "text-rose-600",
    chartColor: "rgb(244 63 94)"
  },
  low_stock: {
    label: "Low stock",
    barClass:
      "bg-gradient-to-t from-yellow-700 via-yellow-500 to-yellow-300 hover:from-yellow-600 hover:via-yellow-400 hover:to-yellow-200",
    glowClass: "shadow-[0_7px_18px_rgba(234,179,8,0.24)]",
    dotClass: "bg-gradient-to-br from-yellow-300 to-yellow-600",
    textClass: "text-yellow-700",
    chartColor: "rgb(234 179 8)"
  },
  challenge: {
    label: "Challenge",
    barClass:
      "bg-gradient-to-t from-violet-700 via-violet-500 to-violet-300 hover:from-violet-600 hover:via-violet-400 hover:to-violet-200",
    glowClass: "shadow-[0_7px_18px_rgba(139,92,246,0.24)]",
    dotClass: "bg-gradient-to-br from-violet-300 to-violet-600",
    textClass: "text-violet-600",
    chartColor: "rgb(139 92 246)"
  },
  error: {
    label: "Error",
    barClass:
      "bg-gradient-to-t from-amber-700 via-amber-500 to-amber-300 hover:from-amber-600 hover:via-amber-400 hover:to-amber-200",
    glowClass: "shadow-[0_7px_18px_rgba(245,158,11,0.24)]",
    dotClass: "bg-gradient-to-br from-amber-300 to-amber-600",
    textClass: "text-amber-600",
    chartColor: "rgb(245 158 11)"
  }
};

export const UNKNOWN_STATUS: StatusDetails = {
  label: "Unknown",
  barClass:
    "bg-gradient-to-t from-slate-600 via-slate-400 to-slate-300 hover:from-slate-500 hover:via-slate-400 hover:to-slate-200",
  glowClass: "shadow-[0_7px_18px_rgba(100,116,139,0.18)]",
  dotClass: "bg-gradient-to-br from-slate-300 to-slate-500",
  textClass: "text-slate-600",
  chartColor: "rgb(100 116 139)"
};

export function getStatusDetails(status: string): StatusDetails {
  return STATUS_DETAILS[status] ?? UNKNOWN_STATUS;
}
