import { useState } from "react";
import { ReactFlow, Background, Controls, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Device } from "../../types";
export function Topology({
  devices,
  demo,
}: {
  devices: Device[];
  demo: boolean;
}) {
  const [selected, setSelected] = useState<Node | null>(null);
  const nodes = devices.map((d, i) => ({
    id: d.id,
    position: { x: (i % 3) * 240, y: Math.floor(i / 3) * 110 },
    data: { label: `${d.name}\n${d.ip}` },
  }));
  return (
    <>
      <div className="notice">
        {demo ? "Synthetic demo devices" : "Locally observed devices"} · Spatial
        grouping only. No physical links are inferred.
      </div>
      <div className="panel topology">
        <ReactFlow
          nodes={nodes}
          edges={[]}
          fitView
          nodesDraggable
          onNodeClick={(_, n) => setSelected(n)}
        >
          <Background gap={24} />
          <Controls />
        </ReactFlow>
        {!devices.length && (
          <div className="topology-empty">No observed devices available.</div>
        )}
      </div>
      {selected && (
        <div className="notice">Selected: {String(selected.data.label)}</div>
      )}
    </>
  );
}
