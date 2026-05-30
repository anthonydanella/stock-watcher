import type React from "react";

import { cn } from "../../lib/utils";

/**
 * Floating, bottom-centered action bar. Stays fixed above page content (e.g. the
 * monitors bulk-selection bar, the monitor editor save bar) so its actions are
 * reachable at any scroll position. The outer layer is click-through; only the
 * bar itself captures pointer events.
 */
export function ActionBar({
  ariaLabel,
  className,
  children
}: {
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <section
        aria-label={ariaLabel}
        className={cn(
          "pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1.5 pl-3 shadow-lg",
          className
        )}
      >
        {children}
      </section>
    </div>
  );
}

/** Thin vertical rule for separating groups of controls inside an ActionBar. */
export function ActionBarSeparator() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}
