import {
  MiamiCheckoutRequest,
  VerifyCodeRequest,
  type MiamiGroupStatus,
  type MiamiStatusResponse,
  type VerifyCodeResponse,
} from "../contract.js";
import { startCheckout } from "../lib/checkout.js";
import type { Db } from "../lib/db.js";
import type { Deps } from "../lib/deps.js";
import { enforceRateLimit, hashAccessCode } from "../lib/guards.js";
import { ApiError, json, parse, readJson } from "../lib/http.js";
import type { CheckoutLine } from "../lib/payments.js";
import { getSettings } from "../lib/settings.js";
import { currentWaiver, resolveWaiver } from "../lib/waiver.js";

type Group = "boys" | "girls";

interface EventRow {
  camp_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  location: string | null;
  info_text: string | null;
  opens_at: Date | null;
  checkout_open: boolean;
  hold_minutes: number;
  waiver_required: boolean;
  clothing_sizes: string[];
}

interface AvailabilityRow {
  grp: Group;
  label: string;
  open: boolean;
  left_for_code_holders: number;
  left_for_public: number;
  price_code_holder_cents: number | null;
  price_public_cents: number | null;
}

async function loadEvent(db: Db): Promise<EventRow> {
  const [event] = await db<EventRow[]>`
    select camp_id, name, starts_on::text, ends_on::text, location, info_text, opens_at,
           checkout_open, hold_minutes, waiver_required, clothing_sizes
      from public.miami_event`;
  if (!event) throw new ApiError(409, "registration_not_open", "Miami registration is not open yet.");
  return event;
}

async function loadAvailability(db: Db): Promise<AvailabilityRow[]> {
  return db<AvailabilityRow[]>`
    select grp, label, open, left_for_code_holders, left_for_public, price_code_holder_cents, price_public_cents
      from public.miami_availability()`;
}

async function gateActive(db: Db): Promise<boolean> {
  const [row] = await db<{ active: boolean }[]>`select public.miami_gate_active() as active`;
  return Boolean(row?.active);
}

/** Returns the groups the code is valid for, or null if the code is wrong, off, or past its end date. */
async function checkCode(db: Db, code: string): Promise<Group[] | null> {
  const rows = await db<{ grp: Group | null }[]>`
    select grp from public.access_codes
     where code_hash = ${hashAccessCode(code)}
       and active
       and (ends_at is null or ends_at > now())`;
  if (!rows.length) return null;
  return rows.some((r) => r.grp === null) ? ["boys", "girls"] : rows.map((r) => r.grp as Group);
}

function priceFor(row: AvailabilityRow, viaCode: boolean): number | null {
  return viaCode ? (row.price_code_holder_cents ?? row.price_public_cents) : row.price_public_cents;
}

function groupView(rows: AvailabilityRow[], viaCode: boolean): MiamiGroupStatus[] {
  return rows.map((row) => {
    const spotsLeft = viaCode ? row.left_for_code_holders : row.left_for_public;
    return { group: row.grp, label: row.label, priceCents: priceFor(row, viaCode), spotsLeft, full: spotsLeft <= 0, open: row.open };
  });
}

function isOpen(event: EventRow): boolean {
  return event.checkout_open && (!event.opens_at || event.opens_at.getTime() <= Date.now());
}

/** GET /api/miami */
export async function miamiStatus(_req: Request, deps: Deps): Promise<Response> {
  const { db } = deps;
  const event = await loadEvent(db);
  const [availability, gate, waiver] = await Promise.all([loadAvailability(db), gateActive(db), currentWaiver(db, "miami")]);

  const body: MiamiStatusResponse = {
    event: {
      name: event.name,
      startsOn: event.starts_on,
      endsOn: event.ends_on,
      location: event.location,
      infoText: event.info_text,
      opensAt: event.opens_at?.toISOString() ?? null,
      open: isOpen(event),
    },
    accessCodeRequired: gate,
    clothingSizes: event.clothing_sizes,
    waiver,
    waiverRequired: Boolean(waiver) && event.waiver_required,
    groups: groupView(availability, gate),
  };
  return json(body, 200, { "cache-control": "public, s-maxage=5, stale-while-revalidate=10" });
}

/** POST /api/miami/verify-code: lets the page show code-holder prices before checkout. */
export async function miamiVerifyCode(req: Request, deps: Deps): Promise<Response> {
  const { db } = deps;
  await enforceRateLimit(db, deps.env, req, "verifyCode");
  const { accessCode } = parse(VerifyCodeRequest, await readJson(req));

  const gate = await gateActive(db);
  if (gate) {
    const groups = await checkCode(db, accessCode);
    if (!groups) throw new ApiError(403, "access_code_invalid", "That access code isn't valid.");
    const view = groupView(await loadAvailability(db), true).filter((g) => groups.includes(g.group));
    return json({ valid: true, groups: view } satisfies VerifyCodeResponse);
  }
  return json({ valid: true, groups: groupView(await loadAvailability(db), false) } satisfies VerifyCodeResponse);
}

/** POST /api/miami/checkout (D3) */
export async function miamiCheckout(req: Request, deps: Deps): Promise<Response> {
  const { db } = deps;
  await enforceRateLimit(db, deps.env, req, "checkout");
  const body = parse(MiamiCheckoutRequest, await readJson(req));

  const event = await loadEvent(db);
  if (!isOpen(event)) {
    throw new ApiError(409, "registration_not_open", "Miami registration is not open yet.", {
      opensAt: event.opens_at?.toISOString() ?? null,
    });
  }

  const players = body.players.map((p) => ({ ...p, group: (p.sex === "boy" ? "boys" : "girls") as Group }));

  let viaCode = false;
  if (await gateActive(db)) {
    if (!body.accessCode) throw new ApiError(403, "access_code_required", "An access code is required to register right now.");
    const groups = await checkCode(db, body.accessCode);
    if (!groups || players.some((p) => !groups.includes(p.group))) {
      throw new ApiError(403, "access_code_invalid", "That access code isn't valid.");
    }
    viaCode = true;
  }

  if (event.clothing_sizes.length) {
    const allowed = new Map(event.clothing_sizes.map((s) => [s.toLowerCase(), s]));
    const bad = players.findIndex((p) => !allowed.has(p.clothingSize.toLowerCase()));
    if (bad !== -1) {
      throw new ApiError(400, "validation_failed", "Some fields are missing or invalid", {
        issues: [{ path: `players.${bad}.clothingSize`, message: `Choose one of: ${event.clothing_sizes.join(", ")}` }],
      });
    }
    for (const p of players) p.clothingSize = allowed.get(p.clothingSize.toLowerCase())!;
  }

  const availability = new Map((await loadAvailability(db)).map((r) => [r.grp, r]));
  const counts: Partial<Record<Group, number>> = {};
  for (const p of players) counts[p.group] = (counts[p.group] ?? 0) + 1;

  const stripeLines: CheckoutLine[] = [];
  for (const group of Object.keys(counts) as Group[]) {
    const row = availability.get(group);
    const price = row ? priceFor(row, viaCode) : null;
    if (!row || price === null) {
      throw new ApiError(503, "pricing_not_configured", "Miami pricing hasn't been published yet. Please check back soon.", { group });
    }
    stripeLines.push({ name: `${event.name} – ${row.label}`, unitAmountCents: price, quantity: counts[group]! });
  }

  const waiver = await currentWaiver(db, "miami");
  const waiverRecord = resolveWaiver(waiver, event.waiver_required, body.waiver, new Date());
  const settings = await getSettings(db);

  const result = await startCheckout(deps, {
    flow: "miami",
    viaAccessCode: viaCode,
    payload: {
      parent: body.parent,
      marketingOptIn: body.marketingOptIn ?? false,
      extra: {},
      waiver: waiverRecord,
      lines: players.map((p, i) => ({
        lineNo: i + 1,
        campId: event.camp_id,
        miamiGroup: p.group,
        player: {
          name: p.name,
          age: p.age,
          sex: p.sex,
          email: p.email,
          heightIn: p.heightIn,
          weightLb: p.weightLb,
          clothingSize: p.clothingSize,
          shippingAddress: p.shippingAddress,
          extra: {},
        },
      })),
    },
    lines: stripeLines,
    customerEmail: body.parent.email,
    holdMinutes: event.hold_minutes,
    successPath: body.successPath ?? settings.default_success_path,
    cancelPath: body.cancelPath ?? settings.default_cancel_path,
    reserve: async (tx, intentId, holdExpiresAt) => {
      await tx`select public.reserve_miami(${intentId}, ${tx.json(counts)}, ${viaCode}, ${holdExpiresAt})`;
    },
  });

  return json(result);
}
