"""Custom user notification rules.

Evaluates cross-monitor alert conditions like "notify me when 2 of my
monitors are in stock". Rules fire on the false→true transition of the
condition, so a steady-state match doesn't spam.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Awaitable, Callable

from app.models import (
    EVENT_ALERT_TRIGGERED,
    EVENT_NOTIFICATION_ERROR,
    AppSettings,
    Monitor,
    NotificationRule,
    utcnow,
)
from app.repository import Repository

# (app_settings, monitor, title, message, tags, *, collapse_key) -> delivered.
# `collapse_key` is keyword-only on the concrete impl, so the alias stays loose.
NotifyFn = Callable[..., Awaitable[bool]]


@dataclass(frozen=True)
class RuleEvaluation:
    """Result of evaluating a rule against the current set of monitors."""

    satisfied: bool
    matching_monitor_ids: list[int]


def evaluate_rule(rule: NotificationRule, monitors: list[Monitor]) -> RuleEvaluation:
    statuses = set(rule.trigger_statuses)
    if rule.monitor_ids:
        scope_ids = set(rule.monitor_ids)
        scoped = [m for m in monitors if m.id in scope_ids]
    else:
        scoped = list(monitors)
    matching = [m.id for m in scoped if m.id is not None and m.status in statuses]
    satisfied = len(matching) >= max(1, rule.threshold)
    return RuleEvaluation(satisfied=satisfied, matching_monitor_ids=matching)


def _describe_statuses(statuses: list[str]) -> str:
    labels = [status.replace("_", " ") for status in statuses]
    if not labels:
        return "matching"
    if len(labels) == 1:
        return labels[0]
    if len(labels) == 2:
        return f"{labels[0]} or {labels[1]}"
    return ", ".join(labels[:-1]) + f", or {labels[-1]}"


def _build_message(
    rule: NotificationRule,
    evaluation: RuleEvaluation,
    monitors_by_id: dict[int, Monitor],
) -> tuple[str, str]:
    status_text = _describe_statuses(rule.trigger_statuses)
    matching_count = len(evaluation.matching_monitor_ids)
    title = f"Alert: {rule.name}"
    matching_names = [
        monitors_by_id[mid].name for mid in evaluation.matching_monitor_ids if mid in monitors_by_id
    ]
    detail = ", ".join(matching_names) if matching_names else ""
    summary = (
        f"{matching_count} monitor{'s' if matching_count != 1 else ''} "
        f"now {status_text} (threshold: {rule.threshold})."
    )
    message = f"{summary} {detail}".strip() if detail else summary
    return title, message


async def evaluate_rules(
    repo: Repository,
    app_settings: AppSettings,
    notify: NotifyFn,
) -> None:
    """Evaluate every enabled rule against the current monitor states.

    Fires on the false→true transition of the condition, respecting
    cooldown_minutes. A cooldown *defers* an alert rather than dropping it: a
    rise that lands inside the cooldown window stays pending (``last_satisfied``
    is not set until the alert actually goes out) and fires on the first tick
    after the window elapses, as long as the condition is still satisfied.

    ``last_satisfied`` therefore tracks "we have notified for the current
    satisfied episode", not raw satisfaction — the live, display-only state is
    computed separately in the serializer.
    """
    rules = repo.list_notification_rules()
    if not rules:
        return
    monitors = repo.list_monitors()
    monitors_by_id = {m.id: m for m in monitors if m.id is not None}
    now = utcnow()

    for rule in rules:
        if rule.id is None or not rule.enabled:
            continue
        evaluation = evaluate_rule(rule, monitors)
        previously_satisfied = rule.last_satisfied

        should_fire = False
        if evaluation.satisfied and not previously_satisfied:
            if rule.last_triggered_at and rule.cooldown_minutes > 0:
                cooldown_end = rule.last_triggered_at + timedelta(minutes=rule.cooldown_minutes)
                should_fire = now >= cooldown_end
            else:
                should_fire = True

        triggered_at = rule.last_triggered_at
        if should_fire:
            triggered_at = now
            title, message = _build_message(rule, evaluation, monitors_by_id)
            repo.add_event(None, EVENT_ALERT_TRIGGERED, f"{rule.name}: {message}")
            try:
                # `notify` fans out to every enabled channel and records its own
                # per-channel delivery failures, so the loop only needs to guard
                # against an unexpected raise.
                # Per-rule collapse key so each rule's Web Push notifications
                # replace only their own prior alert, instead of every custom
                # alert collapsing under a single shared tag.
                await notify(
                    app_settings, None, title, message, "bell", collapse_key=f"alert-rule-{rule.id}"
                )
            except Exception as exc:  # noqa: BLE001 - keep evaluation loop alive
                repo.add_event(
                    None,
                    EVENT_NOTIFICATION_ERROR,
                    f"Alert rule '{rule.name}' notification failed: {exc}",
                )

        # Only acknowledge a satisfied episode once we have actually fired for it.
        # A rise still waiting out its cooldown stays unacknowledged so the next
        # tick re-detects the transition and fires when the window has elapsed —
        # the cooldown defers the alert instead of swallowing it.
        if not evaluation.satisfied:
            new_satisfied = False
        elif should_fire:
            new_satisfied = True
        else:
            new_satisfied = previously_satisfied

        if new_satisfied != previously_satisfied or triggered_at != rule.last_triggered_at:
            repo.update_notification_rule_state(
                rule.id,
                last_satisfied=new_satisfied,
                last_triggered_at=triggered_at,
            )
