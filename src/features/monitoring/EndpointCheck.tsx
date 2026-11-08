import { useState } from "react";
import { checkEndpoint } from "../../services/network";
import { Button } from "../../components/ui/button";
export function EndpointCheck() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState(443);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel padded">
      <h3>Authorized endpoint check</h3>
      <p>
        One TCP connection to an endpoint you manage. This measures TCP
        connection time, not ICMP latency.
      </p>
      <form
        className="endpoint"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setResult("");
          try {
            const ms = await checkEndpoint(host, port);
            setResult(`TCP connected in ${ms.toFixed(1)} ms`);
          } catch (error) {
            setResult(String(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="Endpoint hostname"
          required
          placeholder="Hostname or IP address"
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        <input
          aria-label="Endpoint port"
          type="number"
          min="1"
          max="65535"
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
        />
        <Button disabled={busy}>{busy ? "Checking…" : "Check endpoint"}</Button>
      </form>
      <p role="status">{result}</p>
    </section>
  );
}
