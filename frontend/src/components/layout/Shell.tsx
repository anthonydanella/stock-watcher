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
  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 w-full max-w-450 flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2 lg:flex-nowrap lg:gap-6 lg:py-0">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/"
              className="truncate rounded-sm text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Stock Watcher
            </Link>
            <span className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
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
      <main className="mx-auto w-full max-w-450 px-3 sm:px-4 py-4 sm:py-6">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/monitors" element={<Monitors />} />
            <Route path="/monitors/new" element={<MonitorEditor />} />
            <Route path="/monitors/:id" element={<MonitorEditor />} />
            <Route path="/alerts" element={<AlertRules />} />
            <Route path="/events" element={<Events />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
