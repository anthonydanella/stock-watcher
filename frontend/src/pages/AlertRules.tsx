import { Plus } from "lucide-react";

import { AlertRuleEditor } from "../components/alerts/AlertRuleEditor";
import { AlertRulesToolbar } from "../components/alerts/AlertRulesToolbar";
import { RuleList } from "../components/alerts/RuleList";
import { EmptyState } from "../components/shared/EmptyState";
import { PageHeader } from "../components/shared/PageHeader";
import { MonitorListSkeleton } from "../components/shared/Skeletons";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog";
import { useAlertRules } from "../hooks/useAlertRules";

export function AlertRules() {
  const alerts = useAlertRules();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert rules"
        description="Cross-monitor notifications — fire when N watched monitors hit a status (e.g. two PS5 listings back in stock). Works best when every monitor in a rule shares one host so it tracks a single retailer."
      >
        <Button onClick={alerts.openNew}>
          <Plus className="h-4 w-4" />
          New rule
        </Button>
      </PageHeader>

      {alerts.loading ? (
        <MonitorListSkeleton />
      ) : alerts.rules.length === 0 ? (
        <EmptyState message='No alert rules yet. Create one to be notified when conditions like "two monitors are in stock" are met.' />
      ) : (
        <>
          <AlertRulesToolbar
            query={alerts.query}
            onQueryChange={alerts.setQuery}
            filter={alerts.filter}
            onFilterChange={alerts.setFilter}
            counts={alerts.counts}
            visibleCount={alerts.visible.length}
            totalCount={alerts.rules.length}
            hasFilters={alerts.hasFilters}
            onClear={alerts.clearFilters}
            groupByHost={alerts.groupByHost}
            onGroupByHostChange={alerts.setGroupByHost}
          />

          {alerts.visible.length === 0 ? (
            <EmptyState message="No rules match the current filters." />
          ) : (
            <RuleList
              rules={alerts.visible}
              groupByHost={alerts.groupByHost}
              monitorsById={alerts.monitorsById}
              totalMonitors={alerts.monitors.length}
              busyId={alerts.busyId}
              onEdit={alerts.openEdit}
              onToggle={(rule) => void alerts.toggleEnabled(rule)}
              onDuplicate={(rule) => void alerts.duplicate(rule)}
              onDelete={(rule) => void alerts.remove(rule)}
            />
          )}
        </>
      )}

      <Dialog open={alerts.editorOpen} onOpenChange={alerts.setEditorOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden sm:max-w-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>{alerts.editingRule ? "Edit alert rule" : "New alert rule"}</DialogTitle>
            <DialogDescription>
              Notify via ntfy when a condition across one or more monitors is satisfied.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 py-4">
            <AlertRuleEditor
              key={alerts.editingRule?.id ?? "new"}
              initial={alerts.editingRule}
              monitors={alerts.monitors}
              onSubmit={(input) => void alerts.save(input)}
            />
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => alerts.setEditorOpen(false)}>
              Cancel
            </Button>
            <Button form="alert-rule-form" type="submit">
              {alerts.editingRule ? "Save changes" : "Create rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
