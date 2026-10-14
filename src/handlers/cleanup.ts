import type { Deps } from "../lib/deps.js";
import { ApiError, json } from "../lib/http.js";

/**
 * GET /api/cron/cleanup (Vercel cron). Capacity math already ignores expired
 * holds, so this is housekeeping: mark lapsed holds, and clear child data from
 * checkouts that were never paid. Pending checkouts are kept for 4 days because
 * Stripe retries a failed webhook for up to 3 days.
 */
export async function cleanup(req: Request, deps: Deps): Promise<Response> {
  const { db, env } = deps;
  if (env.cronSecret) {
    if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
      throw new ApiError(401, "unauthorized", "Unauthorized");
    }
  } else if (env.isProduction) {
    throw new ApiError(401, "unauthorized", "CRON_SECRET is not configured");
  }

  const result = await db.begin(async (tx) => {
    const holds = await tx`
      update public.holds set status = 'released'
       where status = 'active' and expires_at < now()
      returning id`;
    const intents = await tx`
      update public.checkout_intents set status = 'expired', payload = null
       where status = 'pending' and expires_at < now() - interval '4 days'
      returning id`;
    const failed = await tx`
      update public.checkout_intents set payload = null
       where status in ('failed', 'expired') and payload is not null
      returning id`;
    const limits = await tx`delete from public.rate_limits where window_start < now() - interval '1 day' returning key`;
    return { holdsReleased: holds.length, intentsExpired: intents.length, payloadsCleared: failed.length, rateLimitRowsDeleted: limits.length };
  });

  return json(result);
}
