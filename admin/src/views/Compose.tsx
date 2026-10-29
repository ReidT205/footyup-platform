import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangleIcon, CheckCircle2Icon, MailIcon, MonitorIcon, SearchIcon, SendIcon, SmartphoneIcon, UsersIcon } from "lucide-react"

import type { Api } from "../api"
import type { AudienceSummary, EmailOptions, Segment } from "../types"
import { useLoad } from "../useLoad"
import { FIRST_NAME_TOKEN, renderCampaign } from "../../../src/email/templates"
import { ConfirmDialog, Field, PillTabs } from "@/components/app/kit"
import { ErrorState, PageHeader } from "@/components/app/states"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox, Notice, Switch, Textarea } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { Navigate } from "./Analytics"

const DRAFT_KEY = "footyup-email-draft"
const SOURCES: { value: Segment["sources"][number]; label: string }[] = [
  { value: "registration", label: "Registered families" },
  { value: "imported", label: "Imported list" },
  { value: "private_training", label: "Private training" },
  { value: "waitlist", label: "Waitlist" },
]

interface Draft { subject: string; preheader: string; heading: string; body: string }
const emptyDraft: Draft = { subject: "", preheader: "", heading: "", body: "" }

function toggle<T>(list: T[], v: T) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

export function Compose({ api, onExpired, refreshKey, navigate }: { api: Api; onExpired: () => void; refreshKey: number; navigate: Navigate }) {
  const load = useCallback(() => api<EmailOptions>("email-options"), [api])
  const { data: options, error, reload } = useLoad(load, onExpired, refreshKey)

  const [segment, setSegment] = useState<Segment>({ programs: [], towns: [], sources: [], includeUnknownConsent: false })
  const [draft, setDraft] = useState<Draft>(() => {
    try { return { ...emptyDraft, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") } } catch { return emptyDraft }
  })
  const [audience, setAudience] = useState<AudienceSummary | null>(null)
  const [counting, setCounting] = useState(false)
  const [townSearch, setTownSearch] = useState("")
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState<"test" | "send" | null>(null)
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const requestId = useRef(crypto.randomUUID())
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [draft])

  useEffect(() => {
    setCounting(true)
    const t = setTimeout(() => {
      api<AudienceSummary>("email-audience", segment).then(setAudience, () => setAudience(null)).finally(() => setCounting(false))
    }, 250)
    return () => clearTimeout(t)
  }, [api, segment])

  const preview = useMemo(() => {
    const rendered = renderCampaign({
      subject: draft.subject || "Your subject",
      body: draft.body || "Your message appears here.",
      preheader: draft.preheader,
      heading: draft.heading || undefined,
      mailingAddress: options?.brand.mailingAddress ?? "Your mailing address (add it in Settings → Email)",
      logoUrl: options?.brand.logoUrl,
      unsubscribeUrl: "#unsubscribe",
    })
    return rendered.html.replaceAll(FIRST_NAME_TOKEN, "Jamie")
  }, [draft, options])

  const ready = draft.subject.trim() && draft.body.trim()
  const missingAddress = options && !options.brand.mailingAddress
  const notConnected = options?.mode === "none"

  async function sendTest() {
    setBusy("test")
    setResult(null)
    try {
      const res = await api<{ to: string }>("email-test", { subject: draft.subject, preheader: draft.preheader || undefined, heading: draft.heading || undefined, body: draft.body })
      setResult({ tone: "success", text: `Test sent to ${res.to}. Check your inbox (and spam folder the first time).` })
    } catch (err) {
      setResult({ tone: "error", text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function send() {
    setBusy("send")
    setResult(null)
    try {
      const res = await api<{ recipients: number; duplicate: boolean }>("email-send", {
        requestId: requestId.current,
        segment,
        draft: { subject: draft.subject, preheader: draft.preheader || undefined, heading: draft.heading || undefined, body: draft.body },
      })
      setConfirm(false)
      setResult({ tone: "success", text: `${res.duplicate ? "Already sent" : "Sent"} to ${res.recipients} ${res.recipients === 1 ? "person" : "people"}. It's in Email history.` })
      requestId.current = crypto.randomUUID()
      setDraft(emptyDraft)
    } catch (err) {
      setConfirm(false)
      setResult({ tone: "error", text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  function insertFirstName() {
    const el = bodyRef.current
    const at = el?.selectionStart ?? draft.body.length
    setDraft({ ...draft, body: draft.body.slice(0, at) + FIRST_NAME_TOKEN + draft.body.slice(at) })
  }

  if (error && !options) return <Card><ErrorState message={error} onRetry={reload} /></Card>
  const towns = (options?.towns ?? []).filter((t) => !townSearch || t.town.toLowerCase().includes(townSearch.toLowerCase()))
  const ex = audience?.excluded

  return (
    <div className="space-y-6">
      <PageHeader title="Send email" description="Pick who it goes to, write it, send yourself a test, then send. Every email includes an unsubscribe link and your mailing address." />
      {notConnected && <Notice tone="warning" icon={AlertTriangleIcon} title="Brevo isn't connected yet">Sending needs the Brevo API key on the server. See Settings → Email for the steps.</Notice>}
      {missingAddress && (
        <Notice tone="warning" icon={AlertTriangleIcon} title="Add your mailing address first">
          The law requires it in every marketing email. <button className="underline underline-offset-2" onClick={() => navigate("settings", { section: "email" })}>Add it in Settings → Email</button>.
        </Notice>
      )}
      {options?.mode === "mock" && <Notice tone="info" icon={MailIcon}>Local test mode: emails are captured, not delivered. Open <a className="underline" href="/__mock/outbox" target="_blank" rel="noreferrer">the test outbox</a> to see them.</Notice>}
      {result && <Notice tone={result.tone} icon={result.tone === "success" ? CheckCircle2Icon : AlertTriangleIcon}>{result.text}</Notice>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Who gets it</CardTitle>
              <CardDescription>Leave everything unticked to email everyone. Within a section it's "any of"; across sections it's "and".</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!options ? <Skeleton className="h-40" /> : (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Registered for</p>
                    <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border p-3">
                      {options.miami && (
                        <div className="space-y-1.5">
                          <p className="text-muted-foreground text-xs font-medium">{options.miami.name}</p>
                          {(["boys", "girls"] as const).map((g) => (
                            <label key={g} className="flex items-center gap-2 text-sm"><Checkbox checked={segment.programs.includes(`miami:${g}`)} onCheckedChange={() => setSegment({ ...segment, programs: toggle(segment.programs, `miami:${g}`) })} />Miami – {g === "boys" ? "Boys" : "Girls"}</label>
                          ))}
                        </div>
                      )}
                      {options.camps.map((c) => (
                        <div key={c.id} className="space-y-1.5">
                          <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={segment.programs.includes(`camp:${c.id}`)} onCheckedChange={() => setSegment({ ...segment, programs: toggle(segment.programs, `camp:${c.id}`) })} />{c.name} <span className="text-muted-foreground font-normal">(all sessions)</span></label>
                          {c.sessions.map((s) => (
                            <label key={s.id} className="ml-6 flex items-center gap-2 text-sm"><Checkbox checked={segment.programs.includes(`session:${s.id}`)} onCheckedChange={() => setSegment({ ...segment, programs: toggle(segment.programs, `session:${s.id}`) })} />{s.name}</label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">In town</p>
                    <div className="relative">
                      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                      <Input className="h-8 pl-8 text-sm" placeholder="Find a town" value={townSearch} onChange={(e) => setTownSearch(e.target.value)} />
                    </div>
                    <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border p-3">
                      {towns.length === 0 ? <p className="text-muted-foreground text-xs">No towns yet. Towns come from registrations and imported contacts.</p> : towns.map((t) => (
                        <label key={t.town} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2"><Checkbox checked={segment.towns.includes(t.town)} onCheckedChange={() => setSegment({ ...segment, towns: toggle(segment.towns, t.town) })} />{t.town}</span>
                          <span className="text-muted-foreground text-xs tabular-nums">{t.contacts}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">How they joined</p>
                    <div className="flex flex-wrap gap-2">
                      {SOURCES.map((s) => (
                        <button key={s.value} onClick={() => setSegment({ ...segment, sources: toggle(segment.sources, s.value) })} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", segment.sources.includes(s.value) ? "border-brand bg-brand-soft text-brand-strong" : "hover:bg-muted")}>{s.label}</button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <span className="text-sm"><span className="font-medium">Include contacts with unknown consent</span><span className="text-muted-foreground block text-xs">Off by default. Only turn on once you've confirmed how these people agreed to hear from Footy Up.</span></span>
                    <Switch checked={segment.includeUnknownConsent} onCheckedChange={(v) => setSegment({ ...segment, includeUnknownConsent: v })} />
                  </label>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-b from-brand-soft/60 to-card">
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="bg-brand-soft text-brand-strong flex size-10 items-center justify-center rounded-xl"><UsersIcon className="size-5" /></span>
                <div>
                  <p className="text-3xl leading-none font-semibold tabular-nums">{audience ? <NumberTicker key={audience.sendable} value={audience.sendable} stiffness={320} damping={42} /> : "—"}</p>
                  <p className="text-muted-foreground text-sm">{counting ? "Counting…" : "will receive this email"}</p>
                </div>
              </div>
              {ex && (ex.unsubscribed + ex.bounced + ex.denied + ex.unknown > 0) && (
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground text-xs font-medium">Left out ({audience!.matched - audience!.sendable} of {audience!.matched})</p>
                  {ex.unsubscribed > 0 && <p className="flex justify-between"><span>Unsubscribed</span><span className="tabular-nums">{ex.unsubscribed}</span></p>}
                  {ex.unknown > 0 && <p className="flex justify-between"><span>Consent unknown</span><span className="tabular-nums">{ex.unknown}</span></p>}
                  {ex.denied > 0 && <p className="flex justify-between"><span>Said no to emails</span><span className="tabular-nums">{ex.denied}</span></p>}
                  {ex.bounced > 0 && <p className="flex justify-between"><span>Email bounced</span><span className="tabular-nums">{ex.bounced}</span></p>}
                </div>
              )}
              {audience && audience.sample.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {audience.sample.map((s) => <Badge key={s.email} variant="outline" className="font-normal">{s.name ?? s.email}</Badge>)}
                  {audience.sendable > audience.sample.length && <Badge variant="secondary" className="font-normal">+{audience.sendable - audience.sample.length} more</Badge>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Write it</CardTitle>
              <CardDescription>Uses the Footy Up campaign template.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Subject" hint={`Tip: ${FIRST_NAME_TOKEN} adds the person's first name.`}>
                <Input value={draft.subject} maxLength={150} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="Summer camp registration is open" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Preview text (optional)" hint="Shown next to the subject in the inbox.">
                  <Input value={draft.preheader} maxLength={150} onChange={(e) => setDraft({ ...draft, preheader: e.target.value })} />
                </Field>
                <Field label="Heading (optional)">
                  <Input value={draft.heading} maxLength={120} onChange={(e) => setDraft({ ...draft, heading: e.target.value })} />
                </Field>
              </div>
              <Field label={<span className="flex w-full items-center justify-between">Message <button type="button" className="text-brand-strong text-xs font-medium" onClick={insertFirstName}>+ Insert first name</button></span>} hint="Blank line = new paragraph · start lines with - for bullets · **bold** · paste links as-is">
                <Textarea ref={bodyRef} rows={12} className="min-h-56 font-[inherit]" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder={"Hi {{first_name}},\n\nRegistration for summer camp is now open..."} />
              </Field>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                <Button variant="ghost" onClick={() => setDraft(emptyDraft)} disabled={!draft.body && !draft.subject}>Clear</Button>
                <Button variant="outline" onClick={sendTest} disabled={!ready || busy !== null || notConnected || Boolean(missingAddress)}><MailIcon /> {busy === "test" ? "Sending test…" : "Send me a test"}</Button>
                <Button onClick={() => setConfirm(true)} disabled={!ready || !audience?.sendable || busy !== null || notConnected || Boolean(missingAddress)}><SendIcon /> Send to {audience?.sendable ?? 0}</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <p className="text-sm font-medium">Preview</p>
              <PillTabs id="device" value={device} onChange={setDevice} options={[{ value: "desktop", label: <span className="flex items-center gap-1.5"><MonitorIcon className="size-3.5" />Desktop</span> }, { value: "mobile", label: <span className="flex items-center gap-1.5"><SmartphoneIcon className="size-3.5" />Phone</span> }]} />
            </div>
            <div className="bg-muted/40 flex justify-center p-4">
              <iframe title="Email preview" sandbox="" srcDoc={preview} className={cn("h-[640px] rounded-lg border bg-white shadow-sm transition-all", device === "desktop" ? "w-full" : "w-[375px]")} />
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Send to ${audience?.sendable ?? 0} people?`}
        description="This sends right away and can't be undone."
        confirmLabel={busy === "send" ? "Sending…" : "Send now"}
        busy={busy === "send"}
        onConfirm={send}
      >
        <div className="bg-muted/50 space-y-1 rounded-lg p-3 text-sm">
          <p><span className="text-muted-foreground">Subject:</span> {draft.subject.replaceAll(FIRST_NAME_TOKEN, "Jamie")}</p>
          <p><span className="text-muted-foreground">From:</span> {options?.sender.name} &lt;{options?.sender.email}&gt;</p>
          {ex && <p><span className="text-muted-foreground">Left out:</span> {ex.unsubscribed} unsubscribed, {ex.unknown} unknown consent, {ex.bounced + ex.denied} other</p>}
        </div>
      </ConfirmDialog>
    </div>
  )
}
