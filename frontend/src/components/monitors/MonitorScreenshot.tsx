import { ExternalLink, ImageIcon, ImageOff } from "lucide-react";

import { formatDate } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { Monitor } from "../../types";

type MonitorScreenshotProps = {
  monitor: Monitor;
  compact?: boolean;
  className?: string;
};

export function MonitorScreenshot({ monitor, compact = false, className }: MonitorScreenshotProps) {
  const imageUrl =
    monitor.last_screenshot_url && monitor.last_screenshot_at
      ? `${monitor.last_screenshot_url}?t=${encodeURIComponent(monitor.last_screenshot_at)}`
      : null;

  if (!imageUrl) {
    const failed = Boolean(monitor.last_screenshot_error);
    const label = failed ? "Screenshot failed" : "No screenshot yet";
    const Icon = failed ? ImageOff : ImageIcon;

    // Compact (table preview) keeps the small fixed tile so the column stays aligned.
    if (compact) {
      return (
        <div
          className={cn(
            "flex aspect-video w-20 min-h-0 items-center justify-center rounded-md border border-dashed border-border bg-secondary",
            failed ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
            className
          )}
          title={failed ? `${label}: ${monitor.last_screenshot_error}` : label}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </div>
      );
    }

    // In cards an empty 16:9 tile dominates the layout, so collapse to a slim strip.
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-dashed border-border bg-secondary/40 px-3 py-1.5 text-xs",
          failed ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          className
        )}
        title={failed ? monitor.last_screenshot_error : undefined}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />
        <span className="min-w-0 truncate">{label}</span>
      </div>
    );
  }

  return (
    <figure className={cn("space-y-2", compact ? "w-20" : "w-full", className)}>
      <a
        href={imageUrl}
        target="_blank"
        rel="noreferrer"
        className="group block overflow-hidden rounded-md border border-border bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Open latest screenshot for ${monitor.name}`}
      >
        <img
          src={imageUrl}
          alt={`Latest screenshot for ${monitor.name}`}
          className={cn(
            "aspect-video w-full object-cover transition duration-150 group-hover:scale-[1.02]",
            compact ? "" : "max-h-44"
          )}
          loading="lazy"
        />
      </a>
      {!compact ? (
        <figcaption className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">Captured {formatDate(monitor.last_screenshot_at)}</span>
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open
          </a>
        </figcaption>
      ) : null}
    </figure>
  );
}
