import { Layers, Search, X } from "lucide-react";

import { FilterMenu } from "../shared/FilterMenu";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Toggle } from "../ui/toggle";
import { RULE_FILTERS } from "./constants";
import type { RuleFilter } from "./types";

export function AlertRulesToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  counts,
  visibleCount,
  totalCount,
  hasFilters,
  onClear,
  groupByHost,
  onGroupByHostChange
}: {
  query: string;
  onQueryChange: (value: string) => void;
  filter: RuleFilter;
  onFilterChange: (value: RuleFilter) => void;
  counts: Record<string, number>;
  visibleCount: number;
  totalCount: number;
  hasFilters: boolean;
  onClear: () => void;
  groupByHost: boolean;
  onGroupByHostChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full min-w-0 sm:w-72">
        <InputGroup className="h-8">
          <InputGroupInput
            aria-label="Search alert rules"
            placeholder="Search rules"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <InputGroupAddon align="inline-start">
            <Search className="text-muted-foreground" aria-hidden="true" />
          </InputGroupAddon>
        </InputGroup>
      </div>
      <div className="flex items-center gap-2">
        <FilterMenu
          label="State"
          options={RULE_FILTERS}
          value={filter}
          onChange={onFilterChange}
          counts={counts}
        />
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X />
            Clear
          </Button>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {visibleCount === totalCount
            ? `${totalCount} ${totalCount === 1 ? "rule" : "rules"}`
            : `${visibleCount} of ${totalCount}`}
        </span>
        <Toggle
          variant="outline"
          size="sm"
          pressed={groupByHost}
          onPressedChange={onGroupByHostChange}
          aria-label="Group by host"
          title="Group rules by the host they watch"
        >
          <Layers className="h-3.5 w-3.5" />
          Group by host
        </Toggle>
      </div>
    </div>
  );
}
