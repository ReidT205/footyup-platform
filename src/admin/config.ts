/**
 * Loads camp and Miami configuration from JSON files into the database. This
 * is the documented "no code change" way to add or edit camps until the Stage 2
 * dashboard exists. Upserts by slug; nothing is ever deleted (close a session
 * with "status": "closed" or hide a camp with "active": false).
 */
import { z } from "zod";
import type { Db } from "../lib/db.js";

const slug = z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, digits and dashes only");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const SessionConfig = z.object({
  slug,
  name: z.string().min(1),
  startsOn: isoDate.nullish(),
  endsOn: isoDate.nullish(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM (24h)").nullish(),
  location: z.string().nullish(),
  ageMin: z.int().nullish(),
  ageMax: z.int().nullish(),
  priceCents: z.int().min(0),
  earlyBirdPriceCents: z.int().min(0).nullish(),
  earlyBirdUntil: isoDate.nullish(),
  capacity: z.int().positive().nullish(),
  status: z.enum(["open", "closed"]).default("open"),
  infoText: z.string().nullish(),
  reminderDays: z.array(z.int().min(0)).default([7, 1]),
  sortOrder: z.int().default(0),
});

export const CampConfig = z.object({
  slug,
  name: z.string().min(1),
  host: z.string().nullish(),
  kind: z.enum(["summer", "winter", "other"]).default("summer"),
  infoOnly: z.boolean().default(false),
  active: z.boolean().default(true),
  description: z.string().nullish(),
  infoUrl: z.string().url().nullish(),
  sortOrder: z.int().default(0),
  sessions: z.array(SessionConfig).default([]),
});

export const CampsFile = z.object({ camps: z.array(CampConfig) });

export const MiamiFile = z.object({
  camp: z.object({ slug, name: z.string().min(1), host: z.string().nullish() }),
  event: z.object({
    name: z.string().min(1),
    startsOn: isoDate.nullish(),
    endsOn: isoDate.nullish(),
    location: z.string().nullish(),
    infoText: z.string().nullish(),
    opensAt: z.iso.datetime({ offset: true }).nullish(),
    checkoutOpen: z.boolean().default(true),
    holdMinutes: z.int().min(31).max(1440).default(35),
    waiverRequired: z.boolean().default(false),
    clothingSizes: z.array(z.string().min(1)).default([]),
  }),
  groups: z
    .array(
      z.object({
        grp: z.enum(["boys", "girls"]),
        label: z.string().min(1),
        cap: z.int().min(0),
        reservedForCodeHolders: z.int().min(0).default(0),
        reservedUntil: z.iso.datetime({ offset: true }).nullish(),
        priceCodeHolderCents: z.int().min(0).nullish(),
        pricePublicCents: z.int().min(0).nullish(),
        open: z.boolean().default(true),
      }),
    )
    .length(2),
});

export async function upsertCamps(db: Db, file: z.infer<typeof CampsFile>) {
  const summary: string[] = [];
  for (const camp of file.camps) {
    const [row] = await db<{ id: string }[]>`
      insert into public.camps (slug, name, host, kind, info_only, active, description, info_url, sort_order)
      values (${camp.slug}, ${camp.name}, ${camp.host ?? null}, ${camp.kind}, ${camp.infoOnly}, ${camp.active},
              ${camp.description ?? null}, ${camp.infoUrl ?? null}, ${camp.sortOrder})
      on conflict (slug) do update set
        name = excluded.name, host = excluded.host, kind = excluded.kind, info_only = excluded.info_only,
        active = excluded.active, description = excluded.description, info_url = excluded.info_url,
        sort_order = excluded.sort_order
      returning id`;
    for (const s of camp.sessions) {
      await db`
        insert into public.sessions
          (camp_id, slug, name, starts_on, ends_on, start_time, location, age_min, age_max, price_cents,
           early_bird_price_cents, early_bird_until, capacity, status, info_text, reminder_days, sort_order)
        values
          (${row!.id}, ${s.slug}, ${s.name}, ${s.startsOn ?? null}, ${s.endsOn ?? null}, ${s.startTime ?? null},
           ${s.location ?? null}, ${s.ageMin ?? null}, ${s.ageMax ?? null}, ${s.priceCents},
           ${s.earlyBirdPriceCents ?? null}, ${s.earlyBirdUntil ?? null}, ${s.capacity ?? null}, ${s.status},
           ${s.infoText ?? null}, ${s.reminderDays}, ${s.sortOrder})
        on conflict (camp_id, slug) do update set
          name = excluded.name, starts_on = excluded.starts_on, ends_on = excluded.ends_on,
          start_time = excluded.start_time, location = excluded.location, age_min = excluded.age_min,
          age_max = excluded.age_max, price_cents = excluded.price_cents,
          early_bird_price_cents = excluded.early_bird_price_cents, early_bird_until = excluded.early_bird_until,
          capacity = excluded.capacity, status = excluded.status, info_text = excluded.info_text,
          reminder_days = excluded.reminder_days, sort_order = excluded.sort_order`;
    }
    summary.push(`${camp.slug}: ${camp.sessions.length} session(s)${camp.infoOnly ? " (info only)" : ""}${camp.active ? "" : " (hidden)"}`);
  }
  return summary;
}

export async function upsertMiami(db: Db, file: z.infer<typeof MiamiFile>) {
  const { camp, event, groups } = file;
  const [row] = await db<{ id: string }[]>`
    insert into public.camps (slug, name, host, kind)
    values (${camp.slug}, ${camp.name}, ${camp.host ?? null}, 'miami')
    on conflict (slug) do update set name = excluded.name, host = excluded.host, kind = 'miami'
    returning id`;
  await db`
    insert into public.miami_event
      (id, camp_id, name, starts_on, ends_on, location, info_text, opens_at, checkout_open, hold_minutes, waiver_required, clothing_sizes)
    values
      (true, ${row!.id}, ${event.name}, ${event.startsOn ?? null}, ${event.endsOn ?? null}, ${event.location ?? null},
       ${event.infoText ?? null}, ${event.opensAt ?? null}, ${event.checkoutOpen}, ${event.holdMinutes},
       ${event.waiverRequired}, ${event.clothingSizes})
    on conflict (id) do update set
      camp_id = excluded.camp_id, name = excluded.name, starts_on = excluded.starts_on, ends_on = excluded.ends_on,
      location = excluded.location, info_text = excluded.info_text, opens_at = excluded.opens_at,
      checkout_open = excluded.checkout_open, hold_minutes = excluded.hold_minutes,
      waiver_required = excluded.waiver_required, clothing_sizes = excluded.clothing_sizes`;
  for (const g of groups) {
    await db`
      insert into public.miami_groups
        (grp, label, cap, reserved_for_code_holders, reserved_until, price_code_holder_cents, price_public_cents, open)
      values
        (${g.grp}, ${g.label}, ${g.cap}, ${g.reservedForCodeHolders}, ${g.reservedUntil ?? null},
         ${g.priceCodeHolderCents ?? null}, ${g.pricePublicCents ?? null}, ${g.open})
      on conflict (grp) do update set
        label = excluded.label, cap = excluded.cap, reserved_for_code_holders = excluded.reserved_for_code_holders,
        reserved_until = excluded.reserved_until, price_code_holder_cents = excluded.price_code_holder_cents,
        price_public_cents = excluded.price_public_cents, open = excluded.open`;
  }
}
