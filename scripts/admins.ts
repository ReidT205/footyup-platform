/**
 * Manage the dashboard admins (the client wants exactly two: Alex and Chris).
 *
 *   pnpm admins add <email>      Supabase: sends an invite email to set a password, then grants admin.
 *                                Local (no SUPABASE_URL): creates the user locally for the dev login.
 *   pnpm admins list
 *   pnpm admins remove <email>   Revokes dashboard access (the Supabase login itself is kept).
 *
 * Supabase mode needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server secret, never
 * in the browser) and PUBLIC_ADMIN_URL (where the invite link lands, e.g. https://.../admin/).
 */
import { scriptDb } from "./_db.js";

const [command, rawEmail] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
const sql = scriptDb();

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseUserId(target: string): Promise<string> {
  const headers = { apikey: serviceKey!, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const redirect = process.env.PUBLIC_ADMIN_URL;
  const invite = await fetch(`${supabaseUrl}/auth/v1/invite${redirect ? `?redirect_to=${encodeURIComponent(redirect)}` : ""}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: target }),
  });
  if (invite.ok) {
    const user = (await invite.json()) as { id: string };
    console.log(`Invite email sent to ${target}. They set their password from the link.`);
    return user.id;
  }
  // Already registered: find the existing user.
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!res.ok) throw new Error(`Supabase admin API returned ${res.status}`);
    const { users } = (await res.json()) as { users: { id: string; email?: string }[] };
    const found = users.find((u) => u.email?.toLowerCase() === target);
    if (found) {
      console.log(`${target} already has a Supabase login; granting admin access.`);
      return found.id;
    }
    if (users.length < 200) break;
  }
  throw new Error(`Could not invite or find ${target} (invite returned ${invite.status}).`);
}

try {
  if (command === "add" && email) {
    let userId: string;
    if (supabaseUrl && serviceKey) {
      userId = await supabaseUserId(email);
    } else {
      const host = new URL((process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL)!).hostname;
      if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
        throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to add admins on a real Supabase project.");
      }
      const [existing] = await sql<{ id: string }[]>`select id from auth.users where lower(email) = ${email}`;
      userId = existing?.id ?? (await sql<{ id: string }[]>`insert into auth.users (email) values (${email}) returning id`)[0]!.id;
      console.log(`Local user ready for ${email}. Sign in at /admin/ with the dev login.`);
    }
    await sql`insert into public.admin_users (user_id, email) values (${userId}, ${email})
              on conflict (user_id) do update set email = excluded.email`;
    const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from public.admin_users`) as [{ n: number }];
    console.log(`${email} is an admin. Admins now: ${n}.`);
  } else if (command === "list") {
    console.table(await sql`select email, created_at from public.admin_users order by created_at`);
  } else if (command === "remove" && email) {
    const rows = await sql`delete from public.admin_users where lower(email) = ${email} returning email`;
    console.log(rows.length ? `${email} no longer has dashboard access.` : `${email} was not an admin.`);
  } else {
    console.error("Usage: pnpm admins add|remove <email> | list");
    process.exit(1);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
