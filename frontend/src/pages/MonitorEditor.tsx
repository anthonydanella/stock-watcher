import { ArrowLeft, Copy, LoaderCircle, Play } from "lucide-react";
import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../api";
import { DangerZone, EditorActions } from "../components/monitors/editor/EditorActions";
import { StatusPill } from "../components/monitors/editor/EditorChrome";
import { EditorValidation } from "../components/monitors/editor/EditorValidation";
import {
  hostFromUrl,
  matchModesForRule,
  nameFromUrl,
  nextTargetForRule,
  serializeMonitor,
  validateMonitor
} from "../components/monitors/editor/helpers";
import { MonitorEditorForm } from "../components/monitors/editor/MonitorEditorForm";
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

export function MonitorEditor({ mode = "edit" }: { mode?: "view" | "edit" }) {
  const { id } = useParams();
  const isNew = !id;
  const editing = isNew || mode === "edit";
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

  React.useEffect(() => {
    let active = true;
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

  async function persist(): Promise<Monitor | null> {
    if (busyAction) return null;
    if (blockingIssues.length) {
      toast.error(blockingIssues[0].message);
      return null;
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
      return saved;
    } catch (exc) {
      toast.error(errorMessage(exc, "Save failed"));
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function save(event?: React.FormEvent) {
    event?.preventDefault();
    const saved = await persist();
    if (saved && isNew) navigate(`/monitors/${saved.id}/edit`, { replace: true });
  }

  async function runById(targetId: number | string) {
    setBusyAction("run");
    try {
      const updated = await api.runMonitor(targetId);
      const nextHistory = await api.monitorHistory(targetId);
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

  async function runNow() {
    if (!id || busyAction) return;
    if (dirty) {
      toast.warning("Save changes before running this monitor.");
      return;
    }
    await runById(id);
  }

  async function saveAndRun() {
    const saved = await persist();
    if (saved) await runById(saved.id);
  }

  async function duplicate() {
    if (!fullMonitor || busyAction) return;
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
    if (!id || busyAction) return;
    setBusyAction("delete");
    try {
      await api.deleteMonitor(id);
      navigate("/monitors");
    } catch (exc) {
      toast.error(errorMessage(exc, "Delete failed"));
      setBusyAction(null);
    }
  }

  const editorForm = (
    <MonitorEditorForm
      monitor={monitor}
      formRef={formRef}
      onSubmit={save}
      onPatch={patch}
      onPatchMany={patchMany}
      onApplyRuleType={applyRuleType}
      onApplyMatchMode={applyMatchMode}
      onInferName={inferName}
    />
  );

  return (
    <div className={cn("space-y-6", editing && "pb-24")}>
      <div className="sticky top-[calc(5rem+env(safe-area-inset-top))] z-10 -mx-3 -mt-4 space-y-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:-mt-6 sm:px-4 lg:top-[calc(3.5rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/monitors"))}
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
          Back
        </button>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="wrap-break-word text-lg font-semibold tracking-normal sm:text-2xl">
                {isNew ? "New monitor" : monitor.name || "Monitor"}
              </h1>
              {dirty ? <StatusPill tone="warning">Unsaved</StatusPill> : null}
              {!isNew && fullMonitor ? (
                <StatusPill tone={fullMonitor.enabled ? "success" : "muted"}>
                  {fullMonitor.enabled ? "Enabled" : "Paused"}
                </StatusPill>
              ) : null}
            </div>
            <p className="mt-0.5 flex min-w-0 max-w-3xl items-center gap-1.5 text-xs text-muted-foreground sm:mt-1 sm:text-sm">
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
                size="sm"
                aria-label="Duplicate monitor"
                disabled={busyAction === "duplicate" || Boolean(busyAction)}
                onClick={duplicate}
              >
                {busyAction === "duplicate" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {busyAction === "duplicate" ? "Duplicating..." : "Duplicate"}
                </span>
              </Button>
              {!editing ? (
                <Button
                  variant="default"
                  size="sm"
                  disabled={busyAction === "run"}
                  onClick={runNow}
                >
                  {busyAction === "run" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span className="sm:hidden">{busyAction === "run" ? "Checking" : "Run"}</span>
                  <span className="hidden sm:inline">
                    {busyAction === "run" ? "Checking..." : "Run check now"}
                  </span>
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
          <div className="space-y-5">
            <EditorValidation validation={validation} />
            {editorForm}
          </div>
        ) : (
          <div className="space-y-6">
            <nav className="flex border-b border-border" aria-label="Monitor views">
              <RouteTab to={`/monitors/${id}`} active={!editing}>
                Overview
              </RouteTab>
              <RouteTab to={`/monitors/${id}/edit`} active={editing}>
                Settings
              </RouteTab>
            </nav>

            {editing ? (
              <div className="space-y-6 animate-in fade-in duration-200">
                <EditorValidation validation={validation} />
                {editorForm}
                <DangerZone busyAction={busyAction} onRemove={remove} />
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-200">
                {history && history.length > 0 ? (
                  <MonitorDashboardTrends attempts={history} monitor={fullMonitor} />
                ) : null}

                <div className="grid gap-6">
                  {fullMonitor ? <MonitorState monitor={fullMonitor} /> : null}
                  <MonitorHistory attempts={history} monitor={fullMonitor} />
                </div>
              </div>
            )}
          </div>
        )
      ) : null}

      {editing && !loading && !loadError ? (
        <EditorActions
          isNew={isNew}
          busyAction={busyAction}
          dirty={dirty}
          blockingCount={blockingIssues.length}
          onSave={save}
          onSaveAndRun={saveAndRun}
        />
      ) : null}
    </div>
  );
}

function RouteTab({
  to,
  active,
  children
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
