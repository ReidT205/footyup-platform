import { PrivateTrainingRequest, type OkResponse } from "../contract.js";
import type { Deps } from "../lib/deps.js";
import { enforceRateLimit, verifyTurnstile } from "../lib/guards.js";
import { json, logError, parse, readJson } from "../lib/http.js";
import { getSettings } from "../lib/settings.js";

/** POST /api/private-training (D4): replaces the Telegram flow. */
export async function privateTraining(req: Request, deps: Deps): Promise<Response> {
  const { db, env, mailer } = deps;
  await enforceRateLimit(db, env, req, "privateTraining");
  const body = parse(PrivateTrainingRequest, await readJson(req));

  // Bots that fill the hidden field get a normal-looking success and nothing is saved.
  if (body.website) return json({ ok: true } satisfies OkResponse, 201);
  await verifyTurnstile(env, body.turnstileToken, req);

  await db.begin(async (tx) => {
    await tx`
      insert into public.private_training_requests
        (parent_name, email, phone, town, player_name, player_age, message, preferred_times, extra)
      values
        (${body.parentName}, ${body.email}, ${body.phone}, ${body.town}, ${body.playerName}, ${body.playerAge},
         ${body.message ?? null}, ${body.preferredTimes ?? null}, ${tx.json(body.extra ?? {})})`;
    await tx`select public.upsert_contact(${body.email}, ${body.parentName}, ${body.phone}, ${body.town},
                                          'private_training', ${body.marketingOptIn ? "granted" : null})`;
  });

  const settings = await getSettings(db);
  if (settings.notify_email) {
    try {
      await mailer.send({
        to: settings.notify_email,
        replyTo: body.email,
        subject: "New private training request",
        text: [
          "A new private training request came in through the website.",
          "",
          `Parent: ${body.parentName}`,
          `Email: ${body.email}`,
          `Phone: ${body.phone}`,
          `Town: ${body.town}`,
          `Player: ${body.playerName} (age ${body.playerAge})`,
          body.preferredTimes ? `Preferred times: ${body.preferredTimes}` : null,
          body.message ? `\nMessage:\n${body.message}` : null,
          "",
          "Reply to this email to answer the parent directly.",
        ]
          .filter((l) => l !== null)
          .join("\n"),
      });
    } catch (err) {
      // The request is already saved and visible in the dashboard; don't fail the parent's submission.
      logError("private_training.notify", err);
    }
  }

  return json({ ok: true } satisfies OkResponse, 201);
}
