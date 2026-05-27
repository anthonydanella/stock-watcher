import React from "react";

import type { Monitor } from "../../../types";
import { userAgentPresets } from "./constants";
import { EditorActions } from "./EditorActions";
import { matchModesForRule } from "./helpers";
import { NotificationsSection } from "./NotificationsSection";
import { RuleLab } from "./RuleLab";
import { RuleSection } from "./RuleSection";
import { TargetSection } from "./TargetSection";
import { TimingSection } from "./TimingSection";
import type { MonitorPatch } from "./types";

export function MonitorEditorForm({
  monitor,
  isNew,
  busyAction,
  formRef,
  onSubmit,
  onPatch,
  onPatchMany,
  onApplyRuleType,
  onApplyMatchMode,
  onInferName
}: {
  monitor: Partial<Monitor>;
  isNew: boolean;
  busyAction: "save" | "run" | "delete" | "duplicate" | null;
  formRef: React.RefObject<HTMLFormElement | null>;
  onSubmit: (event: React.FormEvent) => void;
  onPatch: MonitorPatch;
  onPatchMany: (values: Partial<Monitor>) => void;
  onApplyRuleType: (ruleType: Monitor["rule_type"]) => void;
  onApplyMatchMode: (matchMode: Monitor["match_mode"]) => void;
  onInferName: () => void;
}) {
  const ruleType = monitor.rule_type ?? "text";
  const matchMode = monitor.match_mode ?? "contains";
  const selectedUserAgent = userAgentPresets.some(
    (preset) => preset.value === monitor.user_agent_mode
  )
    ? monitor.user_agent_mode || "random"
    : "custom";
  const availableMatchModes = React.useMemo(() => matchModesForRule(ruleType), [ruleType]);
  const matchValueDisabled = monitor.match_mode === "exists";

  return (
    <form ref={formRef} className="space-y-5" onSubmit={onSubmit}>
      <TargetSection monitor={monitor} onPatch={onPatch} onInferName={onInferName} />
      <RuleSection
        monitor={monitor}
        ruleType={ruleType}
        matchMode={matchMode}
        matchValueDisabled={matchValueDisabled}
        availableMatchModes={availableMatchModes}
        onPatch={onPatch}
        onPatchMany={onPatchMany}
        onApplyRuleType={onApplyRuleType}
        onApplyMatchMode={onApplyMatchMode}
      />
      <RuleLab monitor={monitor} />
      <TimingSection
        monitor={monitor}
        selectedUserAgent={selectedUserAgent}
        onPatch={onPatch}
        onPatchMany={onPatchMany}
      />
      <NotificationsSection monitor={monitor} onPatch={onPatch} />
      <EditorActions isNew={isNew} busyAction={busyAction} />
    </form>
  );
}
