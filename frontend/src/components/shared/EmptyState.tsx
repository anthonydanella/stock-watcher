import { Inbox } from "lucide-react";
import type React from "react";

import { cn } from "../../lib/utils";

export function EmptyState({
  message,
  className,
  icon
}: {
  message: string;
  className?: string;
  /** Optional glyph shown above the message; defaults to a neutral inbox. */
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card/40 px-4 py-9 text-center",
        className
      )}
    >
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-full bg-gradient-to-b from-muted/70 to-muted/20 text-muted-foreground/60 shadow-inner ring-1 ring-inset ring-border/70"
      >
        {icon ?? <Inbox className="h-6 w-6" />}
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
