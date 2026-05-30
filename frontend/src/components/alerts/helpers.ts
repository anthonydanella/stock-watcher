import type { Monitor, NotificationRule, NotificationRuleInput } from "../../types";
import { hostFromUrl } from "../monitors/editor/helpers";
import { HOST_BUCKET_ORDER } from "./constants";
import type { HostBucket, RuleFilter } from "./types";

export function ruleState(rule: NotificationRule): Exclude<RuleFilter, "all"> {
  if (!rule.enabled) return "paused";
  if (rule.currently_satisfied) return "triggered";
  return "armed";
}

export function ruleHostBucket(
  rule: NotificationRule,
  monitorsById: Map<number, Monitor>
): HostBucket {
  if (rule.monitor_ids.length === 0) {
    return { kind: "all", key: "all", label: "All monitors", hosts: [] };
  }
  const hosts = new Set<string>();
  for (const id of rule.monitor_ids) {
    const monitor = monitorsById.get(id);
    if (!monitor) continue;
    const host = hostFromUrl(monitor.url);
    if (host) hosts.add(host);
  }
  if (hosts.size === 0) {
    return { kind: "unknown", key: "unknown", label: "Unknown host", hosts: [] };
  }
  if (hosts.size === 1) {
    const [host] = hosts;
    return { kind: "single", key: `single:${host}`, label: host, hosts: [host] };
  }
  const sortedHosts = [...hosts].sort();
  return { kind: "mixed", key: "mixed", label: "Mixed hosts", hosts: sortedHosts };
}

export function groupVisibleByHost(
  rules: NotificationRule[],
  monitorsById: Map<number, Monitor>
): [HostBucket, NotificationRule[]][] {
  const buckets = new Map<string, { bucket: HostBucket; rules: NotificationRule[] }>();
  for (const rule of rules) {
    const bucket = ruleHostBucket(rule, monitorsById);
    const entry = buckets.get(bucket.key);
    if (entry) {
      entry.rules.push(rule);
    } else {
      buckets.set(bucket.key, { bucket, rules: [rule] });
    }
  }
  return [...buckets.values()]
    .sort((a, b) => {
      const order = HOST_BUCKET_ORDER[a.bucket.kind] - HOST_BUCKET_ORDER[b.bucket.kind];
      if (order !== 0) return order;
      return a.bucket.label.localeCompare(b.bucket.label);
    })
    .map(
      ({ bucket, rules: bucketRules }) => [bucket, bucketRules] as [HostBucket, NotificationRule[]]
    );
}

export function ruleToInput(rule: NotificationRule): NotificationRuleInput {
  return {
    name: rule.name,
    enabled: rule.enabled,
    monitor_ids: [...rule.monitor_ids],
    trigger_statuses: [...rule.trigger_statuses],
    threshold: rule.threshold,
    cooldown_minutes: rule.cooldown_minutes
  };
}
