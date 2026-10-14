# Open decisions, access and dates

Matches the signed Build Agreement (Oct 13, 2026). Every undecided item is a
setting, so none of them blocks the build. What each one blocks is going live.

## Key dates (Agreement §2)

| Date | What happens |
| --- | --- |
| Fri, Oct 16 | Agreement signed, wire details sent |
| Sat, Oct 17 | Kickoff: all access given, first $500, start committing to Ivy Devs' repo daily |
| Mon, Oct 19 | Fake sample of the contact list arrives |
| Fri, Oct 23 | Client mailing address and waiver wording arrive |
| Mon, Oct 26 | Logo and brand assets arrive |
| Oct 28 – Nov 8 | Be reachable, reply within 12 hours |
| Sat, Oct 31 | Everything finished (all three stages) with handoff |
| Sun, Nov 1 | Stage 1 done and tested; Miami registration opens |

If Ivy Devs is late with access or info and you tell them within a day, your
dates move by the same amount (§2). Tell them about any blocker within a day (§11).

## Client decisions

| Item | Built as | How to change | Value now | Needed by |
| --- | --- | --- | --- | --- |
| Miami price(s) | `miami_groups.price_code_holder_cents` / `price_public_cents`, per group | `data/miami.json` → `pnpm miami config` | test values $1,575 / $1,300 | Nov 1. Checkout returns `pricing_not_configured` if unset. |
| Miami dates, location, wording | `miami_event` | same | empty | Nov 1 (display only) |
| Registration opening time | `miami_event.opens_at` | same | not set (open) | Nov 1 |
| Access code | `access_codes` (hashed) | `pnpm miami code add <code>` | test code only | **Never given to the developer (§4).** Ivy Devs adds the real code with the same command. |
| Code removal date | `access_codes.ends_at` | `pnpm miami code end-at <time>` or `code off` | — | Whenever the client decides. No deploy. |
| Reserved spots per group | `miami_groups.reserved_for_code_holders` (+ optional `reserved_until`) | `data/miami.json` | 0 | Nov 1 |
| Caps | `miami_groups.cap` | `data/miami.json` | 200 / 200 | Confirmed |
| Clothing sizes | `miami_event.clothing_sizes` | `data/miami.json` | free text | Nov 1 |
| Waiver wording | `waivers` (versioned, immutable) | `pnpm waiver add ...` | none | Arrives Oct 23. Until then registrations are stored as `waiver_status = not_collected`. |
| Arlington Catholic week ↔ price | per-session `price_cents` | `data/camps.json` → `pnpm camps:upsert` | week 1 = 6–13/$500, week 2 = 14–18/$750 | Before AC registration opens |
| Watertown, Dover, other camps | rows in `camps` / `sessions` | `data/camps.json` | Watertown hidden | Any time |
| Private training notify address | setting `notify_email` | `pnpm settings set notify_email '"x@y.com"'` | none (no email sent) | Before Stage 1 testing |
| Existing camp form fields | `CampPlayer` + `extra` | contract change | brief's list + `extra` | In the existing code (§11). Read on Oct 17 and lock the contract in the first two days. |
| Consent of imported contacts | `contacts.consent` (`unknown` by default) | Stage 2 import | `unknown` | Stage 2 |
| Mailing address (email footer) | setting `mailing_address` | `pnpm settings set ...` | none | Arrives Oct 23 |
| Logo, colors, fonts | email templates | Stage 3 | — | Arrives Oct 26 |
| Contact list | `contacts` import | Stage 2 | — | Fake sample Oct 19. **Ivy Devs runs the real import (§11).** |
| Two admin emails | `admin_users` | Stage 2 | — | Stage 2 |
| Waitlist hold length, reminder timing, discounts | config values | Stage 3 | 48h / 7d+1d / — | Stage 3 |

## Access (Agreement §8)

The developer gets development access only, all on Sat, Oct 17:

| Access | Used for |
| --- | --- |
| Ivy Devs' repo | All code. Commit daily; keep no private copies after the job. |
| Staging (Vercel) | Preview deploys, env vars for staging, cron |
| Supabase **dev** project | Migrations and testing with fake data |
| Stripe **Sandbox** | Its own dashboard: create the `/api/stripe/webhook` endpoint and signing secret, run test payments and refunds |
| Brevo **test** account | Private training notifications (Stage 1) and campaign/transactional email work |

Not given, by design: production or live access, live Stripe keys, production
database keys, domain or DNS logins. **Ivy Devs deploys to production and adds
DNS records themselves.** The developer sends them the exact SPF, DKIM and DMARC
records from Brevo's domain-authentication screen (Stage 2). They won't switch the
live checkout until Stage 1 passes testing.

## Who to ask (Agreement §11)

Viraj first, Ishan as backup. Send updates at least twice a week. Note: the
reply time ("[4 business hours]") and update frequency ("[twice a week]") are
still bracketed placeholders in the signed copy.
