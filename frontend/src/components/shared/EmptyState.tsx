import { cn } from "../../lib/utils";

export function EmptyState({ message, className }: { message: string; className?: string }) {
  return (
    <p
      className={cn(
        "rounded-md border border-dashed bg-card p-4 text-sm text-muted-foreground",
        className
      )}
    >
      {message}
    </p>
  );
}
