import { ExternalLink, Globe2 } from "lucide-react";
import React from "react";
import type { Monitor } from "../../../types";
import { FormField } from "../../shared/FormFields";
import { PanelCard } from "../../shared/PanelCard";
import { TagInput } from "../../shared/TagInput";
import { Button } from "../../ui/button";
import { CardContent, CardHeader } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import { SectionTitle } from "./EditorChrome";
import type { MonitorPatch } from "./types";

export function TargetSection({
  monitor,
  onPatch,
  onInferName
}: {
  monitor: Partial<Monitor>;
  onPatch: MonitorPatch;
  onInferName: () => void;
}) {
  const productUrlId = React.useId();
  const enabledId = React.useId();
  const enabled = Boolean(monitor.enabled);

  return (
    <PanelCard>
      <CardHeader>
        <SectionTitle
          icon={Globe2}
          title="Monitor"
          description="Name, product page, and whether checks run automatically."
          action={
            <div className="flex items-center gap-2">
              <Label
                htmlFor={enabledId}
                className="cursor-pointer text-xs font-medium text-muted-foreground"
              >
                {enabled ? "Enabled" : "Paused"}
              </Label>
              <Switch
                id={enabledId}
                checked={enabled}
                onCheckedChange={(checked) => onPatch("enabled", checked)}
              />
            </div>
          }
        />
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <FormField label="Name" className="md:col-span-2">
          <Input
            value={monitor.name ?? ""}
            onChange={(event) => onPatch("name", event.target.value)}
            placeholder="RTX 5090 Founders Edition"
            required
          />
        </FormField>
        <div className="grid gap-2 text-sm font-medium md:col-span-2">
          <Label htmlFor={productUrlId}>Product URL</Label>
          <div className="flex min-w-0 gap-2">
            <Input
              id={productUrlId}
              type="url"
              value={monitor.url ?? ""}
              onBlur={onInferName}
              onChange={(event) => onPatch("url", event.target.value)}
              placeholder="https://store.example.com/product"
              required
            />
            <Button
              type="button"
              aria-label="Open product URL"
              className="shrink-0"
              disabled={!monitor.url}
              size="icon"
              variant="outline"
              onClick={() =>
                monitor.url && window.open(monitor.url, "_blank", "noopener,noreferrer")
              }
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <FormField
          label="Tags"
          className="md:col-span-2"
          tooltip="Group monitors by project (e.g. “GPU build”, “kid's birthday”). Filter and group the monitors list by tag, independent of host."
        >
          <TagInput value={monitor.tags ?? []} onChange={(next) => onPatch("tags", next)} />
        </FormField>
      </CardContent>
    </PanelCard>
  );
}
