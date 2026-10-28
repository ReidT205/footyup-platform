# Open decisions, access and dates

Sources, in priority order: the client's **Kickoff Information Form** (Alex Rapo,
Oct 18, 2026), the signed Build Agreement (Oct 13), and the Developer Brief.
Every undecided item is a setting, so none blocks the build.

## Dates

| Date | What happens | Source |
| --- | --- | --- |
| Wed, Oct 28 | Stage 1 Checklist sent to the client (commitment) | Kickoff Form |
| Fri, Oct 30 | Stage 1 finished (target) | Kickoff Form |
| Sat, Oct 31 | Everything finished with handoff | Build Agreement |
| **Sun, Nov 1, 10:00 AM ET** | Miami registration opens; Alex and Chris can log in to view registrations (commitment) | Kickoff Form |
| Fri, Nov 13 | Stage 2 target (dashboard, contact import, email sending) | Kickoff Form |
| Fri, Nov 27 | Stage 3 target and written handoff guide | Kickoff Form |
| Mon, Mar 1, 2027 | Miami registration closes | Kickoff Form |

The Build Agreement (developer ↔ Ivy Devs) says everything by Oct 31. The
Kickoff Form (Ivy Devs ↔ client) gives Nov 13 / Nov 27 targets. Confirm with
Viraj which dates bind the developer.

## Decided by the Kickoff Form (now in `data/`)

| Item | Value | Where |
| --- | --- | --- |
| Miami price | $1,500 for everyone (public and host-school families) | `data/miami.json` |
| Boys dates | May 21–23, 2027, 4:30–8:30 PM | `data/miami.json` |
| Girls dates | May 24–26, 2027, 4:30–8:30 PM | `data/miami.json` |
| Opens to everyone | Nov 1, 2026, 10:00 AM ET | `opensAt`, `publicOpensAt` |
| Closes | Mar 1, 2027 (set to 11:59 PM ET) | `closesAt` |
| Reserved for host-school families | 200 (one pool across both groups) | `reservedTotal` |
| Miami fields | Split names, age, height, weight, position, club, player email, shirt and short size; parent names, phone, email, emergency phone; shipping street, apt, city, state, ZIP | `src/contract.ts` |
| Description | "FOOTYUP x GOINGFORGOAT College Combine" text | `data/miami.json` |
| Arlington Catholic | July 12: ages 6–13, $500 · July 19: ages 14–18, $750 | `data/camps.json` |
| Watertown | $425, "both weeks" | `data/camps.json` (hidden until dates arrive) |
| Contact list | "Don't need right now" | Stage 2 |
| Chris's full name | Chris Calden | — |

## Still open: questions for Viraj and the client

| # | Question | Built as | Current value | Needed by |
| --- | --- | --- | --- | --- |
| 1 | **Spot limits.** The form says "out of all 450" and offers "250 boys / 250 girls", but neither box is ticked. Is it 225/225, 250/250, or something else? | `groups[].cap` | 225 / 225 | Nov 1 |
| 2 | **Reserved 200.** Shared across boys and girls (as built), or split (e.g. 100/100)? Are unused reserved spots ever released to the public, and when? | `reservedTotal` / per-group `reservedForCodeHolders`, `reservedUntil` | 200 shared, held until close | Nov 1 |
| 3 | **Early access.** Can host-school families register before 10:00 AM Nov 1? If yes, from when? | `opensAt` (earlier than `publicOpensAt`) | Same time as public | Nov 1 |
| 4 | **Location** (host school or venue) to show on the page | `event.location` | "Miami, FL" | Nov 1 |
| 5 | **Size and position options.** Shirt and short sizes (youth/adult?), positions list, or free text | `shirtSizes`, `shortSizes`, `positions` | Free text | Nov 1 (apparel orders) |
| 6 | **Chris's email** for his dashboard invite | `pnpm admins add` | — | Nov 1 |
| 7 | **Who receives private training emails** | setting `notify_email` | — | Nov 1 |
| 8 | **Waiver wording** (promised Oct 23) | `pnpm waiver add` | None: registrations flagged "not collected" | Nov 1 if possible |
| 9 | **Watertown** week dates, and is $425 per week? Bookable together? | `data/camps.json` | Hidden | Before Watertown opens |
| 10 | Arlington Catholic daily start time and session info text | `data/camps.json` | 9:00 AM placeholder | Before AC opens |
| 11 | Ages accepted for Miami | `MiamiPlayer.age` | 10–20 | Nov 1 |
| 12 | Business mailing address and how contacts agreed to be emailed (Section D blank) | settings | — | Stage 2 |

## Accounts (Kickoff Form, Section A)

| Account | Status from the form | What it means |
| --- | --- | --- |
| Vercel "FootyUP" | Pro and invites not ticked | Need an invite to the FootyUP team to deploy |
| Supabase "FootyUP" | Invite "won't work"; the form contains a login password instead | **Don't use the password** (Build Agreement §8–9 and the form itself say never share passwords). Ask Alex to retry the invite or have Viraj create the project and invite you. The password should be changed. |
| Brevo "FootyUP" | Same | Same: needs an invite; the password should be changed |
| Stripe "footyup" | Invite not ticked | Need a Stripe team invite (test mode for Stage 1) |
| Domain | Registrar not filled in | Ivy Devs adds DNS records (Build Agreement §4) |

The access code was written into the form. Per the Build Agreement the developer
never handles the real code: Ivy Devs sets it with `pnpm miami code add`. It isn't in this repo.

## Who to ask

Viraj Shah (781-468-8645), Ishan as backup.
