import { FIRST_NAME_TOKEN, UNSUBSCRIBE_TOKEN } from "./templates.js"

export interface CampaignRecipient {
  email: string
  firstName: string | null
  lastName: string | null
  town: string | null
  sources: string[]
  programs: string[]
}

export interface CampaignContent {
  name: string
  subject: string
  html: string
  text: string
  preheader?: string
  sender: { email: string; name: string }
  replyTo?: string | null
}

export interface DnsRecord {
  label: string
  type: string
  host: string
  value: string
  status: "verified" | "pending" | "unknown"
}

export interface ProviderStatus {
  connected: boolean
  account?: { email: string | null; company: string | null; plan: string | null; credits: number | null }
  senderVerified?: boolean | null
  domain?: { name: string; exists: boolean; authenticated: boolean; verified: boolean; records: DnsRecord[] } | null
  error?: string
}

export interface EmailProvider {
  readonly mode: "brevo" | "mock" | "none"
  /** Sends one campaign to exactly these recipients. Returns the provider's campaign id. */
  sendCampaign(content: CampaignContent, recipients: CampaignRecipient[]): Promise<{ campaignId: string }>
  sendTest(content: CampaignContent, to: string): Promise<void>
  /** Mirrors an unsubscribe made on our side into the provider's blocklist. */
  setBlocked(email: string, blocked: boolean): Promise<void>
  status(domain: string, sender: string): Promise<ProviderStatus>
  addDomain(domain: string): Promise<void>
  authenticateDomain(domain: string): Promise<void>
}

export class EmailNotConfigured extends Error {
  constructor() {
    super("Brevo isn't connected yet. Add BREVO_API_KEY to the server settings.")
    this.name = "EmailNotConfigured"
  }
}

/** Brevo's campaign personalisation syntax for our {{first_name}} token. */
const BREVO_FIRST_NAME = '{{ contact.FIRSTNAME | default : "there" }}'

export class BrevoProvider implements EmailProvider {
  readonly mode = "brevo" as const
  private folderId: number | null = null

  constructor(private readonly apiKey: string) {}

  private async call<T = any>(method: string, path: string, body?: unknown, allow: number[] = []): Promise<T> {
    const res = await fetch(`https://api.brevo.com/v3${path}`, {
      method,
      headers: { "api-key": this.apiKey, accept: "application/json", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok && !allow.includes(res.status)) {
      const detail = (await res.json().catch(() => ({}))) as { message?: string; code?: string }
      throw new Error(`Brevo ${method} ${path.split("?")[0]} failed (${res.status}${detail.code ? ` ${detail.code}` : ""}): ${detail.message ?? res.statusText}`)
    }
    if (res.status === 204) return undefined as T
    return (await res.json().catch(() => undefined)) as T
  }

  private personalise(text: string) {
    return text.replaceAll(FIRST_NAME_TOKEN, BREVO_FIRST_NAME)
  }

  private async ensureSetup() {
    for (const name of ["TOWN", "SOURCES", "PROGRAMS"]) {
      await this.call("POST", `/contacts/attributes/normal/${name}`, { type: "text" }, [400])
    }
    if (this.folderId) return this.folderId
    const { folders = [] } = await this.call<{ folders?: { id: number; name: string }[] }>("GET", "/contacts/folders?limit=50&offset=0")
    const existing = folders.find((f) => f.name === "Footy Up sends")
    this.folderId = existing?.id ?? (await this.call<{ id: number }>("POST", "/contacts/folders", { name: "Footy Up sends" })).id
    return this.folderId
  }

  private async waitForImport(processId: number) {
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const p = await this.call<{ status: string }>("GET", `/processes/${processId}`)
      if (p.status === "completed") return
      if (p.status === "failed") throw new Error("Brevo contact import failed")
      await new Promise((r) => setTimeout(r, 1500))
    }
    throw new Error("Brevo contact import is taking too long; try again in a minute")
  }

  async sendCampaign(content: CampaignContent, recipients: CampaignRecipient[]) {
    const folderId = await this.ensureSetup()
    const list = await this.call<{ id: number }>("POST", "/contacts/lists", { name: content.name.slice(0, 120), folderId })
    for (let i = 0; i < recipients.length; i += 5000) {
      const chunk = recipients.slice(i, i + 5000)
      const { processId } = await this.call<{ processId: number }>("POST", "/contacts/import", {
        jsonBody: chunk.map((r) => ({
          email: r.email,
          attributes: {
            FIRSTNAME: r.firstName ?? "",
            LASTNAME: r.lastName ?? "",
            TOWN: r.town ?? "",
            SOURCES: r.sources.join(", "),
            PROGRAMS: r.programs.join(", ").slice(0, 900),
          },
        })),
        listIds: [list.id],
        updateExistingContacts: true,
        emptyContactsAttributes: false,
        disableNotification: true,
      })
      await this.waitForImport(processId)
    }
    const campaign = await this.call<{ id: number }>("POST", "/emailCampaigns", {
      name: content.name.slice(0, 240),
      subject: this.personalise(content.subject),
      previewText: content.preheader,
      sender: content.sender,
      ...(content.replyTo ? { replyTo: content.replyTo } : {}),
      htmlContent: this.personalise(content.html),
      recipients: { listIds: [list.id] },
    })
    await this.call("POST", `/emailCampaigns/${campaign.id}/sendNow`)
    return { campaignId: String(campaign.id) }
  }

  async sendTest(content: CampaignContent, to: string) {
    await this.call("POST", "/contacts", { email: to, updateEnabled: true }, [400])
    const campaign = await this.call<{ id: number }>("POST", "/emailCampaigns", {
      name: `[Test] ${content.name}`.slice(0, 240),
      subject: `[Test] ${this.personalise(content.subject)}`,
      previewText: content.preheader,
      sender: content.sender,
      ...(content.replyTo ? { replyTo: content.replyTo } : {}),
      htmlContent: this.personalise(content.html),
    })
    await this.call("POST", `/emailCampaigns/${campaign.id}/sendTest`, { emailTo: [to] })
  }

  async setBlocked(email: string, blocked: boolean) {
    const res = await this.call("PUT", `/contacts/${encodeURIComponent(email)}`, { emailBlacklisted: blocked }, [404])
    if (res === undefined && blocked) {
      await this.call("POST", "/contacts", { email, emailBlacklisted: true, updateEnabled: true }, [400])
    }
  }

  async status(domain: string, sender: string): Promise<ProviderStatus> {
    try {
      const account = await this.call<{ email?: string; companyName?: string; plan?: { type: string; credits?: number }[] }>("GET", "/account")
      const senders = await this.call<{ senders?: { email: string; active: boolean }[] }>("GET", "/senders")
      const found = await this.call<any>("GET", `/senders/domains/${encodeURIComponent(domain)}`, undefined, [404])
      const records: DnsRecord[] = []
      const raw = (found?.dns_records ?? {}) as Record<string, { type?: string; value?: string; host_name?: string; status?: boolean }>
      const labels: Record<string, string> = { brevo_code: "Brevo verification", dkim_record: "DKIM", dkim1Record: "DKIM 1", dkim2Record: "DKIM 2", dmarc_record: "DMARC", spf_record: "SPF" }
      for (const [key, r] of Object.entries(raw)) {
        if (!r?.value) continue
        records.push({ label: labels[key] ?? key, type: r.type ?? "TXT", host: r.host_name ?? "@", value: r.value, status: r.status ? "verified" : "pending" })
      }
      const plan = account.plan?.find((p) => p.type !== "free") ?? account.plan?.[0]
      return {
        connected: true,
        account: { email: account.email ?? null, company: account.companyName ?? null, plan: plan?.type ?? null, credits: plan?.credits ?? null },
        senderVerified: senders.senders?.some((s) => s.email.toLowerCase() === sender.toLowerCase() && s.active) ?? null,
        domain: found
          ? { name: domain, exists: true, authenticated: Boolean(found.authenticated), verified: Boolean(found.verified), records }
          : { name: domain, exists: false, authenticated: false, verified: false, records: [] },
      }
    } catch (err) {
      return { connected: false, error: (err as Error).message }
    }
  }

  async addDomain(domain: string) {
    await this.call("POST", "/senders/domains", { name: domain }, [400])
  }

  async authenticateDomain(domain: string) {
    await this.call("PUT", `/senders/domains/${encodeURIComponent(domain)}/authenticate`)
  }
}

export interface MockSend {
  kind: "campaign" | "test"
  campaignId: string
  content: CampaignContent
  /** Per-recipient HTML with personalisation and unsubscribe links filled in. */
  messages: { to: string; subject: string; html: string }[]
}

/**
 * Local and test stand-in for Brevo. Fills in personalisation and swaps the
 * unsubscribe placeholder for our own signed link, so the full unsubscribe
 * loop works without a Brevo account. Never used on Vercel.
 */
export class MockEmailProvider implements EmailProvider {
  readonly mode = "mock" as const
  readonly sends: MockSend[] = []
  readonly blocked = new Set<string>()
  failNext = false
  private seq = 0

  constructor(private readonly unsubscribeLink: (email: string) => string) {}

  private render(content: CampaignContent, r: { email: string; firstName: string | null }) {
    const fill = (s: string) => s.replaceAll(FIRST_NAME_TOKEN, r.firstName || "there").replaceAll(UNSUBSCRIBE_TOKEN, this.unsubscribeLink(r.email))
    return { to: r.email, subject: fill(content.subject), html: fill(content.html) }
  }

  async sendCampaign(content: CampaignContent, recipients: CampaignRecipient[]) {
    if (this.failNext) {
      this.failNext = false
      throw new Error("Mock email provider failure")
    }
    const campaignId = `mock-${++this.seq}`
    this.sends.unshift({ kind: "campaign", campaignId, content, messages: recipients.filter((r) => !this.blocked.has(r.email)).map((r) => this.render(content, r)) })
    return { campaignId }
  }

  async sendTest(content: CampaignContent, to: string) {
    this.sends.unshift({ kind: "test", campaignId: `mock-test-${++this.seq}`, content, messages: [this.render({ ...content, subject: `[Test] ${content.subject}` }, { email: to, firstName: null })] })
  }

  async setBlocked(email: string, blocked: boolean) {
    if (blocked) this.blocked.add(email)
    else this.blocked.delete(email)
  }

  async status(domain: string): Promise<ProviderStatus> {
    return {
      connected: true,
      account: { email: null, company: "Local test mode", plan: "mock", credits: null },
      senderVerified: true,
      domain: {
        name: domain,
        exists: true,
        authenticated: false,
        verified: false,
        records: [
          { label: "Brevo verification", type: "TXT", host: "@", value: "brevo-code:<from Brevo>", status: "unknown" },
          { label: "DKIM", type: "TXT", host: "mail._domainkey", value: "<from Brevo>", status: "unknown" },
          { label: "DMARC", type: "TXT", host: "_dmarc", value: "v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com", status: "unknown" },
        ],
      },
    }
  }

  async addDomain() {}
  async authenticateDomain() {}
}

export class NoEmailProvider implements EmailProvider {
  readonly mode = "none" as const
  async sendCampaign(): Promise<never> {
    throw new EmailNotConfigured()
  }
  async sendTest(): Promise<never> {
    throw new EmailNotConfigured()
  }
  async setBlocked() {}
  async status(): Promise<ProviderStatus> {
    return { connected: false, error: "BREVO_API_KEY is not set on the server." }
  }
  async addDomain(): Promise<never> {
    throw new EmailNotConfigured()
  }
  async authenticateDomain(): Promise<never> {
    throw new EmailNotConfigured()
  }
}
