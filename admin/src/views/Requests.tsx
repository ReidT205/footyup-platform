import { useCallback, useMemo, useState } from "react"
import { ClockIcon, DownloadIcon, MailIcon, MapPinIcon, MessageSquareTextIcon, PhoneIcon, SearchIcon } from "lucide-react"

import type { Api } from "../api"
import { downloadCsv, stamp, type Column } from "../csv"
import { dateTime } from "../format"
import type { TrainingRequest } from "../types"
import { useLoad } from "../useLoad"
import { EmptyState, ErrorState, NameAvatar, PageHeader } from "@/components/app/states"
import { StatusBadge } from "@/components/app/status-badge"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"

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
]

export function Requests({ api, onExpired, refreshKey }: { api: Api; onExpired: () => void; refreshKey: number }) {
  const load = useCallback(() => api<{ requests: TrainingRequest[] }>("requests"), [api])
  const { data, error, loading, reload } = useLoad(load, onExpired, refreshKey)
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState<TrainingRequest | null>(null)

  const rows = data?.requests ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? rows.filter((r) => [r.parent_name, r.player_name, r.email, r.phone, r.town].some((v) => v.toLowerCase().includes(q))) : rows
  }, [rows, search])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Private training"
        description="Requests from the website form. Each one is also emailed to your notification address."
        actions={
          <Button variant="outline" disabled={!filtered.length} onClick={() => downloadCsv(`footyup-training-requests-${stamp()}.csv`, CSV, filtered)}>
            <DownloadIcon /> Export CSV
          </Button>
        }
      />
      <div className="relative max-w-md">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input className="bg-card pl-9" placeholder="Search name, email, phone or town" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search requests" />
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : error && !data ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={rows.length ? SearchIcon : MessageSquareTextIcon} title={rows.length ? "Nothing matches your search" : "No requests yet"}>
            {rows.length ? null : "New private training requests from the website show up here."}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r, i) => (
            <BlurFade key={r.id} delay={0.04 * Math.min(i, 8)} inView={false}>
              <button
                onClick={() => setOpen(r)}
                className="bg-card hover:border-foreground/15 focus-visible:ring-ring/50 flex h-full w-full flex-col gap-4 rounded-xl border p-5 text-left shadow-xs transition-all hover:shadow-md focus-visible:ring-[3px] focus-visible:outline-none"
              >
                <div className="flex w-full items-start gap-3">
                  <NameAvatar name={r.parent_name} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.parent_name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      For {r.player_name}, age {r.player_age}
                    </p>
                  </div>
                  <StatusBadge value={r.status} />
                </div>
                <p className="text-muted-foreground line-clamp-3 min-h-[3.75rem] text-sm">{r.message || "No message included."}</p>
                <div className="text-muted-foreground mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs">
                  <span className="flex items-center gap-1"><MapPinIcon className="size-3.5" />{r.town}</span>
                  {r.preferred_times && <span className="flex items-center gap-1"><ClockIcon className="size-3.5" />{r.preferred_times}</span>}
                  <span className="ml-auto">{dateTime(r.created_at).replace(/, \d{4}/, "")}</span>
                </div>
              </button>
            </BlurFade>
          ))}
        </div>
      )}

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
          {open && (
            <>
              <SheetHeader className="border-b p-6">
                <div className="flex items-center gap-3">
                  <NameAvatar name={open.parent_name} className="size-11 text-sm" />
                  <div>
                    <SheetTitle>{open.parent_name}</SheetTitle>
                    <SheetDescription>Received {dateTime(open.created_at)}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="space-y-6 p-6">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-muted-foreground text-xs">Player</dt><dd>{open.player_name} (age {open.player_age})</dd></div>
                  <div><dt className="text-muted-foreground text-xs">Town</dt><dd>{open.town}</dd></div>
                  <div><dt className="text-muted-foreground text-xs">Phone</dt><dd>{open.phone}</dd></div>
                  <div className="min-w-0"><dt className="text-muted-foreground text-xs">Email</dt><dd className="break-words">{open.email}</dd></div>
                  <div className="col-span-2"><dt className="text-muted-foreground text-xs">Preferred times</dt><dd>{open.preferred_times || "—"}</dd></div>
                </dl>
                <div>
                  <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Message</p>
                  <p className="bg-muted/50 rounded-lg border p-4 text-sm whitespace-pre-wrap">{open.message || "No message included."}</p>
                </div>
                <div className="flex gap-2">
                  <Button asChild className="flex-1"><a href={`mailto:${open.email}?subject=${encodeURIComponent("Footy Up private training")}`}><MailIcon /> Reply by email</a></Button>
                  <Button asChild variant="outline"><a href={`tel:${open.phone}`}><PhoneIcon /> Call</a></Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
