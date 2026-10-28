import { useCallback, useMemo, useState } from "react";
import type { Api } from "../api";
import { downloadCsv, stamp, type Column } from "../csv";
import { dateTime, height, label, money } from "../format";
import { programOf, type Registration } from "../types";
import { Badge, Button, Card, Details, Drawer, EmptyState, ErrorState, Pager, Spinner } from "../ui";
import { useLoad } from "../useLoad";

const PAGE = 50;
type SortKey = "created_at" | "player_name" | "program" | "parent_town";

const CSV_COLUMNS: Column<Registration>[] = [
  { header: "Registered at", value: (r) => r.created_at },
  { header: "Program", value: (r) => r.camp },
  { header: "Session / group", value: (r) => r.session ?? (r.miami_group === "boys" ? "Boys" : r.miami_group === "girls" ? "Girls" : "") },
  { header: "Host-school code used", value: (r) => (r.miami_group ? (r.via_access_code ? "Yes" : "No") : "") },
  { header: "Player first name", value: (r) => r.player_first_name ?? r.player_name },
  { header: "Player last name", value: (r) => r.player_last_name ?? "" },
  { header: "Player age", value: (r) => r.player_age },
  { header: "Player sex", value: (r) => r.player_sex },
  { header: "Player email", value: (r) => r.player_email },
  { header: "Height (in)", value: (r) => r.player_height_in },
  { header: "Weight (lb)", value: (r) => r.player_weight_lb },
  { header: "Primary position", value: (r) => r.player_position },
  { header: "Current club / team", value: (r) => r.player_club },
  { header: "Shirt size", value: (r) => r.shirt_size },
  { header: "Short size", value: (r) => r.short_size },
  { header: "Parent first name", value: (r) => r.parent_first_name ?? r.parent_name },
  { header: "Parent last name", value: (r) => r.parent_last_name ?? "" },
  { header: "Parent email", value: (r) => r.parent_email },
  { header: "Parent phone", value: (r) => r.parent_phone },
  { header: "Emergency phone", value: (r) => r.emergency_phone },
  { header: "Town", value: (r) => r.parent_town },
  { header: "Shipping street", value: (r) => r.ship_line1 },
  { header: "Apt / unit", value: (r) => r.ship_line2 },
  { header: "Shipping city", value: (r) => r.ship_city },
  { header: "Shipping state", value: (r) => r.ship_state },
  { header: "Shipping ZIP", value: (r) => r.ship_postal_code },
  { header: "Other form fields", value: (r) => (Object.keys(r.extra ?? {}).length ? JSON.stringify(r.extra) : "") },
  { header: "Waiver", value: (r) => r.waiver_status },
  { header: "Waiver version", value: (r) => r.waiver_version },
  { header: "Waiver accepted at", value: (r) => r.waiver_accepted_at },
  { header: "Waiver signed name", value: (r) => r.waiver_accepted_name },
  { header: "Payment status", value: (r) => r.payment_status },
  { header: "Checkout total (USD)", value: (r) => (r.checkout_total_cents / 100).toFixed(2) },
  { header: "Refunded (USD)", value: (r) => (r.refunded_cents / 100).toFixed(2) },
  { header: "Stripe payment", value: (r) => r.stripe_payment_intent_id },
  { header: "Registration ID", value: (r) => r.id },
];

function RegistrationDrawer({ r, onClose }: { r: Registration; onClose: () => void }) {
  const miami = Boolean(r.miami_group);
  return (
    <Drawer title={r.player_name} onClose={onClose}>
      <section>
        <h3>Registration</h3>
        <Details
          rows={[
            ["Program", programOf(r)],
            ["Registered", dateTime(r.created_at)],
            ["Payment", <Badge key="p" value={r.payment_status} />],
            ["Waiver", <Badge key="w" value={r.waiver_status} />],
            ...(miami ? ([["Host-school code", r.via_access_code ? "Used" : "Not used"]] as [string, string][]) : []),
          ]}
        />
      </section>
      <section>
        <h3>Player</h3>
        <Details
          rows={[
            ["Name", r.player_name],
            ["Age", r.player_age],
            ...(miami
              ? ([
                  ["Email", r.player_email],
                  ["Primary position", r.player_position],
                  ["Current club / team", r.player_club],
                  ["Shirt / short size", `${r.shirt_size ?? "—"} / ${r.short_size ?? "—"}`],
                ] as [string, string | null][])
              : ([["Sex", label(r.player_sex)]] as [string, string][])),
          ]}
        />
      </section>
      {miami && (
        <section className="sensitive">
          <h3>Sensitive · shipping and measurements</h3>
          <Details
            rows={[
              ["Height", height(r.player_height_in)],
              ["Weight", r.player_weight_lb ? `${r.player_weight_lb} lb` : "—"],
              [
                "Ship to",
                r.ship_line1 ? (
                  <span key="a">
                    {r.ship_line1}
                    {r.ship_line2 ? `, ${r.ship_line2}` : ""}
                    <br />
                    {r.ship_city}, {r.ship_state} {r.ship_postal_code}
                  </span>
                ) : null,
              ],
            ]}
          />
        </section>
      )}
      <section>
        <h3>Parent / guardian</h3>
        <Details
          rows={[
            ["Name", r.parent_name],
            ["Town", r.parent_town],
            ["Email", <a key="e" href={`mailto:${r.parent_email}`}>{r.parent_email}</a>],
            ["Phone", <a key="t" href={`tel:${r.parent_phone}`}>{r.parent_phone}</a>],
            ...(r.emergency_phone ? ([["Emergency phone", r.emergency_phone]] as [string, string][]) : []),
          ]}
        />
      </section>
      {Object.keys(r.extra ?? {}).length > 0 && (
        <section>
          <h3>Other form fields</h3>
          <Details rows={Object.entries(r.extra).map(([k, v]) => [k, String(v)])} />
        </section>
      )}
      <section>
        <h3>Payment</h3>
        <Details
          rows={[
            ["Checkout total", money(r.checkout_total_cents)],
            ["Refunded", money(r.refunded_cents)],
            ["Stripe payment", r.stripe_payment_intent_id],
            ["Waiver accepted", r.waiver_accepted_at ? `${dateTime(r.waiver_accepted_at)} by ${r.waiver_accepted_name} (v${r.waiver_version})` : "Not collected"],
          ]}
        />
        <p className="sub" style={{ marginTop: 10 }}>
          The checkout total covers every player and session paid for together.
        </p>
      </section>
    </Drawer>
  );
}

export function Registrations({ api, onExpired }: { api: Api; onExpired: () => void }) {
  const load = useCallback(() => api<{ registrations: Registration[] }>("registrations"), [api]);
  const { data, error, loading, reload } = useLoad(load, onExpired);

  const [search, setSearch] = useState("");
  const [program, setProgram] = useState("");
  const [town, setTown] = useState("");
  const [payment, setPayment] = useState("");
  const [waiver, setWaiver] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "created_at", dir: -1 });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Registration | null>(null);

  const rows = data?.registrations ?? [];
  const programs = useMemo(() => [...new Set(rows.map(programOf))].sort(), [rows]);
  const towns = useMemo(() => [...new Set(rows.map((r) => r.parent_town.trim()))].sort((a, b) => a.localeCompare(b)), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTs = to ? new Date(`${to}T23:59:59`).getTime() : null;
    const list = rows.filter((r) => {
      if (q && ![r.player_name, r.parent_name, r.parent_email, r.parent_phone, r.player_email ?? ""].some((v) => v.toLowerCase().includes(q))) return false;
      if (program && programOf(r) !== program) return false;
      if (town && r.parent_town.trim().toLowerCase() !== town.toLowerCase()) return false;
      if (payment && r.payment_status !== payment) return false;
      if (waiver && r.waiver_status !== waiver) return false;
      const ts = new Date(r.created_at).getTime();
      if (fromTs && ts < fromTs) return false;
      if (toTs && ts > toTs) return false;
      return true;
    });
    const value = (r: Registration) => (sort.key === "program" ? programOf(r) : String(r[sort.key] ?? ""));
    return list.sort((a, b) => value(a).localeCompare(value(b)) * sort.dir);
  }, [rows, search, program, town, payment, waiver, from, to, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE, current * PAGE + PAGE);
  const anyFilter = search || program || town || payment || waiver || from || to;

  const reset = () => {
    setSearch(""); setProgram(""); setTown(""); setPayment(""); setWaiver(""); setFrom(""); setTo(""); setPage(0);
  };
  const filterSetter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "created_at" ? -1 : 1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : "");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Registrations</h1>
          <p>Every paid registration, saved automatically when Stripe confirms the payment.</p>
        </div>
        <div className="card-actions">
          <Button variant="secondary" onClick={reload} disabled={loading}>Refresh</Button>
          <Button disabled={!filtered.length} onClick={() => downloadCsv(`footyup-registrations-${stamp()}.csv`, CSV_COLUMNS, filtered)}>
            Export CSV{anyFilter ? ` (${filtered.length})` : ""}
          </Button>
        </div>
      </div>

      <Card>
        <div className="filters">
          <input className="input" placeholder="Search player, parent, email or phone" value={search} onChange={(e) => filterSetter(setSearch)(e.target.value)} aria-label="Search" />
          <select className="select" value={program} onChange={(e) => filterSetter(setProgram)(e.target.value)} aria-label="Program">
            <option value="">All programs</option>
            {programs.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className="select" value={town} onChange={(e) => filterSetter(setTown)(e.target.value)} aria-label="Town">
            <option value="">All towns</option>
            {towns.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select className="select" value={payment} onChange={(e) => filterSetter(setPayment)(e.target.value)} aria-label="Payment status">
            <option value="">Any payment</option>
            <option value="paid">Paid</option>
            <option value="partially_refunded">Partially refunded</option>
            <option value="refunded">Refunded</option>
          </select>
          <select className="select" value={waiver} onChange={(e) => filterSetter(setWaiver)(e.target.value)} aria-label="Waiver">
            <option value="">Any waiver</option>
            <option value="accepted">Accepted</option>
            <option value="not_collected">Not collected</option>
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="input" type="date" value={from} onChange={(e) => filterSetter(setFrom)(e.target.value)} aria-label="Registered from" />
            <input className="input" type="date" value={to} onChange={(e) => filterSetter(setTo)(e.target.value)} aria-label="Registered to" />
          </div>
        </div>
        <div className="filters-actions">
          <span>
            Showing {filtered.length} of {rows.length}
          </span>
          {anyFilter && <button className="link" onClick={reset}>Clear filters</button>}
        </div>

        {loading && !data ? (
          <Spinner label="Loading registrations…" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No registrations yet">They appear here as soon as a family completes payment.</EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState title="Nothing matches these filters">
            <button className="link" onClick={reset}>Clear filters</button>
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th><button onClick={() => sortBy("created_at")}>Registered {arrow("created_at")}</button></th>
                    <th><button onClick={() => sortBy("player_name")}>Player {arrow("player_name")}</button></th>
                    <th><button onClick={() => sortBy("program")}>Program {arrow("program")}</button></th>
                    <th>Parent</th>
                    <th><button onClick={() => sortBy("parent_town")}>Town {arrow("parent_town")}</button></th>
                    <th>Payment</th>
                    <th>Waiver</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} onClick={() => setOpen(r)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(r)}>
                      <td>{dateTime(r.created_at)}</td>
                      <td>
                        {r.player_name}
                        <div className="sub">Age {r.player_age}</div>
                      </td>
                      <td>{programOf(r)}</td>
                      <td>
                        {r.parent_name}
                        <div className="sub">{r.parent_email}</div>
                      </td>
                      <td>{r.parent_town}</td>
                      <td><Badge value={r.payment_status} /></td>
                      <td><Badge value={r.waiver_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={current} pages={pages} total={filtered.length} onPage={setPage} />
          </>
        )}
      </Card>
      {open && <RegistrationDrawer r={open} onClose={() => setOpen(null)} />}
    </>
  );
}
