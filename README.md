# Footy Up registration platform

The back end and admin dashboard for Footy Up's registrations: the database,
the serverless API behind camp checkout, the Miami combine checkout and the
private training form, the Stripe webhook, and the dashboard where Alex and
Chris view registrations. The public pages are built by Ivy Devs and call this
API. See [`docs/api-contract.md`](docs/api-contract.md).

Requirements come from the Developer Brief, with the client's **Kickoff
Information Form (Oct 18, 2026)** taking priority where they differ.

## Status

| Piece | Status |
| --- | --- |
| Database for all three stages, Row Level Security (only the two admins can read) | Done, tested |
| **D1** Stripe webhook: signature check, no duplicates, refunds, expired checkouts, old-checkout payments kept | Done, tested |
| **D2** Camp checkout: camps as data, several kids and weeks per payment, info-only camps, optional capacity | Done, tested |
| **D3** Miami checkout: Kickoff Form fields, boys/girls caps enforced in the database, holds, access code, 200 shared reserved spots, opens Nov 1 10:00 AM, closes Mar 1 | Done, tested |
| **D4** Private training form endpoint: validation, spam blocking, rate limits, email notification | Done, tested |
| Admin dashboard at `/admin` (Kickoff Form: "login access to view the registrations" on Nov 1): overview, registrations with filters/detail/CSV, training requests, waitlist | Done, tested |
| Waitlist sign-up, waiver versioning with "not collected" flag | Done, tested |
| Stage 2 (contact import, campaign email, editing camps in the dashboard), Stage 3 | Not started |

The client-facing test list is [`docs/stage-1-checklist.md`](docs/stage-1-checklist.md).
Open questions and dates are in [`docs/open-decisions.md`](docs/open-decisions.md).

## Run it locally

Requires Node 22, pnpm 10 and Postgres 15+.

```bash
pnpm install
cp .env.example .env          # local Postgres, mock Stripe, dev admin login
pnpm db:reset                 # local only: schema + data/*.json
pnpm admin:build              # builds the dashboard into public/admin
pnpm dev                      # http://localhost:4319  (dashboard: /admin/)
pnpm admins add you@example.com   # local admin for the dev login
pnpm demo:data                # optional: fake families through the real checkout
```

`data/miami.json` opens registration on Nov 1, 2026 10:00 AM. To try Miami
checkout locally before then, clear the opening times:
`psql "$DATABASE_URL" -c "update miami_event set opens_at = null, public_opens_at = null"`.

With `PAYMENTS_MODE=mock`, checkout goes to a local fake Stripe page with **Pay**
and **Abandon** buttons that send correctly signed webhooks. Locally, the
dashboard uses a dev login (email only). On Vercel it requires Supabase Auth.

```bash
pnpm test            # throwaway database "footyup_test", 59 acceptance tests
pnpm typecheck       # API + dashboard
pnpm licenses:check  # every package must be MIT/Apache/BSD/ISC (Build Agreement §4)
```

## Running it day to day

Settings change without a deploy. These scripts use `DIRECT_DATABASE_URL` (or `DATABASE_URL`).

```bash
pnpm camps:upsert                       # load data/camps.json
pnpm miami config                       # load data/miami.json (caps, reserved spots, price, dates, phases)
pnpm miami status                       # spots left per group, whether a code is required
pnpm miami code add <code> --label "Host families" [--ends-at <ISO time>]
pnpm miami code off                     # turn codes off
pnpm waiver add --flow miami --title "Participant waiver" --file waiver.txt
pnpm settings set notify_email '"alex@example.com"'
pnpm admins add <email>                 # invite a dashboard admin
pnpm admins list | remove <email>
```

The real Miami access code is never committed or stored in plain text. Ivy Devs sets it with
`pnpm miami code add`, and only its hash is saved.

## How the important parts work

- **No child data in Stripe.** Starting a checkout saves the form as a pending
  intent; Stripe only gets its id. The webhook turns it into registrations and
  clears the pending copy.
- **Caps can't be oversold.** `reserve_miami()` locks both group rows, counts paid
  registrations plus unexpired holds, and inserts the hold in one transaction.
  Holds outlive the Stripe session by 5 minutes and stop counting on their own.
- **Phases.** Before `public_opens_at` only code holders can check out. After it,
  everyone can, and the code (optional) unlocks the reserved spots. Checkout closes at `closes_at`.
- **Reserved spots.** One pool across both groups (`reserved_total`, 200 per the
  Kickoff Form) and/or per group. They apply while a code is active and before `reserved_until`.
- **Webhooks apply exactly once.** The Stripe event id is stored in the same transaction as its effects.
- **Dashboard reads go through Row Level Security.** The API checks the Supabase
  login, then runs every query as role `authenticated` with that user's id, so the
  table policies (admin_users membership) decide what's visible.

## Environment variables

Names only. Values go in Vercel project settings, never in the repo.

| Name | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Vercel | Supabase transaction pooler URL (port 6543) |
| `DIRECT_DATABASE_URL` | scripts | Direct Supabase URL for migrations and admin scripts |
| `PUBLIC_SITE_URL` | Vercel | Public site origin for Stripe redirects, e.g. `https://footyupp.net` |
| `STRIPE_SECRET_KEY` | Vercel | Stripe secret key (test mode until launch approval) |
| `STRIPE_WEBHOOK_SECRET` | Vercel | Signing secret of the `/api/stripe/webhook` endpoint |
| `SUPABASE_URL` | Vercel + scripts | Supabase project URL (admin login) |
| `SUPABASE_ANON_KEY` | Vercel | Supabase publishable/anon key (safe in the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts only | Inviting admins. **Never on Vercel.** |
| `PUBLIC_ADMIN_URL` | scripts | Where invite links land, e.g. `https://<api domain>/admin/` |
| `CORS_ALLOWED_ORIGINS` | Vercel | Site domains allowed to call the API from the browser |
| `BREVO_API_KEY` | Vercel | Email. Without it, emails are logged (subject only), not sent |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | Vercel | Sender (must be verified in Brevo) |
| `CRON_SECRET` | Vercel | Auth for `/api/cron/cleanup` |
| `RATE_LIMIT_SALT` | Vercel | Salt for hashing IPs in rate-limit keys |
| `TURNSTILE_SECRET_KEY` | Vercel, optional | CAPTCHA on the training form |
| `PAYMENTS_MODE` | local only | `mock`; refused in production |

## Going live (client accounts)

Everything runs in the client's **FootyUP** accounts (Kickoff Form, Section A).
The recommended setup for Nov 1 is this repo as its own Vercel project (API +
`/admin`), with the existing site's pages calling it. The live site and its
current `api/checkout.js` stay untouched until Ivy Devs switches the pages over.

1. **Supabase** (FootyUP org, Pro): create the project, then run `pnpm db:migrate`
   with `DIRECT_DATABASE_URL`, and `pnpm camps:upsert` and `pnpm miami config`.
   In Auth settings: turn **off** "Allow new users to sign up", set the Site URL to
   `https://<api domain>/admin/` and add it to the redirect URLs. Point backups at the Pro plan's daily backups.
2. **Vercel** (FootyUP team, Pro): import the repo as a project. `vercel.json`
   already sets the build (`pnpm build`), output (`public`) and the daily cleanup cron.
   Add the environment variables above.
3. **Stripe** (client account, test mode first): add a webhook endpoint at
   `https://<api domain>/api/stripe/webhook` for `checkout.session.completed`,
   `checkout.session.expired`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` and `charge.refunded`. Keep bank-debit methods off.
4. **Admins:** `pnpm admins add alexdimitrirapo@gmail.com` and Chris's email. Each gets an
   invite email to choose a password.
5. **Brevo:** create an API key and verified sender, set `BREVO_API_KEY`, `EMAIL_FROM`, and
   `pnpm settings set notify_email '"..."'`. Send the SPF/DKIM/DMARC records to whoever
   controls the footyupp.net DNS.
6. **Access code:** Ivy Devs runs `pnpm miami code add <code> --label "Host families"`.
7. Run [`docs/stage-1-checklist.md`](docs/stage-1-checklist.md) on test mode, then swap to live Stripe keys.

To merge into the site repo instead, copy `api/`, `src/`, `admin/`, `supabase/`, `scripts/`,
`data/` and `tests/`, merge `package.json` and `vercel.json`, and align the `stripe` version (this code targets v23).

## Layout

```
api/                  Vercel functions (Web Request/Response); api/admin/[view].ts serves the dashboard API
admin/                Dashboard (React + Tailwind v4, ReUI/shadcn + Magic UI components; built into public/admin)
src/contract.ts       Request/response schemas shared with the front end
src/handlers/         Endpoint logic
src/lib/              Database, Stripe gateway (+ mock), email, admin auth, guards, settings
supabase/migrations/  Schema, functions, RLS
supabase/local/       Local-only stand-in for Supabase auth (never applied to Supabase)
scripts/              Dev server, migrations, admin CLIs, demo data, dashboard build
data/                 Camp and Miami configuration
docs/                 API contract, Stage 1 checklist, open decisions, handoff
tests/                Acceptance tests against a real Postgres
```
