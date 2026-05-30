import { cn } from "../../../lib/utils";

export function LabMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "success" | "error";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border bg-background p-3",
        tone === "success" &&
          "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/40",
        tone === "error" && "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/40"
      )}
    >
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-sm">{value}</p>
    </div>
  );
}

export function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed bg-secondary/30 p-4 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function CodeBlock({ value, className }: { value: string; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-96 max-w-full overflow-auto rounded-md border bg-muted p-3 text-xs leading-5 text-foreground",
        className
      )}
    >
      <code>{value}</code>
    </pre>
  );
}
