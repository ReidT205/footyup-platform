# API contract (draft for sign-off)

How the public pages (built by Ivy Devs) talk to the backend (this repo). The
brief asks for this to be agreed in the first two days. TypeScript types and
validation for every shape below live in [`src/contract.ts`](../src/contract.ts);
the front end can copy that file to get the same types.

**Status: DRAFT v0.1.** Anything here can change until both sides sign off.
After that, changes are additive only (new optional fields), or agreed in writing.

## Conventions

- All endpoints are same-origin under `/api` on the Vercel project. Bodies are JSON.
- Money is integer **cents** (USD). Dates are `YYYY-MM-DD`; times are ISO 8601.
- Successful checkouts return `{ checkoutUrl, expiresAt }`. The page redirects
  the browser to `checkoutUrl` (Stripe Checkout). The parent's spot is held until `expiresAt`.
- Errors always look like this:

```json
{ "error": "group_full", "message": "This group is full. You can join the waitlist.", "details": { "group": "boys" } }
```

  `error` is a stable code to branch on; `message` is safe to show a parent;
  `details` is optional. Validation errors list each bad field:
  `details.issues = [{ "path": "players.0.age", "message": "..." }]`.

| HTTP | `error` codes |
| --- | --- |
| 400 | `validation_failed`, `invalid_json`, `captcha_failed` |
| 403 | `access_code_required`, `access_code_invalid` |
| 404 | `session_not_found`, `not_found` |
| 409 | `session_closed`, `session_full`, `camp_info_only`, `group_full`, `group_closed`, `registration_not_open` |
| 413 | `payload_too_large` |
| 422 | `waiver_required` (with `details.currentWaiverId`) |
| 429 | `rate_limited` (with a `Retry-After` header) |
| 502 | `payment_provider_error` (Stripe unavailable; safe to retry) |
| 503 | `pricing_not_configured` (Miami price not set yet) |
| 500 | `internal_error` |

## Camps (D2)

### `GET /api/camps`

Active camps (Miami excluded) and their sessions, plus the current camp waiver.

```json
{
  "camps": [
    {
      "id": "uuid", "slug": "arlington-catholic", "name": "Arlington Catholic Summer Camp",
      "host": "Arlington Catholic High School", "kind": "summer", "infoOnly": false,
      "description": null, "infoUrl": null,
      "sessions": [
        {
          "id": "uuid", "slug": "week-of-july-12", "name": "Week of July 12 (ages 6-13)",
          "startsOn": "2027-07-12", "endsOn": "2027-07-16", "startTime": "09:00",
          "location": "Arlington Catholic High School", "ageMin": 6, "ageMax": 13,
          "priceCents": 50000, "regularPriceCents": 50000, "earlyBirdUntil": null,
          "status": "open", "spotsLeft": null, "infoText": "..."
        }
      ]
    },
    { "slug": "bbn", "infoOnly": true, "sessions": [], "...": "..." }
  ],
  "waiver": null,
  "waiverRequired": false
}
```

- `infoOnly: true` means the page shows info only, with no checkout.
- `status` is `open`, `closed` or `full`. A `full` session should offer the waitlist.
- `spotsLeft` is `null` when the session has no capacity limit.
- `priceCents` already includes any early-bird price that is active today.

### `POST /api/checkout/camp`

Several children and several sessions in one payment. Each child lists the
sessions they attend.

```json
{
  "parent": { "name": "Jamie Rivera", "email": "jamie@example.com", "phone": "617-555-0142", "town": "Brookline" },
  "players": [
    { "name": "Alex Rivera", "age": 10, "sex": "boy", "sessionIds": ["<week 1 id>", "<week 2 id>"], "extra": { "shirtSize": "YM" } },
    { "name": "Sam Rivera", "age": 15, "sessionIds": ["<week 2 id>"] }
  ],
  "waiver": { "waiverId": "<waiver.id from GET /api/camps>", "acceptedName": "Jamie Rivera" },
  "marketingOptIn": true,
  "extra": { "hearAboutUs": "Friend" },
  "successPath": "/camps/thanks",
  "cancelPath": "/camps/arlington-catholic"
}
```

- `extra` (per child and per form) stores any field the existing form collects that
  isn't modelled above, so the form can change without a backend change. Keys are
  up to 64 characters and there are at most 30 per object.
- `waiver` is optional until a camp waiver is published and `camp_waiver_required` is on.
- `successPath` and `cancelPath` must be paths on this site. Stripe appends `?session_id=...` to the success URL.

Returns `200 { "checkoutUrl": "...", "expiresAt": "..." }`.

## Miami combine (D3)

### `GET /api/miami`

```json
{
  "event": { "name": "...", "startsOn": null, "endsOn": null, "location": null, "infoText": null, "opensAt": null, "open": true },
  "accessCodeRequired": true,
  "clothingSizes": ["YL", "S", "M", "L", "XL"],
  "waiver": { "id": "uuid", "version": 1, "title": "...", "body": "...", "url": null },
  "waiverRequired": true,
  "groups": [
    { "group": "boys", "label": "Boys", "priceCents": 157500, "spotsLeft": 143, "full": false, "open": true },
    { "group": "girls", "label": "Girls", "priceCents": 157500, "spotsLeft": 0, "full": true, "open": true }
  ]
}
```

- `accessCodeRequired` flips to `false` when the client turns off the code or its end date passes. The page should then hide the code field.
- `full: true` means the page should offer the waitlist instead of checkout.
- An empty `clothingSizes` means free text is accepted.
- This response is cached at the edge for 5 seconds. The checkout itself always re-checks capacity.

### `POST /api/miami/verify-code`

Optional step so the page can confirm a code and show code-holder pricing before the form.
The request is `{ "accessCode": "..." }`. It returns `200 { "valid": true, "groups": [...] }` or
`403 access_code_invalid`, and allows 10 attempts per 10 minutes per IP.

### `POST /api/miami/checkout`

```json
{
  "accessCode": "only while accessCodeRequired is true",
  "parent": { "name": "...", "email": "...", "phone": "...", "town": "..." },
  "players": [
    {
      "name": "Player Name", "age": 16, "sex": "girl",
      "heightIn": 66, "weightLb": 130, "email": "player@example.com", "clothingSize": "M",
      "shippingAddress": { "line1": "1 Main St", "line2": "Apt 2", "city": "Miami", "state": "FL", "postalCode": "33156" }
    }
  ],
  "waiver": { "waiverId": "...", "acceptedName": "..." },
  "marketingOptIn": false,
  "successPath": "/miami/thanks",
  "cancelPath": "/miami"
}
```

- `sex` sets the group (`boy` → boys, `girl` → girls). 1–4 players per checkout.
- Height is in **inches** and weight in **pounds** (whole numbers). The page can collect feet+inches and convert.
- The code is checked on the server only, ignoring case and spaces.
- Possible errors: `403 access_code_required | access_code_invalid`, `409 group_full`
  (`details.group`), `409 registration_not_open` (`details.opensAt`), `503 pricing_not_configured`, `422 waiver_required`.

## Forms

### `POST /api/private-training` (D4)

```json
{
  "parentName": "...", "email": "...", "phone": "...", "town": "...",
  "playerName": "...", "playerAge": 12,
  "message": "optional", "preferredTimes": "optional",
  "marketingOptIn": false,
  "website": "",
  "turnstileToken": "only if Turnstile is enabled"
}
```

- `website` is a honeypot. Render it as a visually hidden input that humans leave empty.
- Returns `201 { "ok": true }`. The endpoint allows 5 submissions per hour per IP.

### `POST /api/waitlist`

Send exactly one of `sessionId` or `miamiGroup`:

```json
{ "sessionId": "uuid", "parentName": "...", "email": "...", "phone": "...", "town": "...", "spots": 1, "marketingOptIn": false, "website": "" }
```

Returns `201 { "ok": true }`.

## Not called by the pages

- `POST /api/stripe/webhook`: Stripe only. It verifies the signature and needs the raw body.
- `GET /api/cron/cleanup`: Vercel Cron only. It requires `Authorization: Bearer $CRON_SECRET`.
