import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { FlaskConical, Square, ArrowRightLeft } from "lucide-react";
import { desktop } from "../../services/network";
import { Button } from "../../components/ui/button";
import type { Device } from "../../types";
interface Status {
  running: boolean;
  phase: string;
  target: string;
  gateway: string;
  forwarded: number;
  bytes: number;
  remaining: number;
  restoration: string;
  error: string | null;
}
function useLabStatus() {
  return useQuery({
    queryKey: ["lab-status"],
    queryFn: () => invoke<Status>("lab_status"),
    enabled: desktop,
    refetchInterval: 1000,
    retry: false,
  });
}
export function LabIndicator() {
  const query = useLabStatus();
  const [error, setError] = useState("");
  if (!query.data?.running) return null;
  return (
    <div className="lab-indicator" role="status">
      <ArrowRightLeft size={17} />
      <span>
        LAB ACTIVE · {query.data.target} ↔ {query.data.gateway} ·{" "}
        {query.data.remaining}s remaining {error}
      </span>
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await invoke("stop_lab");
            await query.refetch();
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        <Square size={13} />
        Stop & restore ARP
      </Button>
    </div>
  );
}
export function LabSession({
  devices,
  demo,
}: {
  devices: Device[];
  demo: boolean;
}) {
  const status = useLabStatus();
  const scopes = useQuery({
    queryKey: ["discovery-scopes"],
    queryFn: () =>
      invoke<{ address: string; interface: string; prefix: number }[]>(
        "discovery_scopes",
      ),
    enabled: desktop && !demo,
    retry: false,
  });
  const [address, setAddress] = useState("");
  const [target, setTarget] = useState("");
  const [gateway, setGateway] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const peers = devices.filter(
    (d) => d.source === "Windows neighbor table" && d.status === "Reachable",
  );
  const active = status.data?.running || false;
  const expected = `LAB ${target} ${gateway}`;
  return (
    <section className="panel padded lab-panel">
      <div className="lab-title">
        <FlaskConical size={23} />
        <div>
          <h3>IPv4 interception lab</h3>
          <span>EXPERIMENTAL · WINDOWS / NPCAP · NOT RUNTIME-VALIDATED</span>
        </div>
      </div>
      <p>
        A time-limited ARP redirection session for your authorized lab. NetSight
        forwards IPv4 frames between one target and one gateway. It counts
        frames and bytes; it does not decrypt TLS or save packet contents.
      </p>
      <div className="notice">
        Requires official Npcap and adapter access, usually administrator
        rights. Connections can be interrupted. Stop sends corrective ARP
        frames; verify recovery on both devices. Power loss or forced
        termination prevents cleanup.
      </div>
      {demo || !desktop ? (
        <p>
          Start sessions from live mode in the Windows desktop app. No
          interception is simulated in demo mode.
        </p>
      ) : (
        <form
          className="lab-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              await invoke("start_lab", {
                config: {
                  address: address || scopes.data?.[0]?.address,
                  target,
                  gateway,
                  seconds,
                  confirmation,
                },
              });
              setConfirmation("");
              await status.refetch();
            } catch (error) {
              setMessage(String(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={active || busy}>
            <label>
              Local lab interface
              <select
                aria-label="Lab local interface"
                value={address || scopes.data?.[0]?.address || ""}
                onChange={(e) => setAddress(e.target.value)}
              >
                {!scopes.data?.length && (
                  <option value="">No supported interface</option>
                )}
                {scopes.data?.map((s) => (
                  <option key={s.address} value={s.address}>
                    {s.address}/{s.prefix} · {s.interface}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target device
              <select
                aria-label="Lab target device"
                required
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setConfirmation("");
                }}
              >
                <option value="">Select a reachable lab neighbor</option>
                {peers.map((d) => (
                  <option key={d.id} value={d.ip}>
                    {d.ip} · {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Gateway device
              <select
                aria-label="Lab gateway device"
                required
                value={gateway}
                onChange={(e) => {
                  setGateway(e.target.value);
                  setConfirmation("");
                }}
              >
                <option value="">Select your lab gateway explicitly</option>
                {peers
                  .filter((d) => d.ip !== target)
                  .map((d) => (
                    <option key={d.id} value={d.ip}>
                      {d.ip} · {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Session duration (seconds)
              <input
                aria-label="Lab duration"
                type="number"
                min={30}
                max={300}
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
              />
            </label>
            <label className="lab-confirm">
              I authorize changes to these lab devices. Type{" "}
              <code>
                {target && gateway ? expected : "LAB <target IP> <gateway IP>"}
              </code>
              <input
                aria-label="Lab confirmation"
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          </fieldset>
          <Button
            disabled={
              active ||
              busy ||
              !target ||
              !gateway ||
              target === gateway ||
              confirmation !== expected ||
              !scopes.data?.length
            }
          >
            <FlaskConical size={15} />
            {busy ? "Preparing…" : "Start lab session"}
          </Button>
        </form>
      )}
      <div className="lab-state">
        <span>
          Session <strong>{status.data?.phase || "Idle"}</strong>
        </span>
        <span>
          Forwarded <strong>{status.data?.forwarded || 0} frames</strong>
        </span>
        <span>
          Volume{" "}
          <strong>{((status.data?.bytes || 0) / 1e6).toFixed(2)} MB</strong>
        </span>
        <span>
          Remaining <strong>{status.data?.remaining || 0}s</strong>
        </span>
      </div>
      {active && (
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await invoke("stop_lab");
              await status.refetch();
            } catch (error) {
              setMessage(String(error));
            }
          }}
        >
          <Square size={13} />
          Stop & restore ARP
        </Button>
      )}
      <p role="status">
        {message || status.data?.error || status.error?.message}
      </p>
      {status.data?.restoration && (
        <p>Restoration: {status.data.restoration}</p>
      )}
      <div className="coverage-note">
        IPv4 over untagged Ethernet-compatible interfaces only; one session at a
        time, 30–300 seconds. Peers must be reachable on the same interface.
        Session metadata is recorded in the local app-data lab audit file.
        Discovery is not an interception session.
      </div>
    </section>
  );
}
