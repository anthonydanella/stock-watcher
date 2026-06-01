import { Radar } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import packageInfo from "../../../package.json";
import { AlertRules } from "../../pages/AlertRules";
import { Dashboard } from "../../pages/Dashboard";
import { Events } from "../../pages/Events";
import { MonitorEditor } from "../../pages/MonitorEditor";
import { Monitors } from "../../pages/Monitors";
import { SettingsPage } from "../../pages/SettingsPage";
import { ErrorBoundary } from "./ErrorBoundary";
import { navLinkClass } from "./navigation";
import { ThemeToggle } from "./ThemeToggle";

export function Shell() {
  const headerRef = useRef<HTMLElement>(null);

  // Publish the app header's rendered height as --app-header-height so sticky
  // sub-headers (e.g. the monitor editor) can offset themselves to sit flush
  // beneath it. Measuring the real element keeps the two in sync across
  // breakpoints (the header wraps to two rows below lg) and safe-area changes
  // (the height includes pt-[env(safe-area-inset-top)]), with no magic numbers.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--app-header-height", `${header.getBoundingClientRect().height}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--app-header-height");
    };
  }, []);

  // overflow-x-clip (not -hidden) prevents horizontal scroll without forcing
  // overflow-y to auto, which would establish a scroll container and break
  // position: sticky for the nav and page headers.
  return (
    <div className="min-h-screen overflow-x-clip">
      {/* Soft ambient wash behind everything — a faint brand-tinted glow up top
          that fades into the page, giving the flat background subtle depth. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[32rem] bg-gradient-to-b from-primary/[0.08] via-primary/[0.025] to-transparent"
      />
      {/* A barely-there dot grid layered over the wash and masked to fade out,
          lending the empty background a faint engineered texture. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-80 text-primary/[0.20] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <header
        ref={headerRef}
        className="sticky top-0 z-20 border-b border-border/60 bg-card/70 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/60"
      >
        <div className="mx-auto flex min-h-14 w-full max-w-450 flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] lg:flex-nowrap lg:gap-6 lg:py-0">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/"
              className="group flex min-w-0 items-center gap-2 rounded-md text-base font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary shadow-sm ring-1 ring-inset ring-primary/20 transition-transform duration-200 group-hover:scale-105">
                <Radar className="size-4" aria-hidden="true" />
              </span>
              <span className="truncate">Stock Watcher</span>
            </Link>
            <span className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              v{packageInfo.version}
            </span>
          </div>
          <nav className="order-3 -mx-1 flex basis-full items-center gap-1 overflow-x-auto px-1 text-sm text-muted-foreground lg:order-none lg:mx-0 lg:basis-auto lg:flex-1 lg:gap-3 lg:overflow-visible lg:px-0">
            <NavLink to="/" end className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/monitors" className={navLinkClass}>
              Monitors
            </NavLink>
            <NavLink to="/alerts" className={navLinkClass}>
              Alerts
            </NavLink>
            <NavLink to="/events" className={navLinkClass}>
              Events
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              Settings
            </NavLink>
          </nav>
          <div className="order-2 ml-auto shrink-0 lg:order-none lg:ml-0">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-450 px-3 sm:px-4 py-4 sm:py-6 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/monitors" element={<Monitors />} />
            <Route path="/monitors/new" element={<MonitorEditor mode="edit" />} />
            <Route path="/monitors/:id" element={<MonitorEditor mode="view" />} />
            <Route path="/monitors/:id/edit" element={<MonitorEditor mode="edit" />} />
            <Route path="/alerts" element={<AlertRules />} />
            <Route path="/events" element={<Events />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
