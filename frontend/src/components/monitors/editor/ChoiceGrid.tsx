import { cn } from "../../../lib/utils";
import type { Choice } from "./constants";

export function ChoiceGrid<T extends string>({
  label,
  value,
  choices,
  onChange,
  columns = "two"
}: {
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
  columns?: "two" | "three";
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 min-w-0 gap-2 text-sm font-medium",
        columns === "three" && "md:col-span-2"
      )}
    >
      {label ? <span>{label}</span> : null}
      <div
        className={cn(
          "grid grid-cols-1 gap-2 sm:grid-cols-2",
          columns === "three" && "lg:grid-cols-3"
        )}
      >
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-pressed={choice.value === value}
            onClick={() => onChange(choice.value)}
            className={cn(
              "min-h-10 min-w-0 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              choice.value === value
                ? "border-primary bg-secondary text-secondary-foreground"
                : "hover:bg-secondary/70"
            )}
          >
            <span className="block break-words font-medium">{choice.label}</span>
            {choice.detail ? (
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {choice.detail}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
