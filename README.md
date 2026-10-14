# Footy Up registration backend

The backend for the Footy Up registration platform: the database, the Vercel
serverless functions behind checkout and the site forms, the Stripe webhook,
and admin scripts. The public pages are built separately (by Ivy Devs) and call
these endpoints. See [`docs/api-contract.md`](docs/api-contract.md).

Built to drop into the existing React + Vite site on Vercel. The new endpoints
use their own paths, so the live `api/checkout.js` keeps working untouched until
the pages are switched over.

## What's here

| Deliverable | Status |
| --- | --- |
| Schema for all three stages (camps, sessions, Miami settings, access codes, holds, payments, registrations, waitlists, waivers, promo codes, contacts, email log) | Done, in `supabase/migrations/` |
| Row Level Security, default-deny, two-admin model | Done and tested |
| **D1** Stripe webhook: signature check, idempotent saving, refunds, expired sessions, legacy sessions | Done and tested |
| **D2** Camp checkout: camps/sessions as data, several kids and sessions per payment, info-only camps, optional capacity, early-bird price | Done and tested |
| **D3** Miami checkout: server-side access code, 200/200 caps enforced atomically, holds released on expiry, reserved allotment, configurable prices and dates | Done and tested |
| **D4** Private training endpoint: validation, honeypot, rate limiting, optional Turnstile, email notification | Done and tested |
| Waitlist sign-up (saving only; notifying the next family is D9) | Done and tested |
| Waiver versioning and "not collected" flag (D13 groundwork) | Done and tested |
| Admin dashboard (D5), contact import (D6), campaigns (D7), Stage 3 features | Not started |

## Run it locally

Requires Node 22, pnpm 10 and any Postgres 15+.

```bash
pnpm install
cp .env.example .env           # defaults: local Postgres + mock payments
pnpm db:reset                  # local only: creates schema and loads data/*.json
pnpm dev                       # http://localhost:4319
```

With `PAYMENTS_MODE=mock`, checkouts redirect to a local fake Stripe page with
**Pay** and **Abandon** buttons. Those send correctly signed webhook events, so
the whole flow runs without Stripe keys. To use Stripe test mode instead, set
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` and remove `PAYMENTS_MODE`, then forward
events with `stripe listen --forward-to localhost:4319/api/stripe/webhook`.

```bash
pnpm test        # creates a throwaway database "footyup_test" and runs the acceptance tests
pnpm typecheck
```

Tests connect as `postgres://footy:footy@localhost:5432/postgres` by default.
Override with `TEST_ADMIN_DATABASE_URL`.

## Running the system (no deploys needed)

Until the Stage 2 dashboard exists, these scripts are the documented way to
change things. They use `DIRECT_DATABASE_URL` (or `DATABASE_URL`) from `.env`.

```bash
pnpm camps:upsert                         # load data/camps.json (add/edit camps and sessions)
pnpm miami config                         # load data/miami.json (caps, reserved spots, prices, dates)
pnpm miami status                         # spots left per group, gate state
pnpm miami code add <code> --label "Host families" [--ends-at 2026-11-08T00:00:00-05:00]
pnpm miami code end-at <ISO time>         # codes stop working then; checkout opens to the public
pnpm miami code off                       # open to the public now
pnpm waiver add --flow miami --title "Participant waiver" --file waiver.txt
pnpm settings list
pnpm settings set notify_email '"owner@example.com"'
```

Every pending client decision and when it's needed:
[`docs/open-decisions.md`](docs/open-decisions.md).

## How the important parts work

- **No child data in Stripe.** Starting a checkout saves the form as a pending
  `checkout_intent` and sends Stripe only its id. The webhook turns it into
  registrations, then clears the stored form data.
- **Caps can't be oversold.** `reserve_miami()` locks the group row, counts paid
  registrations plus unexpired holds, and inserts a hold in one transaction.
  Spots left = cap − paid − active holds. Holds outlive the Stripe session by
  5 minutes, so a payment can never land after its hold lapsed. Expired holds stop
  counting on their own, even if the expiry webhook is late.
- **Webhooks apply exactly once.** The Stripe event id is recorded in the same
  transaction as its effects. Registrations are also unique per checkout line.
- **Access codes** are stored as SHA-256 hashes and compared on the server.
  Checkout requires a code while any active, unexpired code exists.
- **Reserved spots** for code holders apply only while the gate is on. The public
  can't take them; code holders past the allotment draw from the general pool.

## Environment variables

Names only. Set values in Vercel project settings, never in the repo.

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Supabase transaction pooler URL (port 6543) |
| `DIRECT_DATABASE_URL` | scripts | Direct Supabase URL for migrations and admin scripts |
| `PUBLIC_SITE_URL` | yes | Site origin for Stripe redirects, e.g. `https://footyupp.net` |
| `STRIPE_SECRET_KEY` | yes (prod) | Stripe secret key (test mode until launch approval) |
| `STRIPE_WEBHOOK_SECRET` | yes (prod) | Signing secret of the `/api/stripe/webhook` endpoint |
| `PAYMENTS_MODE` | no | `mock` for local only; refused when `VERCEL_ENV=production` |
| `BREVO_API_KEY` | for email | Without it, emails are logged (subject only), not sent |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | no | Sender for notifications |
| `TURNSTILE_SECRET_KEY` | no | Turns on CAPTCHA for the private training form |
| `CRON_SECRET` | yes (prod) | Vercel cron auth for `/api/cron/cleanup` |
| `RATE_LIMIT_SALT` | yes (prod) | Salt for hashing client IPs in rate-limit keys |

## Deploying into the existing site

1. Copy `api/`, `src/`, `supabase/`, `scripts/`, `data/` into the site repo. Merge
   `dependencies` and the `crons` entry from `vercel.json`. The site already uses
   `stripe`, so check its version: this code targets `stripe@23`.
2. Create the Supabase project (Pro). Run `supabase link` and `supabase db push`, or
   `pnpm db:migrate` with `DIRECT_DATABASE_URL`. Then load `pnpm camps:upsert` and `pnpm miami config`.
3. In the Stripe dashboard (test mode), add a webhook endpoint at
   `https://<deployment>/api/stripe/webhook` for `checkout.session.completed`,
   `checkout.session.expired`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` and `charge.refunded`.
4. Set the environment variables above on Vercel (Preview first).
5. Point the pages at the new endpoints. Leave `api/checkout.js` live until the new
   flow passes acceptance; payments it creates are still recorded by the webhook.

## Layout

```
api/                  Vercel functions (thin wrappers, Web Request/Response)
src/contract.ts       Request/response schemas shared with the front end
src/handlers/         Endpoint logic
src/lib/              Database, Stripe gateway (+ mock), email, guards, settings
src/admin/            Config loaders used by the scripts
supabase/migrations/  Schema, functions, RLS
supabase/local/       Local-only stand-in for Supabase auth (never applied to Supabase)
scripts/              Dev server, migrations, admin CLIs
data/                 Camp and Miami configuration (placeholders marked TBC)
tests/                Acceptance tests against a real Postgres
```
