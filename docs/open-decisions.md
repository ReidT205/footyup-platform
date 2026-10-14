# Open decisions and access tracker

Every undecided item from the brief is a setting, so none of them blocks the
build. What each one *does* block is going live. This table shows where each
setting lives, how to change it, and the date it's actually needed by.

## Client decisions

| Item | Built as | How to change | Placeholder now | Needed by |
| --- | --- | --- | --- | --- |
| Miami price(s) | `miami_groups.price_code_holder_cents` / `price_public_cents`, per group | `data/miami.json` → `pnpm miami config` | $1,575 code holders / $1,300 public | **Nov 1** go-live. Checkout returns `pricing_not_configured` if unset, so it can't go live by accident. Placeholder is fine for Oct 28 testing. |
| Miami dates, location, wording | `miami_event` | `data/miami.json` → `pnpm miami config` | empty | Nov 1. Display only. |
| Registration opening time | `miami_event.opens_at` | same | not set (open) | Nov 1. Set it so checkout opens itself on time. |
| Access code | `access_codes` (hashed) | `pnpm miami code add <code>` | none | **Nov 1**, can be set the same day. With no code, Miami is public. Turn the gate on before launch. |
| Code removal date | `access_codes.ends_at` | `pnpm miami code end-at <time>` or `code off` | — | Whenever the client decides. No deploy. |
| Reserved spots per group | `miami_groups.reserved_for_code_holders` (+ optional `reserved_until`) | `data/miami.json` | 0 | Nov 1. 0 means no reservation. |
| Caps | `miami_groups.cap` | `data/miami.json` | 200 / 200 | Confirmed already. |
| Clothing sizes | `miami_event.clothing_sizes` | `data/miami.json` | free text | Nov 1 (otherwise any text is accepted). |
| Waiver wording | `waivers` (versioned, immutable) | `pnpm waiver add --flow miami ...` | none | Optional for Nov 1. Without it, registrations are stored as `waiver_status = not_collected`, as the brief requires. |
| Arlington Catholic week ↔ price | per-session `price_cents` | `data/camps.json` → `pnpm camps:upsert` | week 1 = 6–13/$500, week 2 = 14–18/$750 | Before AC registration opens. |
| Watertown, Dover, other camps | rows in `camps` / `sessions` | `data/camps.json` | Watertown hidden | Any time. |
| Private training notify address | setting `notify_email` | `pnpm settings set notify_email '"x@y.com"'` | none (no email sent) | **Oct 28**, so D4 can be tested. |
| Private training fields | `PrivateTrainingRequest` + `extra` | contract change | brief's list | Oct 28 (lock with the contract). |
| Existing camp form fields | `CampPlayer` + `extra` | contract change | brief's list + `extra` | **First two days**. Needs the repo. |
| Consent of imported contacts | `contacts.consent` (`unknown` by default) | Stage 2 import | `unknown` | Stage 2, before the first campaign. |
| Mailing address (email footer) | setting `mailing_address` | `pnpm settings set ...` | none | Stage 2, before the first campaign. |
| Logo, colors, fonts | email templates | Stage 3 | — | Stage 3 (D15). The confirmation template is needed with D8. |
| Contact list (Word doc) | `contacts` import | Stage 2 | — | Stage 2 (D6). |
| Two admin emails | `admin_users` | Stage 2 | — | Stage 2 (D5). |
| Waitlist hold length, reminder timing, discounts | config values | Stage 3 | 48h / 7d+1d / — | Stage 3. |

## Access the developer needs

| Access | Why | Needed by |
| --- | --- | --- |
| Repository (collaborator) | Wire these endpoints into the live site without breaking `api/checkout.js`; read the existing form fields | **Day 1** |
| Vercel project (member) | Env vars, preview/staging deploys, cron | **Day 1–2** (staging for Oct 28) |
| Stripe **dashboard** (test mode, Developer role or higher) | Create the webhook endpoint (`/api/stripe/webhook`) and its signing secret, run test payments and refunds, check payment-method settings | **Day 1–2** |
| Supabase project on **Pro**, client-owned, developer as member | Database for staging and production. Free projects pause when idle. | **Day 1–2** |
| Brevo account, client-owned | D4 sends a notification email in Stage 1, so a sending account is needed for Oct 28. Can use a verified single sender before DNS is set up. | **Oct 28** (transactional), paid plan before Stage 2 campaigns |
| DNS for footyupp.net | SPF, DKIM, DMARC for Brevo | Stage 2, before the first campaign |
| Live Stripe keys | Final launch checks only, after approval | Just before Nov 1 |

## Not blocked by anything

The schema for all three stages, the Stage 1 endpoints (D1–D4), Row Level
Security, the capacity and hold logic, the admin scripts, and the tests are
built and running locally against Postgres with a mock Stripe. See the
README.
