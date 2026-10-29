# Connecting footyupp.net (repo `rapobuild`) to the platform

The live site keeps its pages. Only its `api/*.js` functions change: each one
forwards the request it receives, unchanged, to this platform's
`/api/site/<action>` and passes the answer back. Everything families submit
then lands in Supabase and shows in the dashboard. The spot limits, prices,
closing times and access codes set in the dashboard become what the site
enforces.

The change is one commit:
[`0001-Send-registrations-to-the-Footy-Up-platform-when-PLA.patch`](0001-Send-registrations-to-the-Footy-Up-platform-when-PLA.patch).
Nothing about it is live until `PLATFORM_API_URL` is set on the site's Vercel
project, and removing that variable is the rollback.

## What goes where

| Site form | Site function | Platform endpoint | Dashboard |
| --- | --- | --- | --- |
| Camp registration (all camps) | `api/checkout.js` | `POST /api/site/checkout` | Registrations, Rosters, Revenue |
| Miami combine registration | `api/checkout.js` | `POST /api/site/checkout` | Registrations (Miami), Rosters, Revenue |
| Miami access-code gate | `api/camp-access.js` | `GET/POST /api/site/camp-access` | Settings → Miami, Access codes |
| Private training "Buy" buttons | `api/checkout-training.js` | `POST /api/site/checkout-training` | Training → Packages bought, Revenue |
| Private training inquiry | `api/inquiry.js` | `POST /api/site/inquiry` | Training → Inquiries, Contacts |
| Prices on the pages | `api/catalog.js` (new) | `GET /api/site/catalog` | Settings → Camps, Miami |

Every family who registers or asks about training also becomes a contact for email.

The platform matches camps by the site's own ids (`arlington_catholic_2027`,
`watertown_2027`, …) and session values (`full`, `summer`, `elite`, `week1`,
`week2`, `boys`, `girls`). `data/camps.json` and `data/miami.json` mirror the
site's `api/_camps.js` as of Oct 29, 2026. Watertown's "Both weeks" becomes two
registrations (week 1 and week 2) on one payment.

## What families notice

- **Camp checkout** asks for a phone number on the Stripe page, because the
  site's camp form doesn't collect one and Alex and Chris need it on rosters.
- **Miami checkout** asks for an emergency phone and a short size on the
  Stripe page. The site's form doesn't have those fields; the Developer Brief requires them.
- **Promo codes** still work the same way: Stripe's "Add promotion code" box,
  with codes made in the Stripe dashboard. Discounts show in Revenue. The
  dashboard's own promo codes (Settings → Discounts) are for front ends that send `promoCode`.
- Prices on the pages follow the dashboard, so a price change in Settings
  shows on the site within about a minute and is what Stripe charges.

## Switching over

Ivy Devs does steps 1–3 and 7 (production access); the developer does the rest on test mode first.

1. **Deploy the platform** as its own Vercel project (see the main README).
   Set `PUBLIC_SITE_URL=https://footyupp.net`, so Stripe returns families to the
   site's `/success` and `/cancel?camp=…` pages, and set `SITE_API_KEY` to a long random value.
2. **Point Stripe's webhook at the platform**: `https://<platform domain>/api/stripe/webhook`
   with the events listed in the main README. The site has no webhook today, so
   this changes nothing for families. From then on, payments made through the
   site's *current* checkout are also saved to the dashboard (the webhook reads
   the details the site already puts in Stripe metadata).
3. **Import earlier payments** with `pnpm stripe:backfill --since 2026-09-01`
   (lists what it finds), then the same with `--apply`. Running it again changes nothing.
4. **Re-enter the Miami access code** in Dashboard → Settings → Access codes.
   The site keeps only a hash of it, so it can't be copied over.
5. **Check the catalog** in Dashboard → Settings → Camps and Miami against the
   site (prices, ages, closing times, spot limits).
6. **Apply the patch** to the site repo on a branch and open a Vercel preview:

   ```bash
   cd rapobuild
   git checkout -b platform-integration
   git am /path/to/0001-Send-registrations-to-the-Footy-Up-platform-when-PLA.patch
   ```

   On the preview, set `PLATFORM_API_URL=https://<platform preview domain>` and
   the same `SITE_API_KEY`, then run [`docs/stage-1-checklist.md`](../../docs/stage-1-checklist.md)
   with Stripe test cards. Every test registration should appear in the dashboard.
7. **Go live:** merge, then set `PLATFORM_API_URL` and `SITE_API_KEY` on the
   site's production project and redeploy. Only do this after the client signs off Stage 1.

**Rollback:** delete `PLATFORM_API_URL` from the site's project and redeploy.
The original checkout code runs again. The Stripe webhook keeps saving its payments to the dashboard.

## Keeping the two in step

- **New camp:** add it to the site's `src/camps.jsx` (the page and display text) and
  in Dashboard → Settings → Camps with the **same camp id** and **session ids**.
  The site's `api/_camps.js` is no longer used once the switch is made.
- **Price or date change:** change it in the dashboard. The pages update their
  prices from `/api/catalog`. Words on the page (e.g. "Nov 1 – Feb 1" under the Miami
  prices) are still in `src/camps.jsx`.
- `SHOW_MIAMI` in `src/camps.jsx` still controls whether the site shows Miami at all.
