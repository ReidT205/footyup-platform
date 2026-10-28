import type { Api } from "../api";
import { dateRange, dateTime, money } from "../format";
import type { MiamiGroupRow, Overview as OverviewData } from "../types";
import { Card, EmptyState, ErrorState, Spinner } from "../ui";
import { useLoad } from "../useLoad";
import { useCallback } from "react";

function phaseText(data: OverviewData): { text: string; tone: string } {
  const e = data.event;
  if (!e) return { text: "Miami not configured", tone: "#64748b" };
  const now = Date.now();
  if (!e.checkout_open) return { text: "Checkout paused", tone: "#b42318" };
  if (e.closes_at && new Date(e.closes_at).getTime() <= now) return { text: `Closed ${dateTime(e.closes_at)}`, tone: "#64748b" };
  if (e.opens_at && new Date(e.opens_at).getTime() > now) return { text: `Opens ${dateTime(e.opens_at)}`, tone: "#93370d" };
  if (data.codes.required) return { text: "Open to access-code holders only", tone: "#93370d" };
  return { text: "Open to everyone", tone: "#0b6533" };
}

function GroupCard({ g, codesActive }: { g: MiamiGroupRow; codesActive: boolean }) {
  const paidPct = g.cap ? Math.min(100, (g.paid / g.cap) * 100) : 0;
  const heldPct = g.cap ? Math.min(100 - paidPct, (g.held / g.cap) * 100) : 0;
  const samePrice = g.price_code_holder_cents === g.price_public_cents || g.price_code_holder_cents == null;
  return (
    <Card>
      <div className="card-body">
        <div className="group-head">
          <h3>{g.label}</h3>
          <span className="sub">{dateRange(g.starts_on, g.ends_on)}</span>
        </div>
        <div className="meter" aria-label={`${g.paid} of ${g.cap} spots paid`}>
          <div className="meter-paid" style={{ width: `${paidPct}%` }} />
          <div className="meter-held" style={{ width: `${heldPct}%` }} />
        </div>
        <div className="meter-legend">
          <span><span className="dot" style={{ background: "var(--primary)" }} />{g.paid} paid</span>
          <span><span className="dot" style={{ background: "#86d0a5" }} />{g.held} in checkout now</span>
          <span>{g.cap} total spots</span>
        </div>
        <div className="kv">
          <div><span>Open to public</span><strong>{g.left_for_public}</strong></div>
          <div><span>Open to code holders</span><strong>{codesActive ? g.left_for_code_holders : "—"}</strong></div>
          <div>
            <span>Price</span>
            <strong>{samePrice ? money(g.price_public_cents) : `${money(g.price_public_cents)} / ${money(g.price_code_holder_cents)}`}</strong>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function Overview({ api, onExpired }: { api: Api; onExpired: () => void }) {
  const load = useCallback(() => api<OverviewData>("overview"), [api]);
  const { data, error, loading, reload } = useLoad(load, onExpired);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const phase = phaseText(data);
  const reserved = data.event?.reserved_total ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Paid registrations only. Refunded registrations are not counted.</p>
        </div>
      </div>

      <div className="grid grid-4">
        <Card className="stat">
          <div className="stat-label">Registrations</div>
          <div className="stat-value">{data.totals.registrations}</div>
        </Card>
        <Card className="stat">
          <div className="stat-label">Collected (after refunds)</div>
          <div className="stat-value">{money(data.totals.net_cents)}</div>
          <div className="stat-sub">Before Stripe fees</div>
        </Card>
        <Card className="stat">
          <div className="stat-label">New training requests</div>
          <div className="stat-value">{data.totals.new_requests}</div>
        </Card>
        <Card className="stat">
          <div className="stat-label">On waitlists</div>
          <div className="stat-value">{data.totals.waiting}</div>
        </Card>
      </div>

      {data.event && (
        <Card
          title={data.event.name}
          actions={
            <span className="phase" style={{ color: phase.tone }}>
              <span className="dot" style={{ background: phase.tone }} />
              {phase.text}
            </span>
          }
        >
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="grid grid-2">
              {data.miami.map((g) => (
                <GroupCard key={g.grp} g={g} codesActive={data.codes.active} />
              ))}
            </div>
            <div className="sub">
              {reserved > 0 && data.codes.active
                ? `${reserved} spots across both groups are held for access-code holders${data.event.reserved_until ? ` until ${dateTime(data.event.reserved_until)}` : ""}. `
                : ""}
              {data.event.closes_at ? `Registration closes ${dateTime(data.event.closes_at)}.` : ""}
            </div>
          </div>
        </Card>
      )}

      <Card title="Registrations by program">
        {data.byCamp.length === 0 ? (
          <EmptyState title="No registrations yet">Paid registrations appear here as soon as Stripe confirms the payment.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Session / group</th>
                  <th className="num">Registrations</th>
                </tr>
              </thead>
              <tbody>
                {data.byCamp.map((row) => (
                  <tr key={`${row.camp}-${row.session}`} style={{ cursor: "default" }}>
                    <td>{row.camp}</td>
                    <td>{row.session}</td>
                    <td className="num">{row.registrations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.totals.legacy_payments > 0 && (
          <div className="pager">
            {data.totals.legacy_payments} payment(s) came through the old site checkout. They're saved in the database with their Stripe details.
          </div>
        )}
      </Card>
    </>
  );
}
