import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "../../components/ui/button";

import type { Policy } from "../../lib/bandwidth";
export function PolicyFields({
  value,
  onChange,
}: {
  value: Policy;
  onChange: (value: Policy) => void;
}) {
  return (
    <div className="bandwidth-fields">
      <label>
        Upload limit · kbps
        <input
          aria-label="Upload limit kbps"
          type="number"
          min={1}
          max={1000000}
          step={1}
          placeholder="Unlimited"
          disabled={value.blocked}
          value={value.uploadKbps ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              uploadKbps: e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </label>
      <label>
        Download limit · kbps
        <input
          aria-label="Download limit kbps"
          type="number"
          min={1}
          max={1000000}
          step={1}
          placeholder="Unlimited"
          disabled={value.blocked}
          value={value.downloadKbps ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              downloadKbps:
                e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </label>
      <label className="block-policy">
        <input
          type="checkbox"
          checked={value.blocked}
          onChange={(e) => onChange({ ...value, blocked: e.target.checked })}
        />
        Block forwarded IPv4 traffic for this target
      </label>
      <p className="policy-explanation">
        Leave a limit blank for unlimited. 1 Mbps = 1,000 kbps. Limits apply
        separately to each direction using frame drops above the budget; they do
        not reserve bandwidth or guarantee application throughput.
      </p>
    </div>
  );
}
export function ActivePolicy({
  target,
  gateway,
  initial,
  onApplied,
}: {
  target: string;
  gateway: string;
  initial: Policy;
  onApplied: () => Promise<unknown>;
}) {
  const [policy, setPolicy] = useState(initial);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const expected = `CONTROL ${target} ${gateway}`;
  return (
    <form
      className="active-policy"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          await invoke("update_lab_policy", {
            target,
            gateway,
            policy,
            confirmation,
          });
          await onApplied();
          setConfirmation("");
          setMessage("Policy applied to the active lab session.");
        } catch (error) {
          setMessage(String(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>
        <SlidersHorizontal size={16} />
        Change active bandwidth policy
      </h3>
      <p>
        {target} ↔ {gateway}. Changes affect this session immediately after the
        audit entry is saved.
      </p>
      <fieldset disabled={busy}>
        <PolicyFields value={policy} onChange={setPolicy} />
        <label>
          Confirm the active scope: <code>{expected}</code>
          <input
            aria-label="Bandwidth policy confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </label>
      </fieldset>
      <Button disabled={busy || confirmation !== expected}>
        {busy ? "Applying…" : "Apply policy"}
      </Button>
      <p role="status">{message}</p>
    </form>
  );
}
