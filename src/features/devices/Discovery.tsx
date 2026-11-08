import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Radar, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/button";
import { desktop } from "../../services/network";
interface Scope {
  address: string;
  interface: string;
  prefix: number;
  targets: number;
}
export function Discovery({ demo }: { demo: boolean }) {
  const client = useQueryClient();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const scopes = useQuery({
    queryKey: ["discovery-scopes"],
    queryFn: () => invoke<Scope[]>("discovery_scopes"),
    enabled: !demo && desktop,
    retry: false,
  });
  const selected = scopes.data?.find(
    (s) => s.address === (address || scopes.data?.[0]?.address),
  );
  return (
    <section className="discovery-strip">
      <div className="discovery-heading">
        <Radar size={23} />
        <div>
          <strong>LAN discovery</strong>
          <p>
            {demo
              ? "Explore the sample inventory. Switch to the Windows desktop live mode to discover your network."
              : "Windows neighbor cache + optional local subnet discovery. No administrator access required."}
          </p>
        </div>
        <span className="discovery-protocol">ARP / IPv4</span>
      </div>
      {!demo && (
        <>
          <form
            className="discovery-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selected) return;
              setBusy(true);
              setMessage(
                "Discovering the selected subnet… This can take about 20 seconds.",
              );
              try {
                const count = await invoke<number>("discover_devices", {
                  address: selected.address,
                });
                await client.invalidateQueries({
                  queryKey: ["snapshot", "live"],
                });
                setMessage(
                  `Discovery complete. ${count} addresses attempted; inventory refreshed from Windows. A response on port 80 is not required for neighbor observation.`,
                );
              } catch (error) {
                setMessage(String(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            <select
              aria-label="Discovery interface"
              disabled={busy || !scopes.data?.length}
              value={selected?.address || ""}
              onChange={(e) => setAddress(e.target.value)}
            >
              {!scopes.data?.length && (
                <option value="">No eligible IPv4 /24–/30 interfaces</option>
              )}
              {scopes.data?.map((s) => (
                <option key={s.address} value={s.address}>
                  {s.address}/{s.prefix} · {s.interface}
                </option>
              ))}
            </select>
            <Button disabled={busy || !selected}>
              <Radar size={15} />
              {busy ? "Discovering…" : "Discover subnet"}
            </Button>
            <span>
              {selected
                ? `${selected.targets} targets · max 8 concurrent`
                : "Windows desktop required"}
            </span>
          </form>
          <p className="discovery-consent">
            <ShieldCheck size={13} /> Run only on a network you manage. One TCP
            attempt on port 80 per address; no traffic interception.
          </p>
        </>
      )}
      <p role="status">{message || scopes.error?.message}</p>
      <div className="coverage-note">
        Coverage is observational. Sleeping devices, client isolation, other
        VLANs, and IPv6-only devices may be absent. A complete inventory
        requires authorized router or DHCP integration.
      </div>
    </section>
  );
}
