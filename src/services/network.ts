import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Mode, Snapshot } from "../types";
export const desktop = isTauri();
const now = Date.now();
const demo: Snapshot = {
  adapters: [
    {
      name: "Ethernet · Intel I225-V",
      addresses: ["192.168.10.24"],
      mac: "A4:BB:6D:02:81:24",
      received: 8673900000,
      transmitted: 2491000000,
      download: 4200000,
      upload: 890000,
    },
  ],
  devices: [
    ["01", "Design workstation", "192.168.10.24", "Dell", "Reachable"],
    ["02", "Studio access point", "192.168.10.2", "Ubiquiti", "Observed"],
    ["03", "Meeting room display", "192.168.10.42", "Samsung", "Observed"],
    ["04", "Office printer", "192.168.10.56", "HP", "Observed"],
    ["05", "NAS storage", "192.168.10.10", "Synology", "Reachable"],
    ["06", "Engineering workstation", "192.168.10.31", "Lenovo", "Observed"],
    ["07", "Reception tablet", "192.168.10.67", "Apple", "Stale"],
  ].map(([id, name, ip, vendor, status]) => ({
    id,
    name,
    ip,
    vendor,
    status,
    mac: `A4:BB:6D:02:81:${id}`,
    source: "Synthetic demo",
    lastSeen: new Date(now - Number(id) * 60000).toISOString(),
  })),
  samples: Array.from({ length: 48 }, (_, i) => ({
    at: now - (47 - i) * 60000,
    download: Math.round(
      (2.8 + Math.sin(i * 0.6) * 1.1 + Math.cos(i * 1.7) * 0.5) * 1000000,
    ),
    upload: Math.round((0.8 + Math.sin(i * 0.4) * 0.4) * 1000000),
  })),
  events: [
    {
      id: "e1",
      title: "New device observed",
      detail: "Meeting room display · 192.168.10.42",
      severity: "info",
      at: new Date(now - 120000).toISOString(),
    },
    {
      id: "e2",
      title: "Device observation is stale",
      detail: "Reception tablet · last observation 7 minutes ago",
      severity: "warning",
      at: new Date(now - 420000).toISOString(),
    },
    {
      id: "e3",
      title: "Collection started",
      detail: "Demo workspace · synthetic network dataset",
      severity: "info",
      at: new Date(now - 1800000).toISOString(),
    },
  ],
  collectedAt: new Date(now).toISOString(),
};
export async function getSnapshot(mode: Mode): Promise<Snapshot> {
  if (mode === "demo") return structuredClone(demo);
  if (!desktop)
    throw new Error(
      "Live collection requires the NetSight desktop app. Open this project with npm run tauri dev.",
    );
  return invoke<Snapshot>("snapshot");
}
export async function checkEndpoint(
  host: string,
  port: number,
): Promise<number> {
  if (!desktop) throw new Error("Endpoint checks require the desktop app.");
  return invoke<number>("check_endpoint", { host, port });
}
