import { WaitlistRequest, type OkResponse } from "../contract.js";
import type { Deps } from "../lib/deps.js";
import { enforceRateLimit } from "../lib/guards.js";
import { ApiError, json, parse, readJson } from "../lib/http.js";

/**
 * POST /api/waitlist: saves a waitlist entry in arrival order. Notifying the
 * next family when a spot frees up is Stage 3 (D9).
 */
export async function joinWaitlist(req: Request, deps: Deps): Promise<Response> {
  const { db, env } = deps;
  await enforceRateLimit(db, env, req, "waitlist");
  const body = parse(WaitlistRequest, await readJson(req));
  if (body.website) return json({ ok: true } satisfies OkResponse, 201);

  const [target] = body.sessionId
    ? await db<{ camp_id: string }[]>`
        select s.camp_id from public.sessions s join public.camps c on c.id = s.camp_id
         where s.id = ${body.sessionId} and c.kind <> 'miami'`
    : await db<{ camp_id: string }[]>`select camp_id from public.miami_event`;
  if (!target) throw new ApiError(404, "not_found", "That session or group doesn't exist.");

  await db.begin(async (tx) => {
    await tx`
      insert into public.waitlist_entries (camp_id, session_id, miami_group, parent_name, email, phone, town, spots)
      values (${target.camp_id}, ${body.sessionId ?? null}, ${body.miamiGroup ?? null},
              ${body.parentName}, ${body.email}, ${body.phone}, ${body.town}, ${body.spots})`;
    await tx`select public.upsert_contact(${body.email}, ${body.parentName}, ${body.phone}, ${body.town},
                                          'waitlist', ${body.marketingOptIn ? "granted" : null})`;
  });

  return json({ ok: true } satisfies OkResponse, 201);
}
