import { Bell, Sparkles } from "lucide-react";
import React from "react";
import { toast } from "sonner";

import { api } from "../api";
import { FormField, ToggleField } from "../components/shared/FormFields";
import { InfoTooltip } from "../components/shared/InfoTooltip";
import { PageHeader } from "../components/shared/PageHeader";
import { EditorSkeleton } from "../components/shared/Skeletons";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { errorMessage } from "../lib/format";
import { cn } from "../lib/utils";
import type { AppSettings } from "../types";

const DEFAULT_SETTINGS: AppSettings = {
  ntfy_enabled: false,
  ntfy_server: "https://ntfy.sh",
  ntfy_topic: "",
  ntfy_token: "",
  ntfy_priority: "default",
  llm_base_url: "https://api.openai.com/v1",
  llm_model: "",
  llm_extra_params: "",
  llm_configured: false
};

function mergeSettings(next: Partial<AppSettings>): AppSettings {
  return {
    ntfy_enabled: next.ntfy_enabled ?? DEFAULT_SETTINGS.ntfy_enabled,
    ntfy_server: next.ntfy_server ?? DEFAULT_SETTINGS.ntfy_server,
    ntfy_topic: next.ntfy_topic ?? DEFAULT_SETTINGS.ntfy_topic,
    ntfy_token: next.ntfy_token ?? DEFAULT_SETTINGS.ntfy_token,
    ntfy_priority: next.ntfy_priority ?? DEFAULT_SETTINGS.ntfy_priority,
    llm_base_url: next.llm_base_url ?? DEFAULT_SETTINGS.llm_base_url,
    llm_model: next.llm_model ?? DEFAULT_SETTINGS.llm_model,
    llm_extra_params: next.llm_extra_params ?? DEFAULT_SETTINGS.llm_extra_params,
    llm_configured: next.llm_configured ?? DEFAULT_SETTINGS.llm_configured
  };
}

export function SettingsPage() {
  const [settings, setSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = React.useState(true);
  const [busyAction, setBusyAction] = React.useState<"save" | "test" | null>(null);
  const [extraParamsError, setExtraParamsError] = React.useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: load settings once on mount
  React.useEffect(() => {
    api
      .settings()
      .then((next) => {
        const merged = mergeSettings(next);
        setSettings(merged);
        validateExtraParams(merged.llm_extra_params);
      })
      .catch((exc) => toast.error(errorMessage(exc, "Could not load settings")))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busyAction) return;
    if (extraParamsError) {
      toast.error(extraParamsError);
      return;
    }
    setBusyAction("save");
    try {
      const next = await api.saveSettings(settings);
      setSettings(mergeSettings(next));
      toast.success("Settings saved");
    } catch (exc) {
      toast.error(errorMessage(exc, "Settings save failed"));
    } finally {
      setBusyAction(null);
    }
  }

  async function testNotification() {
    if (busyAction) return;
    setBusyAction("test");
    try {
      await api.testNotification();
      toast.success("Test notification sent");
    } catch (exc) {
      toast.error(errorMessage(exc, "Test notification failed"));
    } finally {
      setBusyAction(null);
    }
  }

  function validateExtraParams(value: string) {
    const text = value.trim();
    if (!text) {
      setExtraParamsError("");
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setExtraParamsError("Extra params must be a JSON object.");
      } else {
        setExtraParamsError("");
      }
    } catch (exc) {
      setExtraParamsError(`Invalid JSON: ${(exc as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure ntfy alerts and the LLM used to draft quantity regexes."
      />
      {loading ? (
        <Card className="overflow-visible rounded-md border border-border shadow-sm ring-0">
          <CardContent>
            <EditorSkeleton />
          </CardContent>
        </Card>
      ) : (
        <form className="space-y-6" onSubmit={save}>
          <Card className="overflow-visible rounded-md border border-border shadow-sm ring-0">
            <CardContent>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex items-center gap-2 md:col-span-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Notifications (ntfy)
                  </h2>
                  <InfoTooltip side="right">
                    ntfy is an open-source push notification service. Set a topic, subscribe on your
                    phone or browser via the ntfy app, and the stock watcher pushes alerts when
                    status changes or errors repeat.
                  </InfoTooltip>
                </div>
                <ToggleField
                  label="Enable ntfy notifications"
                  description="Send alerts on stock changes, repeated errors, and challenges."
                  checked={settings.ntfy_enabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, ntfy_enabled: checked })}
                  className="md:col-span-2"
                />
                <FormField label="ntfy server">
                  <Input
                    type="url"
                    value={settings.ntfy_server}
                    onChange={(event) =>
                      setSettings({ ...settings, ntfy_server: event.target.value })
                    }
                    placeholder="https://ntfy.sh"
                  />
                </FormField>
                <FormField label="ntfy topic">
                  <Input
                    value={settings.ntfy_topic}
                    onChange={(event) =>
                      setSettings({ ...settings, ntfy_topic: event.target.value })
                    }
                    placeholder="my-stock-alerts"
                  />
                </FormField>
                <FormField
                  label="ntfy token"
                  tooltip="Required only for private ntfy topics that need authentication. Leave blank for public topics."
                >
                  <Input
                    type="password"
                    value={settings.ntfy_token}
                    onChange={(event) =>
                      setSettings({ ...settings, ntfy_token: event.target.value })
                    }
                    placeholder="Optional access token"
                  />
                </FormField>
                <FormField label="Priority">
                  <Select
                    value={settings.ntfy_priority ?? "default"}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        ntfy_priority: value ?? "default"
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="min">Min</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-visible rounded-md border border-border shadow-sm ring-0">
            <CardContent>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex items-center gap-2 md:col-span-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    LLM (AI assistant)
                  </h2>
                  <InfoTooltip side="right">
                    Powers "Configure rule with AI" and "Suggest regex with AI" in the monitor
                    editor. Requires LLM_API_KEY env var and any OpenAI-compatible Chat Completions
                    endpoint: OpenAI, Anthropic (via compat layer), OpenRouter, Ollama, llama.cpp,
                    etc.
                  </InfoTooltip>
                </div>
                <div className="md:col-span-2 rounded-md border bg-secondary/40 p-3 text-sm">
                  <p className="font-medium">API key</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Set via the{" "}
                    <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">
                      LLM_API_KEY
                    </code>{" "}
                    environment variable. Restart the app after changing it.
                  </p>
                  <p
                    className={cn(
                      "mt-2 inline-flex items-center gap-1 text-xs font-medium",
                      settings.llm_configured
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-amber-700 dark:text-amber-300"
                    )}
                  >
                    {settings.llm_configured
                      ? "✓ Detected"
                      : "✗ Not set — Suggest with AI will be disabled"}
                  </p>
                </div>
                <FormField
                  label="Base URL"
                  description="OpenAI-compatible Chat Completions endpoint. Examples: https://api.openai.com/v1, https://openrouter.ai/api/v1, http://localhost:11434/v1."
                >
                  <Input
                    type="url"
                    value={settings.llm_base_url}
                    onChange={(event) =>
                      setSettings({ ...settings, llm_base_url: event.target.value })
                    }
                    placeholder="https://api.openai.com/v1"
                  />
                </FormField>
                <FormField
                  label="Model"
                  description="Model identifier accepted by the endpoint above."
                >
                  <Input
                    value={settings.llm_model}
                    onChange={(event) =>
                      setSettings({ ...settings, llm_model: event.target.value })
                    }
                    placeholder="gpt-4o-mini, claude-opus-4-7, llama3.1, ..."
                  />
                </FormField>
                <FormField
                  label="Extra request params (JSON)"
                  description='Merged into every Chat Completions request. Useful for { "reasoning_effort": "high" } or { "thinking": { "type": "enabled", "budget_tokens": 4000 } }.'
                  tooltip="JSON object merged into every API call. Use for model-specific options like temperature, extended thinking, or reasoning effort. Leave blank for defaults."
                  className="md:col-span-2"
                >
                  <Textarea
                    className="font-mono"
                    rows={4}
                    value={settings.llm_extra_params}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSettings({ ...settings, llm_extra_params: value });
                      validateExtraParams(value);
                    }}
                    placeholder='{ "temperature": 0.2 }'
                  />
                </FormField>
                {extraParamsError ? (
                  <p className="md:col-span-2 text-xs text-amber-700 dark:text-amber-300">
                    {extraParamsError}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={Boolean(busyAction) || Boolean(extraParamsError)}>
              {busyAction === "save" ? "Saving" : "Save settings"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(busyAction)}
              onClick={testNotification}
            >
              <Bell className="h-4 w-4" />
              {busyAction === "test" ? "Sending" : "Send test"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
