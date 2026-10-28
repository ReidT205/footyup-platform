import { useCallback, useMemo, useState } from "react";
import type { Api } from "../api";
import { downloadCsv, stamp, type Column } from "../csv";
import { dateTime } from "../format";
import type { TrainingRequest } from "../types";
import { Badge, Button, Card, Details, Drawer, EmptyState, ErrorState, Spinner } from "../ui";
import { useLoad } from "../useLoad";

const CSV: Column<TrainingRequest>[] = [
  { header: "Received", value: (r) => r.created_at },
  { header: "Parent", value: (r) => r.parent_name },
  { header: "Email", value: (r) => r.email },
  { header: "Phone", value: (r) => r.phone },
  { header: "Town", value: (r) => r.town },
  { header: "Player", value: (r) => r.player_name },
  { header: "Player age", value: (r) => r.player_age },
  { header: "Preferred times", value: (r) => r.preferred_times },
  { header: "Message", value: (r) => r.message },
  { header: "Status", value: (r) => r.status },
];

export function Requests({ api, onExpired }: { api: Api; onExpired: () => void }) {
  const load = useCallback(() => api<{ requests: TrainingRequest[] }>("requests"), [api]);
  const { data, error, loading, reload } = useLoad(load, onExpired);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<TrainingRequest | null>(null);

  const rows = data?.requests ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => [r.parent_name, r.player_name, r.email, r.phone, r.town].some((v) => v.toLowerCase().includes(q))) : rows;
  }, [rows, search]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Private training requests</h1>
          <p>Requests from the website form. Each one is also emailed to the notification address.</p>
        </div>
        <div className="card-actions">
          <Button variant="secondary" onClick={reload} disabled={loading}>Refresh</Button>
          <Button disabled={!filtered.length} onClick={() => downloadCsv(`footyup-training-requests-${stamp()}.csv`, CSV, filtered)}>Export CSV</Button>
        </div>
      </div>
      <Card>
        <div className="filters" style={{ gridTemplateColumns: "minmax(0, 420px)" }}>
          <input className="input" placeholder="Search name, email, phone or town" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        </div>
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState title={rows.length ? "Nothing matches your search" : "No requests yet"}>
            {rows.length ? null : "New requests from the website appear here."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Received</th><th>Parent</th><th>Player</th><th>Town</th><th>Phone</th><th>Message</th><th>Status</th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => setOpen(r)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(r)}>
                    <td>{dateTime(r.created_at)}</td>
                    <td>{r.parent_name}<div className="sub">{r.email}</div></td>
                    <td>{r.player_name}<div className="sub">Age {r.player_age}</div></td>
                    <td>{r.town}</td>
                    <td>{r.phone}</td>
                    <td className="wrap">{r.message ? (r.message.length > 90 ? `${r.message.slice(0, 90)}…` : r.message) : <span className="sub">—</span>}</td>
                    <td><Badge value={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && (
        <Drawer title={`Request from ${open.parent_name}`} onClose={() => setOpen(null)}>
          <Details
            rows={[
              ["Received", dateTime(open.created_at)],
              ["Status", <Badge key="s" value={open.status} />],
              ["Email", <a key="e" href={`mailto:${open.email}`}>{open.email}</a>],
              ["Phone", <a key="p" href={`tel:${open.phone}`}>{open.phone}</a>],
              ["Town", open.town],
              ["Player", `${open.player_name} (age ${open.player_age})`],
              ["Preferred times", open.preferred_times],
            ]}
          />
          <section>
            <h3>Message</h3>
            <div className="message">{open.message || "No message."}</div>
          </section>
        </Drawer>
      )}
    </>
  );
}
