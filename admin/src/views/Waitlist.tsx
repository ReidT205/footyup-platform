import { useCallback } from "react"
import { DownloadIcon, HourglassIcon } from "lucide-react"

import type { Api } from "../api"
import { downloadCsv, stamp, type Column } from "../csv"
import { dateTime } from "../format"
import { programOf, type WaitlistEntry } from "../types"
import { useLoad } from "../useLoad"
import { EmptyState, ErrorState, NameAvatar, PageHeader, TableSkeleton } from "@/components/app/states"
import { ProgramDot, StatusBadge } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const CSV: Column<WaitlistEntry>[] = [
  { header: "Joined", value: (r) => r.created_at },
  { header: "Program", value: (r) => programOf(r) },
  { header: "Parent", value: (r) => r.parent_name },
  { header: "Email", value: (r) => r.email },
  { header: "Phone", value: (r) => r.phone },
  { header: "Town", value: (r) => r.town },
  { header: "Spots", value: (r) => r.spots },
  { header: "Status", value: (r) => r.status },
]

export function Waitlist({ api, onExpired, refreshKey }: { api: Api; onExpired: () => void; refreshKey: number }) {
  const load = useCallback(() => api<{ waitlist: WaitlistEntry[] }>("waitlist"), [api])
  const { data, error, loading, reload } = useLoad(load, onExpired, refreshKey)
  const rows = data?.waitlist ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Waitlist"
        description="Families who asked for a spot after a session or Miami group filled, in the order they joined."
        actions={
          <Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv(`footyup-waitlist-${stamp()}.csv`, CSV, rows)}>
            <DownloadIcon /> Export CSV
          </Button>
        }
      />
      <Card className="gap-0 overflow-hidden py-0">
        {loading && !data ? (
          <TableSkeleton rows={4} />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState icon={HourglassIcon} title="Nobody is waiting">
            When a session or Miami group fills, families can join the waitlist and appear here in order.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12">#</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Program</TableHead>
                <TableHead className="hidden md:table-cell">Town</TableHead>
                <TableHead className="hidden sm:table-cell">Joined</TableHead>
                <TableHead className="text-right">Spots</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <NameAvatar name={r.parent_name} />
                      <div>
                        <p className="font-medium">{r.parent_name}</p>
                        <p className="text-muted-foreground text-xs">{r.email} · {r.phone}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2"><ProgramDot program={programOf(r)} />{programOf(r)}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{r.town}</TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">{dateTime(r.created_at)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.spots}</TableCell>
                  <TableCell><StatusBadge value={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
