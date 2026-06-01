import { Plus } from "lucide-react";

import { BulkActionBar } from "../components/monitors/list/BulkActionBar";
import { MonitorCardList } from "../components/monitors/list/MonitorCardList";
import { MonitorsToolbar } from "../components/monitors/list/MonitorsToolbar";
import { MonitorTable } from "../components/monitors/list/MonitorTable";
import { LinkButton } from "../components/shared/LinkButton";
import { PageHeader } from "../components/shared/PageHeader";
import { MonitorListSkeleton } from "../components/shared/Skeletons";
import { useMonitorList } from "../hooks/useMonitorList";

export function Monitors() {
  const list = useMonitorList();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitors"
        description="Every monitor, with status, schedule, stock trend, and controls."
      >
        <LinkButton to="/monitors/new">
          <Plus className="h-4 w-4" />
          New monitor
        </LinkButton>
      </PageHeader>

      {list.loading ? <MonitorListSkeleton /> : null}
      {!list.loading ? (
        <>
          <MonitorsToolbar
            query={list.query}
            onQueryChange={list.setQuery}
            statusFilter={list.statusFilter}
            onStatusFilterChange={list.setStatusFilter}
            enabledFilter={list.enabledFilter}
            onEnabledFilterChange={list.setEnabledFilter}
            statusCounts={list.statusCounts}
            enabledCounts={list.enabledCounts}
            visibleCount={list.sorted.length}
            totalCount={list.monitors.length}
            hasFilters={list.hasFilters}
            onClear={list.clearFilters}
            groupMode={list.groupMode}
            onGroupModeChange={list.setGroupMode}
            tagFilter={list.tagFilter}
            onTagFilterChange={list.setTagFilter}
            tagOptions={list.tagOptions}
            tagCounts={list.tagCounts}
            hostFilter={list.hostFilter}
            onHostFilterChange={list.setHostFilter}
            hostOptions={list.hostOptions}
            hostCounts={list.hostCounts}
          />

          <MonitorCardList
            grouped={list.grouped}
            groupMode={list.groupMode}
            sorted={list.sorted}
            totalCount={list.monitors.length}
            busyActions={list.busyActions}
            onAction={list.action}
            onDuplicate={list.duplicate}
            onPatch={list.patchMonitor}
            selected={list.selected}
            onSelectedChange={list.setSelectedFor}
          />

          <MonitorTable
            sorted={list.sorted}
            grouped={list.grouped}
            groupMode={list.groupMode}
            totalCount={list.monitors.length}
            busyActions={list.busyActions}
            onAction={list.action}
            onDuplicate={list.duplicate}
            onPatch={list.patchMonitor}
            selected={list.selected}
            onSelectedChange={list.setSelectedFor}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onToggleSort={list.toggleSort}
            allVisibleSelected={list.allVisibleSelected}
            someVisibleSelected={list.someVisibleSelected}
            onToggleSelectAllVisible={list.toggleSelectAllVisible}
          />

          {list.selectedMonitors.length > 0 ? (
            <BulkActionBar
              count={list.selectedMonitors.length}
              busy={list.bulkBusy}
              onEnable={() => list.bulkSetEnabled(true)}
              onPause={() => list.bulkSetEnabled(false)}
              onRun={list.bulkRun}
              onDelete={list.bulkDelete}
              onClear={list.clearSelection}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
