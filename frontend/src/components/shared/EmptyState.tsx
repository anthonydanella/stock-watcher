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
        "flex flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed bg-card/40 px-4 py-9 text-center",
        className
      )}
    >
      <span aria-hidden className="text-muted-foreground/40">
        {icon ?? <Inbox className="h-6 w-6" />}
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
