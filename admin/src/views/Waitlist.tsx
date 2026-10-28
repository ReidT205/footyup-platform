import { useCallback } from "react";
import type { Api } from "../api";
import { downloadCsv, stamp, type Column } from "../csv";
import { dateTime } from "../format";
import { programOf, type WaitlistEntry } from "../types";
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "../ui";
import { useLoad } from "../useLoad";

const CSV: Column<WaitlistEntry>[] = [
  { header: "Joined", value: (r) => r.created_at },
  { header: "Program", value: (r) => programOf(r) },
  { header: "Parent", value: (r) => r.parent_name },
  { header: "Email", value: (r) => r.email },
  { header: "Phone", value: (r) => r.phone },
  { header: "Town", value: (r) => r.town },
  { header: "Spots", value: (r) => r.spots },
  { header: "Status", value: (r) => r.status },
];

export function Waitlist({ api, onExpired }: { api: Api; onExpired: () => void }) {
  const load = useCallback(() => api<{ waitlist: WaitlistEntry[] }>("waitlist"), [api]);
  const { data, error, loading, reload } = useLoad(load, onExpired);
  const rows = data?.waitlist ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Waitlist</h1>
          <p>Families who asked for a spot after a session or Miami group filled, in the order they joined.</p>
        </div>
        <div className="card-actions">
          <Button variant="secondary" onClick={reload} disabled={loading}>Refresh</Button>
          <Button disabled={!rows.length} onClick={() => downloadCsv(`footyup-waitlist-${stamp()}.csv`, CSV, rows)}>Export CSV</Button>
        </div>
      </div>
      <Card>
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="Nobody is waiting">When a session or Miami group fills, families can join the waitlist and appear here.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Joined</th><th>Program</th><th>Parent</th><th>Town</th><th className="num">Spots</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ cursor: "default" }}>
                    <td className="sub">{i + 1}</td>
                    <td>{dateTime(r.created_at)}</td>
                    <td>{programOf(r)}</td>
                    <td>{r.parent_name}<div className="sub">{r.email} · {r.phone}</div></td>
                    <td>{r.town}</td>
                    <td className="num">{r.spots}</td>
                    <td><Badge value={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
