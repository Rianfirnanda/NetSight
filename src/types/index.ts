export type Mode = "demo" | "live";
export type Page =
  | "Overview"
  | "Devices"
  | "Monitoring"
  | "Topology"
  | "Alerts"
  | "Reports"
  | "Settings";
export interface Adapter {
  name: string;
  addresses: string[];
  mac: string;
  received: number;
  transmitted: number;
  download: number;
  upload: number;
}
export interface Device {
  id: string;
  name: string;
  ip: string;
  mac: string;
  vendor: string;
  source: string;
  status: string;
  lastSeen: string;
}
export interface Sample {
  at: number;
  download: number;
  upload: number;
}
export interface NetworkEvent {
  id: string;
  title: string;
  detail: string;
  severity: "info" | "warning";
  at: string;
}
export interface Snapshot {
  adapters: Adapter[];
  devices: Device[];
  samples: Sample[];
  events: NetworkEvent[];
  collectedAt: string;
}
