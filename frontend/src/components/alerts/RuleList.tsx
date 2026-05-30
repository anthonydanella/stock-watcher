import type { Monitor, NotificationRule } from "../../types";
import { groupVisibleByHost } from "./helpers";
import { RuleCard } from "./RuleCard";
import { RuleGroupHeader } from "./RuleGroupHeader";

export function RuleList({
  rules,
  groupByHost,
  monitorsById,
  totalMonitors,
  busyId,
  onEdit,
  onToggle,
  onDuplicate,
  onDelete
}: {
  rules: NotificationRule[];
  groupByHost: boolean;
  monitorsById: Map<number, Monitor>;
  totalMonitors: number;
  busyId: number | null;
  onEdit: (rule: NotificationRule) => void;
  onToggle: (rule: NotificationRule) => void;
  onDuplicate: (rule: NotificationRule) => void;
  onDelete: (rule: NotificationRule) => void;
}) {
  const renderCard = (rule: NotificationRule) => (
    <RuleCard
      key={rule.id}
      rule={rule}
      monitorsById={monitorsById}
      totalMonitors={totalMonitors}
      busy={busyId === rule.id}
      onEdit={() => onEdit(rule)}
      onToggle={() => onToggle(rule)}
      onDuplicate={() => onDuplicate(rule)}
      onDelete={() => onDelete(rule)}
    />
  );

  if (groupByHost) {
    return (
      <div className="space-y-6">
        {groupVisibleByHost(rules, monitorsById).map(([bucket, items]) => (
          <section key={bucket.key} className="space-y-2">
            <RuleGroupHeader bucket={bucket} count={items.length} />
            <div className="grid gap-3">{items.map(renderCard)}</div>
          </section>
        ))}
      </div>
    );
  }

  return <div className="grid gap-3">{rules.map(renderCard)}</div>;
}
