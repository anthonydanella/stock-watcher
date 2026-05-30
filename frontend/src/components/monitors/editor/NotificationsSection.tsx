import { Bell } from "lucide-react";
import type { Monitor } from "../../../types";
import { ToggleField } from "../../shared/FormFields";
import { PanelCard } from "../../shared/PanelCard";
import { CardContent, CardHeader } from "../../ui/card";
import { SectionTitle, SubSectionLabel } from "./EditorChrome";
import type { MonitorPatch } from "./types";

export function NotificationsSection({
  monitor,
  onPatch
}: {
  monitor: Partial<Monitor>;
  onPatch: MonitorPatch;
}) {
  const masterEnabled = monitor.notifications_enabled ?? true;
  const stockChange = monitor.notify_on_stock_change ?? true;
  const errorAlerts = monitor.notify_on_error ?? true;
  const challengeAlerts = monitor.notify_on_challenge ?? true;

  return (
    <PanelCard>
      <CardHeader>
        <SectionTitle
          icon={Bell}
          title="Notifications"
          description="Per-monitor controls layered on top of the global ntfy settings."
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <ToggleField
          label="Enable notifications for this monitor"
          description="Master switch. When off, no ntfy alerts are sent for this monitor, even if global ntfy is enabled. Events are still recorded."
          checked={masterEnabled}
          onCheckedChange={(checked) => onPatch("notifications_enabled", checked)}
        />
        <section className="space-y-3">
          <SubSectionLabel tooltip="Pick which event types should push a notification. Disabled events still appear in the Events log.">
            Notify on
          </SubSectionLabel>
          <div className="grid gap-3">
            <ToggleField
              label="Stock changes"
              description="Status transitions between in stock, low stock, and out of stock (and recovery from errors)."
              checked={stockChange}
              onCheckedChange={(checked) => onPatch("notify_on_stock_change", checked)}
            />
            <ToggleField
              label="Repeated errors"
              description="Alert after the 3rd and 6th consecutive check failure."
              checked={errorAlerts}
              onCheckedChange={(checked) => onPatch("notify_on_error", checked)}
            />
            <ToggleField
              label="Bot challenges"
              description="Alert when a CAPTCHA or anti-bot page is detected and checks cool down."
              checked={challengeAlerts}
              onCheckedChange={(checked) => onPatch("notify_on_challenge", checked)}
            />
          </div>
        </section>
      </CardContent>
    </PanelCard>
  );
}
