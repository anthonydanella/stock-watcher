import { Check, ChevronDown } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";

export type FilterMenuOption<T extends string> = { id: T; label: string };

export function FilterMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  counts,
  allId = "all" as T
}: {
  label: string;
  options: readonly FilterMenuOption<T>[];
  value: T;
  onChange: (value: T) => void;
  counts?: Partial<Record<T, number>>;
  /** Option id treated as the unfiltered default; when selected the trigger shows the label only. */
  allId?: T;
}) {
  const active = value !== allId;
  const current = options.find((option) => option.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(active && "border-primary/60 bg-primary/5 text-foreground")}
          />
        }
      >
        <span className={cn(!active && "text-muted-foreground")}>{label}</span>
        {active && current ? (
          <span className="max-w-[10rem] truncate text-muted-foreground">{current.label}</span>
        ) : null}
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {options.map((option) => {
          const count = counts ? (counts[option.id] ?? 0) : undefined;
          const selected = value === option.id;
          return (
            <DropdownMenuItem key={option.id} onClick={() => onChange(option.id)} className="gap-2">
              <Check className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {count !== undefined ? (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
