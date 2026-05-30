import { ArrowLeft, Copy, LoaderCircle, Play } from "lucide-react";
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../api";
import { DangerZone } from "../components/monitors/editor/EditorActions";
import { StatusPill } from "../components/monitors/editor/EditorChrome";
import {
  hostFromUrl,
  matchModesForRule,
  nameFromUrl,
  nextTargetForRule,
  serializeMonitor,
  validateMonitor
} from "../components/monitors/editor/helpers";
import { MonitorEditorForm } from "../components/monitors/editor/MonitorEditorForm";
import { MonitorEditorSidebar } from "../components/monitors/editor/MonitorEditorSidebar";
import { MonitorDashboardTrends } from "../components/monitors/MonitorDashboardTrends";
import { MonitorHistory } from "../components/monitors/MonitorHistory";
import { MonitorState } from "../components/monitors/MonitorState";
import { PanelCard } from "../components/shared/PanelCard";
import { EditorSkeleton } from "../components/shared/Skeletons";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { CardContent } from "../components/ui/card";
import { errorMessage, formatSeconds } from "../lib/format";
import { blankMonitor, isFullMonitor, monitorCopyPayload } from "../lib/monitor";
import { cn } from "../lib/utils";
import type { CheckAttempt, Monitor } from "../types";

export function MonitorEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [monitor, setMonitor] = React.useState<Partial<Monitor>>(blankMonitor);
  const [history, setHistory] = React.useState<CheckAttempt[]>([]);
  const [initialSnapshot, setInitialSnapshot] = React.useState(serializeMonitor(blankMonitor));
  const [loading, setLoading] = React.useState(!isNew);
  const [loadError, setLoadError] = React.useState("");
  const [busyAction, setBusyAction] = React.useState<
    "save" | "run" | "delete" | "duplicate" | null
  >(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"overview" | "settings">("overview");

  React.useEffect(() => {
    let active = true;
    setConfirmDelete(false);
    if (!id) {
      setMonitor(blankMonitor);
      setHistory([]);
      setInitialSnapshot(serializeMonitor(blankMonitor));
      setLoading(false);
      setLoadError("");
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setLoadError("");
    Promise.all([api.monitor(id), api.monitorHistory(id)])
      .then(([nextMonitor, nextHistory]) => {
        if (!active) return;
        setMonitor({ ...nextMonitor, check_mode: "browser" });
        setHistory(nextHistory);
        setInitialSnapshot(serializeMonitor(nextMonitor));
      })
      .catch((exc) => {
        if (active) setLoadError(errorMessage(exc, "Could not load monitor"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  React.useEffect(() => {
    function submitWithShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
    window.addEventListener("keydown", submitWithShortcut);
    return () => window.removeEventListener("keydown", submitWithShortcut);
  }, []);

  const fullMonitor = isFullMonitor(monitor) ? monitor : null;
  const dirty = serializeMonitor(monitor) !== initialSnapshot;
  const validation = React.useMemo(() => validateMonitor(monitor), [monitor]);
  const blockingIssues = validation.filter((issue) => issue.tone === "error");
  const host = hostFromUrl(monitor.url);

  function patch<K extends keyof Monitor>(key: K, value: Monitor[K]) {
    patchMany({ [key]: value } as Partial<Monitor>);
  }

  function patchMany(values: Partial<Monitor>) {
    setMonitor((current) => ({ ...current, ...values }));
    setConfirmDelete(false);
  }

  function applyRuleType(ruleType: Monitor["rule_type"]) {
    const currentRuleType = monitor.rule_type ?? "text";
    const matchMode = monitor.match_mode ?? "contains";
    const nextMatchMode = matchModesForRule(ruleType).some((choice) => choice.value === matchMode)
      ? matchMode
      : "contains";
    patchMany({
      rule_type: ruleType,
      selector_or_path: nextTargetForRule(
        currentRuleType,
        ruleType,
        monitor.selector_or_path ?? ""
      ),
      match_mode: nextMatchMode,
      match_value: nextMatchMode === "exists" ? "" : (monitor.match_value ?? "")
    });
  }

  function applyMatchMode(matchMode: Monitor["match_mode"]) {
    patchMany({
      match_mode: matchMode,
      match_value: matchMode === "exists" ? "" : (monitor.match_value ?? "")
    });
  }

  function inferName() {
    if ((monitor.name ?? "").trim() || !monitor.url) return;
    const inferred = nameFromUrl(monitor.url);
    if (inferred) patch("name", inferred);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busyAction) return;
    if (blockingIssues.length) {
      toast.error(blockingIssues[0].message);
      return;
    }
    setBusyAction("save");
    try {
      const payload = { ...monitor, check_mode: "browser" as const };
      const saved = isNew
        ? await api.createMonitor(payload)
        : await api.updateMonitor(id!, payload);
      setMonitor(saved);
      setInitialSnapshot(serializeMonitor(saved));
      toast.success("Monitor saved");
      if (isNew) navigate(`/monitors/${saved.id}`, { replace: true });
    } catch (exc) {
      toast.error(errorMessage(exc, "Save failed"));
    } finally {
      setBusyAction(null);
    }
  }

  async function runNow() {
    if (!id) return;
    if (busyAction) return;
    if (dirty) {
      toast.warning("Save changes before running this monitor.");
      return;
    }
    setBusyAction("run");
    try {
      const updated = await api.runMonitor(id);
      const nextHistory = await api.monitorHistory(id);
      setMonitor(updated);
      setHistory(nextHistory);
      setInitialSnapshot(serializeMonitor(updated));
      toast.success("Manual check completed");
    } catch (exc) {
      toast.error(errorMessage(exc, "Run failed"));
    } finally {
      setBusyAction(null);
    }
  }

  async function duplicate() {
    if (!fullMonitor) return;
    if (busyAction) return;
    setBusyAction("duplicate");
    try {
      const created = await api.createMonitor(monitorCopyPayload(fullMonitor));
      toast.success(`Duplicated as "${created.name}"`);
      navigate(`/monitors/${created.id}`);
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not duplicate monitor"));
    } finally {
      setBusyAction(null);
    }
  }

  async function remove() {
    if (!id) return;
    if (busyAction) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      toast.warning("Click Delete monitor again to permanently remove this monitor.");
      return;
    }
    setBusyAction("delete");
    try {
      await api.deleteMonitor(id);
      navigate("/monitors");
    } catch (exc) {
      toast.error(errorMessage(exc, "Delete failed"));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/monitors"))}
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
          Back
        </button>

        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="wrap-break-word text-2xl font-semibold tracking-normal">
                {isNew ? "New monitor" : monitor.name || "Monitor"}
              </h1>
              {dirty ? <StatusPill tone="warning">Unsaved</StatusPill> : null}
              {!isNew && fullMonitor ? (
                <StatusPill tone={fullMonitor.enabled ? "success" : "muted"}>
                  {fullMonitor.enabled ? "Enabled" : "Paused"}
                </StatusPill>
              ) : null}
            </div>
            <p className="mt-1 flex min-w-0 max-w-3xl items-center gap-1.5 text-sm text-muted-foreground">
              {host && monitor.url ? (
                <>
                  <a
                    href={monitor.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={monitor.url}
                    className="min-w-0 truncate hover:text-foreground hover:underline"
                  >
                    <span className="hidden lg:inline">{monitor.url}</span>
                    <span className="lg:hidden">{host}</span>
                  </a>
                  <span className="shrink-0">
                    · {formatSeconds(monitor.interval_seconds)} cadence
                  </span>
                </>
              ) : (
                "Generic stock checks using CSS or text rules."
              )}
            </p>
          </div>

          {!isNew && fullMonitor ? (
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                disabled={busyAction === "duplicate" || Boolean(busyAction)}
                onClick={duplicate}
              >
                {busyAction === "duplicate" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {busyAction === "duplicate" ? "Duplicating..." : "Duplicate"}
              </Button>
              {activeTab === "overview" ? (
                <Button variant="default" disabled={busyAction === "run"} onClick={runNow}>
                  {busyAction === "run" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {busyAction === "run" ? "Checking..." : "Run check now"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}

      {loading ? (
        <PanelCard>
          <CardContent className="pt-5">
            <EditorSkeleton />
          </CardContent>
        </PanelCard>
      ) : null}

      {!loading && !loadError ? (
        isNew ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <MonitorEditorForm
              monitor={monitor}
              isNew={isNew}
              busyAction={busyAction}
              formRef={formRef}
              onSubmit={save}
              onPatch={patch}
              onPatchMany={patchMany}
              onApplyRuleType={applyRuleType}
              onApplyMatchMode={applyMatchMode}
              onInferName={inferName}
            />

            <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
              <MonitorEditorSidebar validation={validation} />
            </aside>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex border-b border-border">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px focus:outline-none focus:ring-0",
                  activeTab === "overview"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px focus:outline-none focus:ring-0",
                  activeTab === "settings"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                Settings
              </button>
            </div>

            {activeTab === "overview" ? (
              <div className="space-y-6 animate-in fade-in duration-200">
                {history && history.length > 0 ? (
                  <MonitorDashboardTrends attempts={history} monitor={fullMonitor} />
                ) : null}

                <div className="grid gap-6">
                  {fullMonitor ? <MonitorState monitor={fullMonitor} /> : null}
                  <MonitorHistory attempts={history} monitor={fullMonitor} />
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                  <MonitorEditorForm
                    monitor={monitor}
                    isNew={isNew}
                    busyAction={busyAction}
                    formRef={formRef}
                    onSubmit={save}
                    onPatch={patch}
                    onPatchMany={patchMany}
                    onApplyRuleType={applyRuleType}
                    onApplyMatchMode={applyMatchMode}
                    onInferName={inferName}
                  />

                  <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
                    <MonitorEditorSidebar validation={validation} />
                  </aside>
                </div>
                <DangerZone
                  busyAction={busyAction}
                  confirmDelete={confirmDelete}
                  onRemove={remove}
                />
              </div>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}
