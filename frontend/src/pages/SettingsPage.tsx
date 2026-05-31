import { Bell, BellRing, Sparkles, Webhook } from "lucide-react";
import React from "react";
import { toast } from "sonner";

import { api } from "../api";
import { FormField, ToggleField } from "../components/shared/FormFields";
import { InfoTooltip } from "../components/shared/InfoTooltip";
import { PageHeader } from "../components/shared/PageHeader";
import { PanelCard } from "../components/shared/PanelCard";
import { EditorSkeleton } from "../components/shared/Skeletons";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { CardContent } from "../components/ui/card";
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
import { isStandalone, usePushSubscription } from "../hooks/usePushSubscription";
import { errorMessage } from "../lib/format";
import { cn } from "../lib/utils";
import type { AppSettings } from "../types";

type BusyAction = "save" | "test-ntfy" | "test-webhook" | "test-push" | null;

const DEFAULT_SETTINGS: AppSettings = {
  ntfy_enabled: false,
  ntfy_server: "https://ntfy.sh",
  ntfy_topic: "",
  ntfy_token: "",
  ntfy_priority: "default",
  webpush_enabled: true,
  webhook_enabled: false,
  webhook_url: "",
  webhook_format: "custom",
  webhook_headers: "",
  llm_base_url: "https://api.openai.com/v1",
  llm_model: "",
  llm_extra_params: "",
  llm_configured: false,
  webpush_public_key: "",
  webpush_configured: false,
  webpush_subscriptions: 0
};

function mergeSettings(next: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_SETTINGS, ...next };
}

const IS_IOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function SettingsPage() {
  const [settings, setSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = React.useState(true);
  const [busyAction, setBusyAction] = React.useState<BusyAction>(null);
  const [extraParamsError, setExtraParamsError] = React.useState("");
  const [webhookHeadersError, setWebhookHeadersError] = React.useState("");

  const push = usePushSubscription(settings.webpush_public_key);

  const loadSettings = React.useCallback(async () => {
    const next = await api.settings();
    const merged = mergeSettings(next);
    setSettings(merged);
    setExtraParamsError(jsonObjectError(merged.llm_extra_params));
    setWebhookHeadersError(jsonObjectError(merged.webhook_headers));
    return merged;
  }, []);

  React.useEffect(() => {
    loadSettings()
      .catch((exc) => toast.error(errorMessage(exc, "Could not load settings")))
      .finally(() => setLoading(false));
  }, [loadSettings]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busyAction) return;
    if (extraParamsError || webhookHeadersError) {
      toast.error(extraParamsError || webhookHeadersError);
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

  async function runTest(action: Exclude<BusyAction, "save" | null>, send: () => Promise<unknown>) {
    if (busyAction) return;
    setBusyAction(action);
    try {
      await send();
      toast.success("Test notification sent");
    } catch (exc) {
      toast.error(errorMessage(exc, "Test notification failed"));
    } finally {
      setBusyAction(null);
    }
  }

  async function enableDevice() {
    try {
      await push.subscribe();
      toast.success("Web push enabled on this device");
      await loadSettings();
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not enable web push"));
    }
  }

  async function disableDevice() {
    try {
      await push.unsubscribe();
      toast.success("Web push disabled on this device");
      await loadSettings();
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not disable web push"));
    }
  }

  const subscribers = settings.webpush_subscriptions ?? 0;
  const showInstallHint = IS_IOS && !isStandalone() && push.state !== "unsupported";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure notification channels and the LLM used to draft quantity regexes."
      />
      {loading ? (
        <PanelCard className="overflow-visible">
          <CardContent>
            <EditorSkeleton />
          </CardContent>
        </PanelCard>
      ) : (
        <form className="space-y-6" onSubmit={save}>
          <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
            <PanelCard className="overflow-visible">
              <CardContent className="flex flex-1 flex-col gap-5">
                <div className="grid gap-5">
                  <div className="flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Web push
                    </h2>
                    <Badge variant="secondary">Default</Badge>
                    <InfoTooltip side="right">
                      Push notifications straight to this browser or installed app, even when it's
                      closed — no extra account or app. On iPhone/iPad you must add Stock Watcher to
                      the Home Screen first (iOS 16.4+ only allows push for installed apps).
                    </InfoTooltip>
                  </div>
                  <ToggleField
                    label="Enable web push"
                    description="Deliver alerts to every subscribed device."
                    checked={settings.webpush_enabled}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, webpush_enabled: checked })
                    }
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm">
                    <div className="grid gap-1">
                      <span className="font-medium">This device</span>
                      <span className="text-xs text-muted-foreground">
                        {deviceStatusText(push.state, settings.webpush_configured)} · {subscribers}{" "}
                        {subscribers === 1 ? "device" : "devices"} subscribed
                      </span>
                    </div>
                    {push.state === "subscribed" ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={push.busy}
                        onClick={disableDevice}
                      >
                        {push.busy ? "Working" : "Disable on this device"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          push.busy ||
                          push.state === "unsupported" ||
                          push.state === "denied" ||
                          !settings.webpush_configured
                        }
                        onClick={enableDevice}
                      >
                        <BellRing className="h-4 w-4" />
                        {push.busy ? "Enabling" : "Enable on this device"}
                      </Button>
                    )}
                  </div>
                  {showInstallHint ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      On iPhone/iPad, add Stock Watcher to your Home Screen (Share → Add to Home
                      Screen), open it from there, then enable web push.
                    </p>
                  ) : null}
                </div>
                <div className="mt-auto flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={Boolean(busyAction) || !settings.webpush_enabled || subscribers === 0}
                    onClick={() => runTest("test-push", api.testPush)}
                  >
                    <Bell className="h-4 w-4" />
                    {busyAction === "test-push" ? "Sending" : "Send test"}
                  </Button>
                </div>
              </CardContent>
            </PanelCard>

            <PanelCard className="overflow-visible">
              <CardContent className="flex flex-1 flex-col gap-5">
                <div className="grid gap-5">
                  <div className="flex items-center gap-2">
                    <Webhook className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Webhook
                    </h2>
                    <InfoTooltip side="right">
                      POSTs a JSON payload to any URL on each alert. Pick a preset to match the
                      target: Discord and Slack incoming webhooks, or generic JSON for Home
                      Assistant, Zapier, n8n, and the like.
                    </InfoTooltip>
                  </div>
                  <ToggleField
                    label="Enable webhook"
                    description="POST alerts to an external URL."
                    checked={settings.webhook_enabled}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, webhook_enabled: checked })
                    }
                  />
                  <FormField label="Webhook URL">
                    <Input
                      type="url"
                      value={settings.webhook_url}
                      onChange={(event) =>
                        setSettings({ ...settings, webhook_url: event.target.value })
                      }
                      placeholder="https://discord.com/api/webhooks/…"
                    />
                  </FormField>
                  <FormField
                    label="Format"
                    tooltip="Shapes the request body. Generic JSON sends { title, message, status, monitor, url, tags }."
                  >
                    <Select
                      value={settings.webhook_format}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          webhook_format: (value as AppSettings["webhook_format"]) ?? "custom"
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Generic JSON" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="custom">
                            Generic JSON (Home Assistant, Zapier…)
                          </SelectItem>
                          <SelectItem value="discord">Discord</SelectItem>
                          <SelectItem value="slack">Slack</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField
                    label="Extra headers (JSON)"
                    description='Optional. Merged into the request, e.g. { "Authorization": "Bearer …" }.'
                    tooltip="JSON object of extra HTTP headers, useful for authenticated webhooks. Leave blank for none."
                  >
                    <Textarea
                      className="font-mono"
                      rows={2}
                      value={settings.webhook_headers}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSettings({ ...settings, webhook_headers: value });
                        setWebhookHeadersError(jsonObjectError(value));
                      }}
                      placeholder='{ "Authorization": "Bearer secret" }'
                    />
                  </FormField>
                  {webhookHeadersError ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {webhookHeadersError}
                    </p>
                  ) : null}
                </div>
                <div className="mt-auto flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={Boolean(busyAction)}
                    onClick={() => runTest("test-webhook", api.testWebhook)}
                  >
                    <Webhook className="h-4 w-4" />
                    {busyAction === "test-webhook" ? "Sending" : "Send test"}
                  </Button>
                </div>
              </CardContent>
            </PanelCard>

            <PanelCard className="overflow-visible md:col-span-2 lg:col-span-1">
              <CardContent className="@container flex flex-1 flex-col gap-5">
                <div className="grid gap-5 @sm:grid-cols-2">
                  <div className="flex items-center gap-2 @sm:col-span-2">
                    <Bell className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      ntfy
                    </h2>
                    <InfoTooltip side="right">
                      ntfy is an open-source push service. Set a topic, subscribe on your phone or
                      browser via the ntfy app, and Stock Watcher pushes alerts when status changes
                      or errors repeat.
                    </InfoTooltip>
                  </div>
                  <ToggleField
                    label="Enable ntfy notifications"
                    description="Send alerts on stock changes, repeated errors, and challenges."
                    checked={settings.ntfy_enabled}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, ntfy_enabled: checked })
                    }
                    className="@sm:col-span-2"
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
                <div className="mt-auto flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={Boolean(busyAction)}
                    onClick={() => runTest("test-ntfy", api.testNotification)}
                  >
                    <Bell className="h-4 w-4" />
                    {busyAction === "test-ntfy" ? "Sending" : "Send test"}
                  </Button>
                </div>
              </CardContent>
            </PanelCard>
          </div>

          <PanelCard className="overflow-visible">
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
                      setExtraParamsError(jsonObjectError(value));
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
          </PanelCard>

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={
                Boolean(busyAction) || Boolean(extraParamsError) || Boolean(webhookHeadersError)
              }
            >
              {busyAction === "save" ? "Saving" : "Save settings"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function deviceStatusText(
  state: ReturnType<typeof usePushSubscription>["state"],
  configured?: boolean
) {
  if (!configured) return "Server push keys unavailable";
  switch (state) {
    case "unsupported":
      return "This browser doesn't support web push";
    case "denied":
      return "Notifications are blocked in your browser settings";
    case "subscribed":
      return "Subscribed";
    case "loading":
      return "Checking…";
    default:
      return "Not subscribed";
  }
}

function jsonObjectError(value: string): string {
  const text = value.trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return "Must be a JSON object.";
    }
    return "";
  } catch (exc) {
    return `Invalid JSON: ${(exc as Error).message}`;
  }
}
