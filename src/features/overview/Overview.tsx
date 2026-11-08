import {
  Activity,
  ArrowDownLeft,
  Bell,
  ChevronRight,
  Monitor,
  Network,
  ShieldCheck,
} from "lucide-react";
import { TrafficChart } from "../../components/shared/TrafficChart";
import { Events } from "../../components/shared/Events";
import type { Snapshot, Mode, Page } from "../../types";
function rate(value: number) {
  return `${(value / 1e6).toFixed(2)} MB/s`;
}

export function Overview({
  data,
  mode,
  theme,
  readIds,
  setPage,
}: {
  data: Snapshot;
  mode: Mode;
  theme: string;
  readIds: string[];
  setPage: (page: Page) => void;
}) {
  const unread = data.events.filter((e) => !readIds.includes(e.id)).length;
  return (
    <>
      <div className="metrics">
        <Metric
          icon={Monitor}
          label="Observed devices"
          value={String(data.devices.length)}
          caption={
            mode === "demo"
              ? "Synthetic device inventory"
              : "Windows neighbor observations"
          }
        />
        <Metric
          icon={Network}
          label="Network interfaces"
          value={String(data.adapters.length)}
          caption={
            mode === "demo"
              ? "Synthetic local adapter"
              : "OS interface enumeration"
          }
        />
        <Metric
          icon={ArrowDownLeft}
          label="Local download"
          value={rate(data.adapters.reduce((s, a) => s + a.download, 0))}
          caption="Derived from interface counters"
        />
        <Metric
          icon={Bell}
          label="Unread events"
          value={String(unread)}
          caption="Collection event history"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel traffic-panel">
          <div className="panel-heading">
            <div>
              <h3>Interface activity</h3>
              <p>
                Traffic on this machine ·{" "}
                {mode === "demo" ? "synthetic history" : "retained samples"}
              </p>
            </div>
            <div className="legend">
              <span>
                <i />
                Download
              </span>
              <span>
                <i />
                Upload
              </span>
            </div>
          </div>
          {data.samples.length ? (
            <TrafficChart samples={data.samples} theme={theme} />
          ) : (
            <div className="empty">Waiting for the next counter sample…</div>
          )}
          <div className="chart-footer">
            <span>
              <span className="status-dot" />{" "}
              {mode === "demo" ? "Sample dataset" : "5-second collection"}
            </span>
            <span>Bytes per second · excludes other devices</span>
          </div>
        </section>
        <section className="panel network-summary">
          <div className="panel-heading">
            <h3>Collection status</h3>
            <ShieldCheck size={17} />
          </div>
          <div className="collection-symbol">
            <Activity size={30} />
          </div>
          <h2>
            {mode === "demo" ? "Ready to explore" : "Collector connected"}
          </h2>
          <p>
            {mode === "demo"
              ? "A sample workspace to explore NetSight. Switch to live mode for local observations."
              : "Read-only local interface observations. No administrator access required."}
          </p>
          <dl>
            <div>
              <dt>Data source</dt>
              <dd>{mode === "demo" ? "Synthetic" : "Local OS"}</dd>
            </div>
            <div>
              <dt>Router integration</dt>
              <dd>Not configured</dd>
            </div>
            <div>
              <dt>Physical topology</dt>
              <dd>Unavailable</dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h3>
              Observed devices{" "}
              <span className="subtle">{data.devices.length}</span>
            </h3>
            <button className="text-button" onClick={() => setPage("Devices")}>
              View inventory <ChevronRight size={14} />
            </button>
          </div>
          {data.devices.length ? (
            data.devices.slice(0, 4).map((d) => (
              <div className="device-preview" key={d.id}>
                <span className="device-avatar">
                  <Monitor size={17} />
                </span>
                <div>
                  <strong>{d.name}</strong>
                  <small>
                    {d.ip} · {d.vendor}
                  </small>
                </div>
                <span className="badge">
                  <i />
                  {d.status}
                </span>
              </div>
            ))
          ) : (
            <div className="empty">
              No neighbors observed yet. Open Devices to discover your local
              subnet on Windows.
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h3>Recent events</h3>
            <button className="text-button" onClick={() => setPage("Alerts")}>
              All events <ChevronRight size={14} />
            </button>
          </div>
          <Events data={data} readIds={readIds} />
        </section>
      </div>
    </>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Monitor;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <section className="metric">
      <div>
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <strong>{value}</strong>
      <small>{caption}</small>
    </section>
  );
}
