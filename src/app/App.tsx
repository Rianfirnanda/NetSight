import { Overview } from "../features/overview/Overview";
import { Events } from "../components/shared/Events";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Box,
  ChevronRight,
  CircleHelp,
  Download,
  Globe,
  LayoutDashboard,
  Monitor,
  Moon,
  Network,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { TrafficChart } from "../components/shared/TrafficChart";
import { Devices } from "../features/devices/Devices";
import { Topology } from "../features/topology/Topology";
import { EndpointCheck } from "../features/monitoring/EndpointCheck";
import { LabIndicator, LabSession } from "../features/monitoring/LabSession";
import { desktop, getSnapshot } from "../services/network";
import type { Mode, Page } from "../types";
const pages: Page[] = [
  "Overview",
  "Devices",
  "Monitoring",
  "Topology",
  "Alerts",
  "Reports",
  "Settings",
];
const icons = [
  LayoutDashboard,
  Monitor,
  Activity,
  Network,
  Bell,
  Download,
  Settings,
];
const descriptions: Record<Page, string> = {
  Overview: "A clear view of your network, from one workspace.",
  Devices: "Explore devices and understand where each observation comes from.",
  Monitoring: "Local interface traffic and authorized endpoint connectivity.",
  Topology: "Explore observed devices without assuming physical relationships.",
  Alerts: "Review collection events and changes in your network.",
  Reports: "Export the observations available in your current workspace.",
  Settings: "Make this workspace your own.",
};
function read(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Session-only preferences if storage is unavailable. */
  }
}
function rate(value: number) {
  return `${(value / 1e6).toFixed(2)} MB/s`;
}
export default function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [mode, setMode] = useState<Mode>(desktop ? "live" : "demo");
  const [theme, setTheme] = useState(() => read("netsight-theme", "dark"));
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      return JSON.parse(read("netsight-read", "[]"));
    } catch {
      return [];
    }
  });
  const [filter, setFilter] = useState("All");
  const query = useQuery({
    queryKey: ["snapshot", mode],
    queryFn: () => getSnapshot(mode),
    refetchInterval: mode === "live" ? 5000 : false,
    retry: false,
  });
  const data = query.data;
  const unread =
    data?.events.filter((e) => !readIds.includes(e.id)).length || 0;
  function changeTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    save("netsight-theme", next);
  }
  function exportReport() {
    if (!data) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            mode,
            source: mode === "demo" ? "Synthetic demo" : "Local OS interfaces",
            ...data,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `netsight-${mode}-observations.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="app" data-theme={theme}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Overview");
          }}
        >
          <span className="brand-icon">
            <Network size={22} />
          </span>
          NetSight<span className="version">BETA</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">N</span>
          <span>
            Local workspace<small>Network observability</small>
          </span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Primary navigation">
          {pages.map((p, i) => {
            const Icon = icons[i];
            return (
              <button
                key={p}
                className={page === p ? "active" : ""}
                onClick={() => setPage(p)}
                aria-current={page === p ? "page" : undefined}
                aria-label={p}
              >
                <Icon size={18} />
                <span>{p}</span>
                {p === "Alerts" && unread > 0 && (
                  <span className="count">{unread}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="source-status">
            <span className={`status-dot ${mode === "demo" ? "demo" : ""}`} />
            <span>
              {mode === "demo"
                ? "Demo workspace"
                : query.isError
                  ? "Collector unavailable"
                  : "Local collector"}
              <small>
                {mode === "demo"
                  ? "Synthetic data only"
                  : desktop
                    ? "Refreshes every 5 seconds"
                    : "Desktop app required"}
              </small>
            </span>
          </div>
          <button className="theme-toggle" onClick={changeTheme}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            <span>
              {theme === "dark" ? "Light appearance" : "Dark appearance"}
            </span>
          </button>
          <div className="sidebar-note">
            <ShieldCheck size={14} /> Observe with confidence
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={13} /> <strong>{page}</strong>
          </span>
          <div>
            <span className="mode-label">Data source</span>
            <select
              aria-label="Data mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option value="demo">Demo mode</option>
              <option value="live">Live · local machine</option>
            </select>
            <button
              aria-label="Open settings"
              className="icon-button"
              onClick={() => setPage("Settings")}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <div className="content">
          <LabIndicator />
          <div className="page-heading">
            <div>
              <div className="eyebrow">NETWORK WORKSPACE</div>
              <h1>{page}</h1>
              <p>{descriptions[page]}</p>
            </div>
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw size={14} className={query.isFetching ? "spin" : ""} />
              {query.isFetching ? "Refreshing" : "Refresh"}
            </Button>
          </div>
          <div className="source-banner">
            <span>
              <Radio size={15} />
              {mode === "demo" ? (
                <>
                  <strong>Demo mode</strong> — You’re exploring a synthetic
                  sample network.
                </>
              ) : (
                <>
                  <strong>Live mode</strong> — Local counters and Windows
                  neighbor observations.
                </>
              )}
            </span>
            <span className="subtle">
              {mode === "demo"
                ? "No network activity generated"
                : "OS interface counters"}
            </span>
          </div>
          {query.isPending ? (
            <div className="empty" role="status">
              Loading network observations…
            </div>
          ) : query.isError ? (
            <div className="error" role="alert">
              <h3>Unable to collect observations</h3>
              <p>{query.error.message}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            data && (
              <>
                {page === "Overview" && (
                  <Overview
                    data={data}
                    mode={mode}
                    theme={theme}
                    readIds={readIds}
                    setPage={setPage}
                  />
                )}
                {page === "Devices" && (
                  <Devices devices={data.devices} demo={mode === "demo"} />
                )}
                {page === "Monitoring" && (
                  <>
                    <section className="panel">
                      <div className="panel-heading">
                        <h3>Local traffic history</h3>
                        <span className="subtle">Download / Upload · MB/s</span>
                      </div>
                      <TrafficChart samples={data.samples} theme={theme} />
                    </section>
                    <section className="panel padded">
                      <h3>Network interfaces</h3>
                      {data.adapters.map((a) => (
                        <div key={a.name} className="adapter">
                          <Network size={20} />
                          <div>
                            <strong>{a.name}</strong>
                            <small>
                              {a.addresses.join(", ") || "No IP available"} ·{" "}
                              {a.mac || "MAC unavailable"}
                            </small>
                          </div>
                          <span>
                            ↓ {rate(a.download)}
                            <br />↑ {rate(a.upload)}
                          </span>
                        </div>
                      ))}
                    </section>
                    <EndpointCheck />
                    <LabSession devices={data.devices} demo={mode === "demo"} />
                  </>
                )}
                {page === "Topology" && (
                  <Topology devices={data.devices} demo={mode === "demo"} />
                )}
                {page === "Alerts" && (
                  <>
                    <div className="toolbar">
                      <select
                        aria-label="Event severity"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option>All</option>
                        <option>warning</option>
                        <option>info</option>
                      </select>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const ids = data.events.map((e) => e.id);
                          setReadIds(ids);
                          save("netsight-read", JSON.stringify(ids));
                        }}
                      >
                        Mark all as read
                      </Button>
                    </div>
                    <section className="panel">
                      <Events
                        data={{
                          ...data,
                          events: data.events.filter(
                            (e) => filter === "All" || e.severity === filter,
                          ),
                        }}
                        readIds={readIds}
                      />
                    </section>
                  </>
                )}
                {page === "Reports" && (
                  <section className="panel padded">
                    <Download size={26} />
                    <h2>Observation export</h2>
                    <p>
                      Download the current device inventory, local interface
                      counters, retained samples, and collection events as JSON.
                      The report includes its data source and mode.
                    </p>
                    <Button onClick={exportReport}>
                      <Download size={15} />
                      Export {mode} observations
                    </Button>
                  </section>
                )}
                {page === "Settings" && (
                  <section className="panel padded settings">
                    <h3>Workspace preferences</h3>
                    <div>
                      <span>
                        <strong>Appearance</strong>
                        <small>
                          Saved on this device. Respects reduced-motion
                          preferences.
                        </small>
                      </span>
                      <Button variant="outline" onClick={changeTheme}>
                        {theme === "dark"
                          ? "Switch to light"
                          : "Switch to dark"}
                      </Button>
                    </div>
                    <div>
                      <span>
                        <strong>Collection & privacy</strong>
                        <small>
                          Read-only interface counters. Endpoint checks run only
                          when requested.
                        </small>
                      </span>
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <span>
                        <strong>Storage retention</strong>
                        <small>
                          Desktop SQLite retains at most 24 hours of interface
                          samples.
                        </small>
                      </span>
                      <span className="badge">24 hours</span>
                    </div>
                    <div>
                      <span>
                        <strong>NetSight</strong>
                        <small>
                          0.1.0 · Foundation release · Windows desktop target
                        </small>
                      </span>
                      <Box size={20} />
                    </div>
                  </section>
                )}
              </>
            )
          )}
          <footer className="footer">
            <span>
              <Globe size={13} /> Local workspace
            </span>
            <span>
              {mode === "demo"
                ? "All displayed observations are synthetic"
                : "Local counters · Windows neighbor observations"}{" "}
              · NetSight 0.1
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
