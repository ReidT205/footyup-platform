import { beforeEach, describe, it } from "node:test";
import { expect } from "./expect.js";
import { miamiCheckout, miamiStatus, miamiVerifyCode } from "../src/handlers/miami.js";
import type { MiamiStatusResponse } from "../src/contract.js";
import { cleanup } from "../src/handlers/cleanup.js";
import { addAccessCode, call, deliver, fillMiami, get, makeDeps, miamiPlayer, parent, post, resetDb, seed, sessionIdFrom } from "./helpers.js";

const deps = makeDeps();
const { db } = deps;

const checkout = (body: Record<string, unknown>) => call(deps, miamiCheckout, post("/api/miami/checkout", { parent, ...body }));
const boy = (extra: Record<string, unknown> = {}) => checkout({ players: [miamiPlayer("boy")], ...extra });

beforeEach(async () => {
  await resetDb(db);
  await seed(db);
});

describe("access code gate (acceptance #4)", () => {
  beforeEach(async () => {
    await addAccessCode(db, "FootyUp-Test-Code");
  });

  it("blocks a missing or wrong code and allows the right one", async () => {
    expect(await (await boy()).json()).toMatchObject({ error: "access_code_required" });
    expect(await (await boy({ accessCode: "guess" })).json()).toMatchObject({ error: "access_code_invalid" });
    const ok = await boy({ accessCode: "  footyup-test-code " });
    expect(ok.status).toBe(200);
    const mock = deps.payments.sessions.get(sessionIdFrom(((await ok.json()) as { checkoutUrl: string }).checkoutUrl))!;
    expect(mock.amountTotal).toBe(157500);
  });

  it("removing the code opens checkout to the public at the public price", async () => {
    await db`update public.access_codes set active = false`;
    const res = await boy();
    expect(res.status).toBe(200);
    const mock = deps.payments.sessions.get(sessionIdFrom(((await res.json()) as { checkoutUrl: string }).checkoutUrl))!;
    expect(mock.amountTotal).toBe(130000);
  });

  it("an end date in the past opens checkout without a deploy", async () => {
    await db`update public.access_codes set ends_at = now() - interval '1 minute'`;
    expect((await boy()).status).toBe(200);
  });

  it("a code limited to one group does not unlock the other", async () => {
    await db`delete from public.access_codes`;
    await addAccessCode(db, "girls-only", { grp: "girls" });
    expect(await (await boy({ accessCode: "girls-only" })).json()).toMatchObject({ error: "access_code_invalid" });
    expect((await checkout({ accessCode: "girls-only", players: [miamiPlayer("girl")] })).status).toBe(200);
  });

  it("verify-code reports code-holder prices and rejects bad codes", async () => {
    const bad = await call(deps, miamiVerifyCode, post("/api/miami/verify-code", { accessCode: "nope" }));
    expect(bad.status).toBe(403);
    const good = await call(deps, miamiVerifyCode, post("/api/miami/verify-code", { accessCode: "footyup-test-code" }));
    expect(await good.json()).toMatchObject({ valid: true, groups: [{ group: "boys", priceCents: 157500, spotsLeft: 200 }, { group: "girls" }] });
  });

  it("rate-limits code guessing", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < 10; i++) await call(deps, miamiVerifyCode, post("/api/miami/verify-code", { accessCode: `guess-${i}` }, ip));
    const res = await call(deps, miamiVerifyCode, post("/api/miami/verify-code", { accessCode: "footyup-test-code" }, ip));
    expect(res.status).toBe(429);
  });
});

describe("caps and holds (acceptance #5)", () => {
  it("the 201st boy and the 201st girl cannot check out", async () => {
    await fillMiami(db, "boys", 200);
    await fillMiami(db, "girls", 199);
    expect(await (await boy()).json()).toMatchObject({ error: "group_full", details: { group: "boys" } });
    expect((await checkout({ players: [miamiPlayer("girl")] })).status).toBe(200);
    expect(await (await checkout({ players: [miamiPlayer("girl")] })).json()).toMatchObject({ error: "group_full", details: { group: "girls" } });
  });

  it("two simultaneous attempts for the last spot: exactly one wins", async () => {
    await fillMiami(db, "boys", 199);
    const results = await Promise.all(Array.from({ length: 8 }, () => boy()));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
  });

  it("never oversells under heavy concurrency at the database level", async () => {
    await db`update public.miami_groups set cap = 25 where grp = 'boys'`;
    const attempts = await Promise.allSettled(
      Array.from({ length: 60 }, () =>
        db.begin(async (tx) => {
          const [intent] = await tx`insert into public.checkout_intents (flow, amount_cents, expires_at) values ('miami', 0, now() + interval '1 hour') returning id`;
          await tx`select public.reserve_miami(${intent!.id}, ${tx.json({ boys: 1 })}, false, now() + interval '1 hour')`;
        }),
      ),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(25);
    const [holds] = await db`select sum(quantity)::int as held from public.holds where status = 'active'`;
    expect(holds!.held).toBe(25);
  });

  it("an abandoned checkout releases its hold when the session expires", async () => {
    await fillMiami(db, "boys", 199);
    const first = await boy();
    expect(first.status).toBe(200);
    expect((await boy()).status).toBe(409);

    await deliver(deps, deps.payments.expire(sessionIdFrom(((await first.json()) as { checkoutUrl: string }).checkoutUrl)));
    expect((await boy()).status).toBe(200);
  });

  it("a hold past its expiry stops counting even if the expiry webhook never arrives", async () => {
    await fillMiami(db, "boys", 199);
    expect((await boy()).status).toBe(200);
    await db`update public.holds set expires_at = now() - interval '1 second'`;
    expect((await boy()).status).toBe(200);
    const res = await call(deps, cleanup, get("/api/cron/cleanup"));
    expect(await res.json()).toMatchObject({ holdsReleased: 1 });
  });

  it("a refunded registration frees its spot", async () => {
    await fillMiami(db, "boys", 199);
    const res = await boy();
    const sessionId = sessionIdFrom(((await res.json()) as { checkoutUrl: string }).checkoutUrl);
    await deliver(deps, deps.payments.complete(sessionId));
    expect((await boy()).status).toBe(409);
    await deliver(deps, deps.payments.refund(sessionId, 130000));
    expect((await boy()).status).toBe(200);
  });

  it("paid Miami registrations store the Miami fields and group", async () => {
    await addAccessCode(db, "code");
    const res = await checkout({ accessCode: "code", players: [miamiPlayer("boy", 1), miamiPlayer("girl", 2)] });
    await deliver(deps, deps.payments.complete(sessionIdFrom(((await res.json()) as { checkoutUrl: string }).checkoutUrl)));
    const regs = await db`
      select miami_group, via_access_code, player_height_in, player_weight_lb, player_email, ship_city, clothing_size, session_id
        from public.registrations order by line_no`;
    expect(regs).toEqual([
      { miami_group: "boys", via_access_code: true, player_height_in: 70, player_weight_lb: 150, player_email: "player1@example.test", ship_city: "Brookline", clothing_size: "M", session_id: null },
      { miami_group: "girls", via_access_code: true, player_height_in: 70, player_weight_lb: 150, player_email: "player2@example.test", ship_city: "Brookline", clothing_size: "M", session_id: null },
    ]);
  });
});

describe("reserved allotment and configuration", () => {
  it("the public cannot take spots reserved for code holders while the gate is on", async () => {
    await db`update public.miami_groups set cap = 10, reserved_for_code_holders = 4 where grp = 'boys'`;
    await addAccessCode(db, "host-families", { endsAt: new Date(Date.now() + 86_400_000) });
    await fillMiami(db, "boys", 6, false);

    const [avail] = await db`select left_for_code_holders, left_for_public from public.miami_availability() where grp = 'boys'`;
    expect(avail).toEqual({ left_for_code_holders: 4, left_for_public: 0 });
    expect((await boy({ accessCode: "host-families" })).status).toBe(200);

    await db`update public.access_codes set active = false`;
    const [after] = await db`select left_for_public from public.miami_availability() where grp = 'boys'`;
    expect(after!.left_for_public).toBe(3);
  });

  it("refuses checkout until a price is configured", async () => {
    await db`update public.miami_groups set price_public_cents = null, price_code_holder_cents = null`;
    const res = await boy();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "pricing_not_configured" });
  });

  it("refuses checkout before opens_at and when paused", async () => {
    await db`update public.miami_event set opens_at = now() + interval '1 day'`;
    expect(await (await boy()).json()).toMatchObject({ error: "registration_not_open" });
    await db`update public.miami_event set opens_at = null, checkout_open = false`;
    expect((await boy()).status).toBe(409);
  });

  it("validates clothing sizes against the configured list", async () => {
    await db`update public.miami_event set clothing_sizes = '{YL,S,M,L,XL}'`;
    const bad = await checkout({ players: [{ ...miamiPlayer("boy"), clothingSize: "XXXL" }] });
    expect(await bad.json()).toMatchObject({ error: "validation_failed" });
    expect((await checkout({ players: [{ ...miamiPlayer("boy"), clothingSize: "xl" }] })).status).toBe(200);
  });

  it("flags registrations as waiver not collected when no Miami waiver exists yet", async () => {
    const res = await boy();
    await deliver(deps, deps.payments.complete(sessionIdFrom(((await res.json()) as { checkoutUrl: string }).checkoutUrl)));
    const [reg] = await db`select waiver_status from public.registrations`;
    expect(reg!.waiver_status).toBe("not_collected");
  });

  it("GET /api/miami reports gate state and availability without exposing codes", async () => {
    await addAccessCode(db, "secret-code");
    await fillMiami(db, "girls", 200);
    const res = await call(deps, miamiStatus, get("/api/miami"));
    const text = await res.text();
    expect(text).not.toContain("secret-code");
    const body = JSON.parse(text) as MiamiStatusResponse;
    expect(body.accessCodeRequired).toBe(true);
    expect(body.groups).toEqual([
      { group: "boys", label: "Boys", priceCents: 157500, spotsLeft: 200, full: false, open: true },
      { group: "girls", label: "Girls", priceCents: 157500, spotsLeft: 0, full: true, open: true },
    ]);
  });
});
