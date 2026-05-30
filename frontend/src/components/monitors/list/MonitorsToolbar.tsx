import { Layers, List, Search, Tag, X } from "lucide-react";

import { FilterMenu } from "../../shared/FilterMenu";
import { Button } from "../../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "../../ui/toggle-group";
import {
  ENABLED_FILTERS,
  type EnabledFilter,
  type GroupMode,
  STATUS_FILTERS,
  type StatusFilter
} from "./constants";

export function MonitorsToolbar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  enabledFilter,
  onEnabledFilterChange,
  statusCounts,
  enabledCounts,
  visibleCount,
  totalCount,
  hasFilters,
  onClear,
  groupMode,
  onGroupModeChange,
  tagFilter,
  onTagFilterChange,
  tagOptions,
  tagCounts
}: {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  enabledFilter: EnabledFilter;
  onEnabledFilterChange: (value: EnabledFilter) => void;
  statusCounts: Record<string, number>;
  enabledCounts: Record<"all" | "enabled" | "disabled" | "cooling", number>;
  visibleCount: number;
  totalCount: number;
  hasFilters: boolean;
  onClear: () => void;
  groupMode: GroupMode;
  onGroupModeChange: (value: GroupMode) => void;
  tagFilter: string;
  onTagFilterChange: (value: string) => void;
  tagOptions: { id: string; label: string }[];
  tagCounts: Record<string, number>;
}) {
  const countLabel =
    visibleCount === totalCount
      ? `${totalCount} ${totalCount === 1 ? "monitor" : "monitors"}`
      : `${visibleCount} of ${totalCount}`;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="w-full min-w-0 sm:w-72">
        <InputGroup className="h-8">
          <InputGroupInput
            aria-label="Search monitors"
            placeholder="Search by name or URL"
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
          label="Status"
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={onStatusFilterChange}
          counts={statusCounts}
        />
        <FilterMenu
          label="Activity"
          options={ENABLED_FILTERS}
          value={enabledFilter}
          onChange={onEnabledFilterChange}
          counts={enabledCounts}
        />
        {tagOptions.length > 1 ? (
          <FilterMenu
            label="Tag"
            options={tagOptions}
            value={tagFilter}
            onChange={onTagFilterChange}
            counts={tagCounts}
          />
        ) : null}
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X />
            Clear
          </Button>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 sm:ml-auto sm:justify-start">
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{countLabel}</span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[groupMode]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) onGroupModeChange(next as GroupMode);
          }}
          aria-label="Monitor view"
        >
          <ToggleGroupItem value="none" aria-label="Flat list" title="Flat list">
            <List />
            List
          </ToggleGroupItem>
          <ToggleGroupItem value="host" aria-label="Group by host" title="Group by host">
            <Layers />
            Host
          </ToggleGroupItem>
          <ToggleGroupItem value="tag" aria-label="Group by tag" title="Group by tag">
            <Tag />
            Tag
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
