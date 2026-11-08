import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, X, Copy, Save } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { Device } from "../../types";
export function DeviceDetails({
  device,
  demo,
  onClose,
  onSaved,
  onControl,
}: {
  device: Device;
  demo: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onControl?: (ip: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [alias, setAlias] = useState(device.alias || "");
  const [notes, setNotes] = useState(device.notes || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="drawer"
      aria-label="Device details"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <Button
        autoFocus
        variant="ghost"
        onClick={onClose}
        aria-label="Close details"
      >
        <X size={18} />
      </Button>
      <div className="detail-symbol">
        <Monitor size={28} />
      </div>
      <span className="eyebrow">DEVICE INSPECTOR</span>
      <h2>{device.name}</h2>
      <span className={`badge ${device.status === "Stale" ? "warning" : ""}`}>
        <i />
        {device.status}
      </span>
      <dl>
        {[
          ["IP address", device.ip],
          ["MAC address", device.mac],
          ["Vendor", device.vendor],
          ["Interface", device.interface || "Unavailable"],
          ["Source", device.source],
          ["Observation time", new Date(device.lastSeen).toLocaleString()],
        ].map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`${device.ip}\t${device.mac}`);
            setMessage("IP and MAC copied.");
          } catch {
            setMessage(
              "Clipboard unavailable. Select the address above to copy.",
            );
          }
        }}
      >
        <Copy size={14} />
        Copy addresses
      </Button>
      {!demo && device.source === "Windows neighbor table" && onControl && (
        <Button
          variant="outline"
          onClick={() => {
            onClose();
            onControl(device.ip);
          }}
        >
          Open bandwidth controls
        </Button>
      )}
      <form
        className="device-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await invoke("save_device", { id: device.id, alias, notes });
            await onSaved();
            setMessage("Device details saved on this computer.");
          } catch (error) {
            setMessage(String(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Display name
          <input
            maxLength={100}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            disabled={demo}
            placeholder="Optional device alias"
          />
        </label>
        <label>
          Notes
          <textarea
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={demo}
            placeholder="Location, owner, or maintenance notes"
          />
        </label>
        {demo ? (
          <p>
            Sample device metadata is read-only. Editing is available for live
            Windows observations.
          </p>
        ) : (
          <Button disabled={busy}>
            <Save size={14} />
            {busy ? "Saving…" : "Save details"}
          </Button>
        )}
      </form>
      <p role="status">{message}</p>
      <div className="coverage-note">
        Reachability describes the Windows neighbor-cache state. It is not a
        guarantee that a device is currently online.
      </div>
    </dialog>
  );
}
