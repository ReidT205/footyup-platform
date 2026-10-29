import { useCallback, useEffect, useState } from "react"
import { ArrowLeftIcon, CalendarDaysIcon, ClipboardCheckIcon, MapPinIcon, PrinterIcon, UsersIcon } from "lucide-react"

import type { Api } from "../api"
import { downloadCsv, stamp } from "../csv"
import { dateRange } from "../format"
import { useLoad } from "../useLoad"
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states"
import { ProgramDot } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface RosterSummary { id?: string; grp?: string; camp: string; session: string; starts_on: string | null; ends_on: string | null; location: string | null; players: number }
interface RosterData {
  header: { camp: string; session: string; starts_on: string | null; ends_on: string | null; start_time: string | null; location: string | null }
  players: { id: string; player_name: string; player_age: number; parent_name: string; parent_phone: string; emergency_phone: string | null; waiver_status: string; payment_status: string }[]
}

function lastFirst(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}` : name
}

function RosterSheet({ api, onExpired, target, onBack }: { api: Api; onExpired: () => void; target: RosterSummary; onBack: () => void }) {
  const query = target.id ? `session=${target.id}` : `group=${target.grp}`
  const load = useCallback(() => api<RosterData>(`roster?${query}`), [api, query])
  const { data, error, loading, reload } = useLoad(load, onExpired)
  const miami = Boolean(target.grp)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" onClick={onBack}><ArrowLeftIcon /> All rosters</Button>
        <div className="flex gap-2">
          {data && (
            <Button variant="outline" onClick={() => downloadCsv(`roster-${target.session.replace(/\W+/g, "-")}-${stamp()}.csv`, [
              { header: "Player", value: (p: RosterData["players"][number]) => lastFirst(p.player_name) }, { header: "Age", value: (p) => p.player_age },
              { header: "Parent", value: (p) => p.parent_name }, { header: "Phone", value: (p) => p.parent_phone }, ...(miami ? [{ header: "Emergency phone", value: (p: RosterData["players"][number]) => p.emergency_phone }] : []),
              { header: "Waiver", value: (p) => p.waiver_status }, { header: "Payment", value: (p) => p.payment_status }, { header: "Checked in", value: () => "" }, { header: "Notes", value: () => "" },
            ], data.players)}>Download CSV</Button>
          )}
          <Button onClick={() => window.print()} disabled={!data}><PrinterIcon /> Print roster</Button>
        </div>
      </div>
      {loading && !data ? <Card><TableSkeleton /></Card> : error && !data ? <Card><ErrorState message={error} onRetry={reload} /></Card> : data ? (
        <Card className="roster-print gap-0 py-0 print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b p-6 print:px-0 print:pt-0">
            <div>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Roster · check-in sheet</p>
              <h2 className="mt-1 text-xl font-semibold">{data.header.camp}</h2>
              <p className="text-base">{data.header.session}</p>
              <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 text-sm">
                <span className="inline-flex items-center gap-1"><CalendarDaysIcon className="size-3.5" />{dateRange(data.header.starts_on, data.header.ends_on)}</span>
                {data.header.location && <span className="inline-flex items-center gap-1"><MapPinIcon className="size-3.5" />{data.header.location}</span>}
              </p>
            </div>
            <div className="text-right"><p className="text-3xl font-semibold tabular-nums">{data.players.length}</p><p className="text-muted-foreground text-xs">players</p></div>
          </div>
          {data.players.length === 0 ? <EmptyState icon={UsersIcon} title="No players registered yet" /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="w-10 px-3 py-2.5 pl-6 font-medium print:pl-0">#</th>
                  <th className="px-3 py-2.5 font-medium">Player</th>
                  <th className="px-3 py-2.5 font-medium">Age</th>
                  <th className="px-3 py-2.5 font-medium">Parent</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 font-medium">Waiver</th>
                  <th className="px-3 py-2.5 font-medium">Payment</th>
                  <th className="w-16 px-3 py-2.5 text-center font-medium">In</th>
                  <th className="w-40 px-3 py-2.5 pr-6 font-medium print:pr-0">Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p, i) => (
                  <tr key={p.id} className="border-b last:border-0 break-inside-avoid">
                    <td className="text-muted-foreground px-3 py-2.5 pl-6 tabular-nums print:pl-0">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium">{lastFirst(p.player_name)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.player_age}</td>
                    <td className="px-3 py-2.5">{p.parent_name}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{p.parent_phone}{miami && p.emergency_phone && <div className="text-muted-foreground text-xs">Emerg. {p.emergency_phone}</div>}</td>
                    <td className="px-3 py-2.5">{p.waiver_status === "accepted" ? "Signed" : <span className="font-medium text-amber-700">Missing</span>}</td>
                    <td className="px-3 py-2.5">{p.payment_status === "paid" ? "Paid" : p.payment_status === "partially_refunded" ? "Part refund" : "Refunded"}</td>
                    <td className="px-3 py-2.5 text-center"><span className="inline-block size-5 rounded border-2 border-zinc-400" aria-label="Check-in box" /></td>
                    <td className="px-3 py-2.5 pr-6 print:pr-0"><span className="block h-5 border-b border-zinc-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-muted-foreground border-t px-6 py-3 text-xs print:px-0">Printed {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Heights, weights and home addresses are never printed on rosters.</p>
        </Card>
      ) : null}
    </div>
  )
}

export function Rosters({ api, onExpired, refreshKey }: { api: Api; onExpired: () => void; refreshKey: number }) {
  const load = useCallback(() => api<{ sessions: RosterSummary[]; groups: RosterSummary[] }>("rosters"), [api])
  const { data, error, loading, reload } = useLoad(load, onExpired, refreshKey)
  const [target, setTarget] = useState<RosterSummary | null>(null)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [target])

  if (target) return <RosterSheet api={api} onExpired={onExpired} target={target} onBack={() => setTarget(null)} />
  const all = [...(data?.groups ?? []).map((g) => ({ ...g, session: g.session })), ...(data?.sessions ?? [])]
  return (
    <div className="space-y-6">
      <PageHeader title="Rosters" description="Printable check-in sheets for coaches, one per session and Miami group." />
      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : error && !data ? <Card><ErrorState message={error} onRetry={reload} /></Card> : all.length === 0 ? (
        <Card><EmptyState icon={ClipboardCheckIcon} title="No sessions yet">Add camps and sessions in Settings.</EmptyState></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {all.map((r) => {
            const program = r.grp ? `Miami – ${r.session}` : `${r.camp} – ${r.session}`
            return (
              <button key={r.id ?? r.grp} onClick={() => setTarget(r)} className="bg-card hover:border-foreground/15 group flex flex-col gap-3 rounded-xl border p-5 text-left shadow-xs transition-all hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-muted-foreground flex items-center gap-1.5 truncate text-xs"><ProgramDot program={program} />{r.camp}</p>
                    <p className="mt-1 font-medium">{r.session}</p>
                  </div>
                  <span className="bg-muted rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums">{r.players}</span>
                </div>
                <p className="text-muted-foreground flex items-center gap-1 text-xs"><CalendarDaysIcon className="size-3.5" />{dateRange(r.starts_on, r.ends_on)}</p>
                <span className="text-brand-strong mt-auto inline-flex items-center gap-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100"><PrinterIcon className="size-3.5" /> Open roster</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
