import type React from "react";

import { cn } from "../../lib/utils";

type Accent = "emerald" | "amber" | "violet";

const ACCENT_CLASSES: Record<Accent, { icon: string; value: string; pill: string }> = {
  emerald: {
    icon: "text-emerald-500",
    value: "text-emerald-600 dark:text-emerald-400",
    pill: "bg-emerald-500/10"
  },
  amber: {
    icon: "text-amber-500",
    value: "text-amber-600 dark:text-amber-400",
    pill: "bg-amber-500/10"
  },
  violet: {
    icon: "text-violet-500",
    value: "text-violet-600 dark:text-violet-400",
    pill: "bg-violet-500/10"
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
