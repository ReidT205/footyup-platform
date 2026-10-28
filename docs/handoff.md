# Handoff

What the Build Agreement (§10) and the Brief (D16) ask for at handoff. Sections
marked *Stage 2/3* get filled in as those stages ship.

## Services

All accounts belong to Ivy Devs or the client (Agreement §8).

| Service | Used for | Owner |
| --- | --- | --- |
| Vercel | Hosting, serverless functions in `api/`, daily cleanup cron | Ivy Devs / client |
| Supabase | Postgres database, Row Level Security, admin login (Stage 2), backups | Ivy Devs / client |
| Stripe | Checkout, webhooks, refunds | Client |
| Brevo | Notification, transactional and campaign email | Ivy Devs / client |
| Cloudflare Turnstile (optional) | CAPTCHA on the private training form | Ivy Devs / client |

## Secret names

Values live only in Vercel project settings (and a local `.env` with test values).
Never in the repo.

| Name | Where it comes from |
| --- | --- |
| `DATABASE_URL` | Supabase → Connect → transaction pooler (port 6543) |
| `DIRECT_DATABASE_URL` | Supabase → Connect → direct connection (scripts only) |
| `PUBLIC_SITE_URL` | The site's origin |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → the `/api/stripe/webhook` endpoint |
| `BREVO_API_KEY` | Brevo → SMTP & API → API keys |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | Chosen sender (must be verified in Brevo) |
| `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile (optional) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase → Project Settings → API (URL and publishable/anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (secret key). Scripts only, never on Vercel |
| `PUBLIC_ADMIN_URL` | The deployed dashboard URL, e.g. `https://<api domain>/admin/` |
| `CORS_ALLOWED_ORIGINS` | The public site's domains, comma-separated |
| `CRON_SECRET` | Any long random string; Vercel sends it to cron routes |
| `RATE_LIMIT_SALT` | Any long random string |

## Packages

All permissive licenses, as the Agreement (§4) requires. Check any time with
`pnpm licenses:check` (it covers transitive and dev packages too).

| Package | License | Used for |
| --- | --- | --- |
| `pg` | MIT | Postgres client |
| `stripe` | MIT | Stripe API and webhook signature checks |
| `zod` | MIT | Request validation |
| `typescript` (dev) | Apache-2.0 | Type checking |
| `tsx` (dev) | MIT | Running TypeScript scripts and tests |
| `react`, `react-dom` (dev, bundled) | MIT | Admin dashboard |
| `esbuild` (dev) | MIT | Bundling the admin dashboard |
| `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom` (dev) | MIT | Type definitions |

Tests use Node's built-in test runner, so no extra test framework is installed.

## How to

Viewing registrations, Miami spots, training requests and the waitlist happens in the dashboard at `/admin`.
Until Stage 2 adds editing to the dashboard, changes run from a terminal with `DIRECT_DATABASE_URL` set.

| Task | Command |
| --- | --- |
| Add or edit a camp or session | Edit `data/camps.json`, then `pnpm camps:upsert` |
| Change Miami caps, reserved spots, prices, dates | Edit `data/miami.json`, then `pnpm miami config` |
| Set the Miami access code | `pnpm miami code add <code> --label "Host families"` |
| Open Miami to the public on a date | `pnpm miami code end-at 2026-11-08T00:00:00-05:00` |
| Open Miami to the public now | `pnpm miami code off` |
| See spots left | `pnpm miami status` |
| Publish waiver wording | `pnpm waiver add --flow miami --title "..." --file waiver.txt` |
| Change who gets private training emails | `pnpm settings set notify_email '"owner@example.com"'` |
| Give someone dashboard access | `pnpm admins add <email>` (sends an invite) |
| Remove dashboard access | `pnpm admins remove <email>` |
| Export registrations | Dashboard → Registrations → filter → Export CSV |
| Import contacts | *Stage 2* |
| Send a campaign | *Stage 2* |
| Create a promo code | *Stage 3* |
| Print a roster | *Stage 3* |
| Restore a backup | Supabase → Database → Backups → choose a point in time → Restore (Pro plan). Restoring replaces the whole database, so export recent registrations first. |

## Handoff checklist (Agreement §10)

- [ ] All code committed to Ivy Devs' repo
- [ ] This document up to date (services, secret names, packages)
- [ ] `pnpm test` passes; acceptance checklist results shared
- [ ] Project files and credentials deleted from the developer's devices
- [ ] Anything in the developer's name transferred or deleted
- [ ] Written note to Ivy Devs confirming no access remains
