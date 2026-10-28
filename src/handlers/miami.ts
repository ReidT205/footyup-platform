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
  location: string | null;
  info_text: string | null;
  opens_at: Date | null;
  public_opens_at: Date | null;
  closes_at: Date | null;
  checkout_open: boolean;
  hold_minutes: number;
  waiver_required: boolean;
  positions: string[];
  shirt_sizes: string[];
  short_sizes: string[];
}

interface AvailabilityRow {
  grp: Group;
  label: string;
  open: boolean;
  left_for_code_holders: number;
  left_for_public: number;
  price_code_holder_cents: number | null;
  price_public_cents: number | null;
  starts_on: string | null;
  ends_on: string | null;
  daily_start_time: string | null;
  daily_end_time: string | null;
}

async function loadEvent(db: Db): Promise<EventRow> {
  const [event] = await db<EventRow[]>`
    select camp_id, name, location, info_text, opens_at, public_opens_at, closes_at,
           checkout_open, hold_minutes, waiver_required, positions, shirt_sizes, short_sizes
      from public.miami_event`;
  if (!event) throw new ApiError(409, "registration_not_open", "Miami registration is not open yet.");
  return event;
}

async function loadAvailability(db: Db): Promise<AvailabilityRow[]> {
  return db<AvailabilityRow[]>`
    select a.grp, a.label, a.open, a.left_for_code_holders, a.left_for_public,
           a.price_code_holder_cents, a.price_public_cents,
           g.starts_on, g.ends_on,
           to_char(g.daily_start_time, 'HH24:MI') as daily_start_time,
           to_char(g.daily_end_time, 'HH24:MI') as daily_end_time
      from public.miami_availability() a
      join public.miami_groups g on g.grp = a.grp
     order by a.grp`;
}

async function codesActive(db: Db): Promise<boolean> {
  const [row] = await db<{ active: boolean }[]>`select public.miami_codes_active() as active`;
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
    return {
      group: row.grp,
      label: row.label,
      priceCents: priceFor(row, viaCode),
      spotsLeft,
      full: spotsLeft <= 0,
      open: row.open,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      dailyStartTime: row.daily_start_time,
      dailyEndTime: row.daily_end_time,
    };
  });
}

const passed = (at: Date | null) => !at || at.getTime() <= Date.now();

function isOpen(event: EventRow): boolean {
  return event.checkout_open && passed(event.opens_at) && (!event.closes_at || event.closes_at.getTime() > Date.now());
}

/** Families without a code may register once public_opens_at passes; with no public time set, they may whenever no code is active. */
function phase(event: EventRow, anyCodeActive: boolean) {
  const publicOpen = event.public_opens_at ? passed(event.public_opens_at) : !anyCodeActive;
  return { publicOpen, codeRequired: anyCodeActive && !publicOpen, codeAccepted: anyCodeActive };
}

function checkOption(list: string[], value: string, path: string): string {
  if (!list.length) return value;
  const match = list.find((v) => v.toLowerCase() === value.toLowerCase());
  if (!match) {
    throw new ApiError(400, "validation_failed", "Some fields are missing or invalid", {
      issues: [{ path, message: `Choose one of: ${list.join(", ")}` }],
    });
  }
  return match;
}

/** GET /api/miami */
export async function miamiStatus(_req: Request, deps: Deps): Promise<Response> {
  const { db } = deps;
  const event = await loadEvent(db);
  const [availability, anyCode, waiver] = await Promise.all([loadAvailability(db), codesActive(db), currentWaiver(db, "miami")]);
  const { publicOpen, codeRequired, codeAccepted } = phase(event, anyCode);

  const body: MiamiStatusResponse = {
    event: {
      name: event.name,
      location: event.location,
      infoText: event.info_text,
      opensAt: event.opens_at?.toISOString() ?? null,
      publicOpensAt: event.public_opens_at?.toISOString() ?? null,
      closesAt: event.closes_at?.toISOString() ?? null,
      open: isOpen(event),
      publicOpen,
    },
    accessCodeRequired: codeRequired,
    accessCodeAccepted: codeAccepted,
    options: { positions: event.positions, shirtSizes: event.shirt_sizes, shortSizes: event.short_sizes },
    waiver,
    waiverRequired: Boolean(waiver) && event.waiver_required,
    groups: groupView(availability, codeRequired),
  };
  return json(body, 200, { "cache-control": "public, s-maxage=5, stale-while-revalidate=10" });
}

/** POST /api/miami/verify-code: lets the page confirm a code and show host-family availability. */
export async function miamiVerifyCode(req: Request, deps: Deps): Promise<Response> {
  const { db } = deps;
  await enforceRateLimit(db, deps.env, req, "verifyCode");
  const { accessCode } = parse(VerifyCodeRequest, await readJson(req));

  const groups = await checkCode(db, accessCode);
  if (!groups) throw new ApiError(403, "access_code_invalid", "That access code isn't valid.");
  const view = groupView(await loadAvailability(db), true).filter((g) => groups.includes(g.group));
  return json({ valid: true, groups: view } satisfies VerifyCodeResponse);
}

/** POST /api/miami/checkout (D3) */
export async function miamiCheckout(req: Request, deps: Deps): Promise<Response> {
  const { db } = deps;
  await enforceRateLimit(db, deps.env, req, "checkout");
  const body = parse(MiamiCheckoutRequest, await readJson(req));

  const event = await loadEvent(db);
  if (!isOpen(event)) {
    const closed = event.closes_at && event.closes_at.getTime() <= Date.now();
    throw new ApiError(
      409,
      "registration_not_open",
      closed ? "Miami registration has closed." : "Miami registration is not open yet.",
      { opensAt: event.opens_at?.toISOString() ?? null, closesAt: event.closes_at?.toISOString() ?? null },
    );
  }

  const players = body.players.map((p, i) => ({
    ...p,
    group: (p.sex === "boy" ? "boys" : "girls") as Group,
    position: checkOption(event.positions, p.position, `players.${i}.position`),
    shirtSize: checkOption(event.shirt_sizes, p.shirtSize, `players.${i}.shirtSize`),
    shortSize: checkOption(event.short_sizes, p.shortSize, `players.${i}.shortSize`),
  }));

  const { publicOpen, codeRequired } = phase(event, await codesActive(db));
  let viaCode = false;
  if (body.accessCode) {
    const groups = await checkCode(db, body.accessCode);
    if (!groups || players.some((p) => !groups.includes(p.group))) {
      throw new ApiError(403, "access_code_invalid", "That access code isn't valid.");
    }
    viaCode = true;
  } else if (codeRequired) {
    throw new ApiError(403, "access_code_required", "An access code is required to register right now.");
  } else if (!publicOpen) {
    throw new ApiError(409, "registration_not_open", "Miami registration is not open yet.", {
      opensAt: event.public_opens_at?.toISOString() ?? null,
    });
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
  const { parent } = body;

  const result = await startCheckout(deps, {
    flow: "miami",
    viaAccessCode: viaCode,
    payload: {
      parent: {
        name: `${parent.firstName} ${parent.lastName}`,
        firstName: parent.firstName,
        lastName: parent.lastName,
        email: parent.email,
        phone: parent.phone,
        emergencyPhone: parent.emergencyPhone,
        town: parent.town ?? body.shippingAddress.city,
      },
      marketingOptIn: body.marketingOptIn ?? false,
      extra: {},
      waiver: waiverRecord,
      lines: players.map((p, i) => ({
        lineNo: i + 1,
        campId: event.camp_id,
        miamiGroup: p.group,
        player: {
          name: `${p.firstName} ${p.lastName}`,
          firstName: p.firstName,
          lastName: p.lastName,
          age: p.age,
          sex: p.sex,
          email: p.email,
          heightIn: p.heightIn,
          weightLb: p.weightLb,
          position: p.position,
          club: p.club,
          shirtSize: p.shirtSize,
          shortSize: p.shortSize,
          shippingAddress: p.shippingAddress ?? body.shippingAddress,
          extra: {},
        },
      })),
    },
    lines: stripeLines,
    customerEmail: parent.email,
    holdMinutes: event.hold_minutes,
    successPath: body.successPath ?? settings.default_success_path,
    cancelPath: body.cancelPath ?? settings.default_cancel_path,
    reserve: async (tx, intentId, holdExpiresAt) => {
      await tx`select public.reserve_miami(${intentId}, ${tx.json(counts)}, ${viaCode}, ${holdExpiresAt})`;
    },
  });

  return json(result);
}
