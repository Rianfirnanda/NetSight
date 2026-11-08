import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, Monitor, Search, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { Device } from "../../types";
export function Devices({ devices }: { devices: Device[] }) {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selected, setSelected] = useState<Device | null>(null);
  const [status, setStatus] = useState("All");
  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Device",
        cell: (ctx) => (
          <span className="device-name">
            <Monitor size={16} />
            {String(ctx.getValue())}
          </span>
        ),
      },
      { accessorKey: "ip", header: "IP address" },
      { accessorKey: "vendor", header: "Vendor" },
      {
        accessorKey: "status",
        header: "Status",
        cell: (ctx) => (
          <span
            className={`badge ${ctx.getValue() === "Stale" ? "warning" : ""}`}
          >
            <i />
            {String(ctx.getValue())}
          </span>
        ),
      },
      { accessorKey: "source", header: "Source" },
    ],
    [],
  );
  const filtered = useMemo(
    () => devices.filter((d) => status === "All" || d.status === status),
    [devices, status],
  );
  const table = useReactTable({
    data: filtered,
    columns,
    state: { globalFilter: search, sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search devices"
            placeholder="Search devices, IP addresses…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["All", "Reachable", "Observed", "Stale"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <details className="columns">
          <summary>Columns</summary>
          {table.getAllLeafColumns().map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={c.getIsVisible()}
                onChange={c.getToggleVisibilityHandler()}
              />
              {String(c.columnDef.header)}
            </label>
          ))}
        </details>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => (
                  <th key={h.id}>
                    <button onClick={h.column.getToggleSortingHandler()}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      <ArrowUpDown size={12} />
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id}>
                {r.getVisibleCells().map((c, i) => (
                  <td key={c.id}>
                    {i === 0 ? (
                      <button
                        className="row-link"
                        onClick={() => setSelected(r.original)}
                      >
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </button>
                    ) : (
                      flexRender(c.column.columnDef.cell, c.getContext())
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!table.getRowModel().rows.length && (
          <div className="empty">
            No devices match this view. Locally observed neighbors will appear
            when supported by the collector.
          </div>
        )}
        <div className="table-footer">
          {table.getRowModel().rows.length} devices · Select a device to inspect
          its source and details
        </div>
      </div>
      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Device details"
            onKeyDown={(e) => {
              if (e.key === "Escape") setSelected(null);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              autoFocus
              variant="ghost"
              onClick={() => setSelected(null)}
              aria-label="Close details"
            >
              <X size={18} />
            </Button>
            <Monitor size={28} />
            <h2>{selected.name}</h2>
            <p>Observed device details</p>
            <dl>
              {Object.entries(selected).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value || "Unavailable"}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </>
  );
}
