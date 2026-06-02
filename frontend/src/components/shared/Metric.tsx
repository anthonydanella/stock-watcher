import type React from "react";

import { cn } from "../../lib/utils";

type Accent = "success" | "warning" | "special" | "caution";

const ACCENT_CLASSES: Record<Accent, { icon: string; value: string; pill: string }> = {
  success: {
    icon: "text-success-solid",
    value: "text-success-vivid",
    pill: "pill-success"
  },
  warning: {
    icon: "text-warning-solid",
    value: "text-warning-vivid",
    pill: "pill-warning"
  },
  special: {
    icon: "text-special-solid",
    value: "text-special-vivid",
    pill: "pill-special"
  },
  caution: {
    icon: "text-caution-solid",
    value: "text-caution-vivid",
    pill: "pill-caution"
  }
};

export function Metric({
  title,
  value,
  icon,
  accent
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  /** Tints the icon and value when the count is noteworthy; omit for a neutral metric. */
  accent?: Accent;
}) {
  const tone = accent ? ACCENT_CLASSES[accent] : null;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full px-2.5 py-1 text-sm text-muted-foreground transition-colors first:pl-0",
        tone?.pill
      )}
    >
      <span className={cn("text-muted-foreground/70 transition-colors", tone?.icon)}>{icon}</span>
      <span>{title}</span>
      <span
        className={cn("font-semibold text-foreground tabular-nums transition-colors", tone?.value)}
      >
        {value}
      </span>
    </div>
  );
}
