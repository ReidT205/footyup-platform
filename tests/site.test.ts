import { readFileSync } from "node:fs";
import { beforeEach, describe, it } from "node:test";
import { expect } from "./expect.js";
import { CampsFile, MiamiFile, upsertCamps, upsertMiami } from "../src/admin/config.js";
import { site } from "../src/handlers/site.js";
import { addAccessCode, call, countRows, deliver, get, makeDeps, post, resetDb, sessionIdFrom } from "./helpers.js";

const deps = makeDeps();
const { db } = deps;

async function seedSite() {
  await upsertCamps(db, CampsFile.parse(JSON.parse(readFileSync("data/camps.json", "utf8"))));
  await upsertMiami(db, MiamiFile.parse(JSON.parse(readFileSync("data/miami.json", "utf8"))));
}

/** Miami in its private-school window: open now, public phase later, one test code. */
async function miamiCodeWindow() {
  await db`update public.miami_event set opens_at = now() - interval '1 day', public_opens_at = now() + interval '10 days', reserved_total = 0`;
  await addAccessCode(db, "TEST-CODE-123");
}

const siteCall = (req: Request) => call(deps, site, req);

const campForm = {
  campId: "arlington_catholic_2027",
  session: "summer",
  playerName: "Alex Rivera",
  parentName: "Jamie Rivera",
  playerAge: "10",
  parentEmail: "jamie.rivera@example.test",
  town: "Brookline",
};

const miamiForm = {
  campId: "miami_combine_2027",
  session: "girls",
  accessCode: "TEST-CODE-123",
  playerName: "Taylor Ann Brooks",
  playerEmail: "taylor@example.test",
  playerAge: "16",
  heightFt: "5",
  heightIn: "6",
  weight: "130",
  gradYear: "2028",
  position: "Winger",
  club: "Test FC",
  clothingSize: "Adult S",
  parentName: "Morgan Brooks",
  parentEmail: "morgan@example.test",
  parentPhone: "(305) 555-0142",
  address1: "1 Test Street",
  address2: "",
  city: "Miami",
  state: "fl",
  zip: "33184",
};

async function pay(url: string) {
  const sessionId = sessionIdFrom(url);
  const res = await deliver(deps, deps.payments.complete(sessionId));
  expect(res.status).toBe(200);
  return sessionId;
}

beforeEach(async () => {
  await resetDb(db);
  await seedSite();
  deps.mailer.sent.length = 0;
});

describe("site adapter: camp checkout", () => {
  it("takes the site's camp form as-is and lands a registration with Stripe's phone", async () => {
    const res = await siteCall(post("/api/site/checkout", campForm));
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const sessionId = sessionIdFrom(url);
    const mock = deps.payments.sessions.get(sessionId)!;
    expect(mock.amountTotal).toBe(50000);
    expect(mock.input).toMatchObject({ collectPhone: true, customerEmail: "jamie.rivera@example.test" });
    expect(mock.input.cancelUrl).toBe("https://footyupp.test/cancel?camp=summerCamp%2Farlington-catholic");

    await pay(url);
    const [reg] = await db`
      select r.player_name, r.player_age, r.parent_name, r.parent_phone, r.parent_town, s.slug as session, c.slug as camp
        from public.registrations r join public.sessions s on s.id = r.session_id join public.camps c on c.id = r.camp_id`;
    expect(reg).toMatchObject({
      player_name: "Alex Rivera", player_age: 10, parent_name: "Jamie Rivera", parent_phone: "+16175550199",
      parent_town: "Brookline", session: "summer", camp: "arlington_catholic_2027",
    });
  });

  it("sells Watertown's \"both\" option as two registrations in one payment", async () => {
    const res = await siteCall(post("/api/site/checkout", { ...campForm, campId: "watertown_2027", session: "both" }));
    const { url } = (await res.json()) as { url: string };
    expect(deps.payments.sessions.get(sessionIdFrom(url))!.amountTotal).toBe(83000);
    await pay(url);
    const regs = await db`select s.slug from public.registrations r join public.sessions s on s.id = r.session_id order by r.line_no`;
    expect(regs.map((r) => r.slug)).toEqual(["week1", "week2"]);
  });

  it("answers in the site's { error } shape for bad sessions, ages, info-only camps and missing fields", async () => {
    const bad = async (body: Record<string, unknown>) => {
      const res = await siteCall(post("/api/site/checkout", body));
      expect(res.status).toBe(400);
      return ((await res.json()) as { error: string }).error;
    };
    expect(await bad({ ...campForm, session: "nope" })).toBe("Please choose a camp session.");
    expect(await bad({ ...campForm, campId: "unknown_camp" })).toBe("Please choose a camp session.");
    expect(await bad({ ...campForm, playerAge: "15" })).toBe("This session is for ages 6–13.");
    expect(await bad({ ...campForm, campId: "bbn_2027", session: "full" })).toBe("This camp registers through the host school.");
    expect(await bad({ ...campForm, town: "" })).toBe("Please fill in your town.");
  });

  it("closes a camp at its closing time", async () => {
    await db`update public.sessions set closes_at = now() - interval '1 minute' where slug = 'full' and camp_id = (select id from public.camps where slug = 'veterans_canton_2026')`;
    const res = await siteCall(post("/api/site/checkout", { ...campForm, campId: "veterans_canton_2026", session: "full" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "session_closed" });
    const access = await (await siteCall(get("/api/site/camp-access?campId=veterans_canton_2026"))).json();
    expect(access).toMatchObject({ open: false, closed: true, gated: false });
  });
});

describe("site adapter: Miami", () => {
  it("maps the site's combine form, gates on the access code and asks Stripe for the missing fields", async () => {
    await miamiCodeWindow();
    let res = await siteCall(post("/api/site/checkout", { ...miamiForm, accessCode: "WRONG" }));
    expect(res.status).toBe(403);

    res = await siteCall(post("/api/site/checkout", miamiForm));
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const mock = deps.payments.sessions.get(sessionIdFrom(url))!;
    expect(mock.amountTotal).toBe(150000);
    expect(mock.input.cancelUrl).toBe("https://footyupp.test/cancel?camp=miami");
    expect(mock.input.customFields!.map((f) => f.key)).toEqual(["emergency_phone", "short_size"]);

    await pay(url);
    const [reg] = await db`
      select player_first_name, player_last_name, player_sex, player_height_in, miami_group, via_access_code,
             emergency_phone, short_size, shirt_size, parent_first_name, parent_last_name, ship_state, extra
        from public.registrations`;
    expect(reg).toMatchObject({
      player_first_name: "Taylor Ann", player_last_name: "Brooks", player_sex: "girl", player_height_in: 66,
      miami_group: "girls", via_access_code: true, emergency_phone: "617-555-0123", short_size: "Adult XS",
      shirt_size: "Adult S", parent_first_name: "Morgan", parent_last_name: "Brooks", ship_state: "FL",
    });
    expect(reg!.extra).toMatchObject({ gradYear: "2028" });
  });

  it("enforces the combine's age range", async () => {
    await miamiCodeWindow();
    const res = await siteCall(post("/api/site/checkout", { ...miamiForm, playerAge: "12" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("The girls combine is for ages 14–18.");
  });

  it("camp-access reports the gate and checks the code like the site's old endpoint", async () => {
    const before = await (await siteCall(get("/api/site/camp-access?campId=miami_combine_2027"))).json();
    expect(before).toMatchObject({ open: false, closed: false });

    await miamiCodeWindow();
    const status = await (await siteCall(get("/api/site/camp-access?campId=miami_combine_2027"))).json();
    expect(status).toMatchObject({ open: true, gated: true });

    const wrong = await siteCall(post("/api/site/camp-access", { campId: "miami_combine_2027", code: "NOPE" }));
    expect(wrong.status).toBe(403);
    const right = await siteCall(post("/api/site/camp-access", { campId: "miami_combine_2027", code: "test-code-123" }));
    expect(await right.json()).toMatchObject({ ok: true, gated: true });
  });
});

describe("site adapter: private training", () => {
  it("saves inquiries, adds the contact and notifies the admin", async () => {
    const res = await siteCall(post("/api/site/inquiry", {
      name: "Pat Lee", email: "pat@example.test", phone: "617-555-0101", players: "2", bundle: "Group of 2 — 5 Sessions", ages: "9, 11", notes: "Weekends please",
    }));
    expect(await res.json()).toEqual({ success: true });
    const [row] = await db`select parent_name, players, bundle, player_ages, message from public.private_training_requests`;
    expect(row).toMatchObject({ parent_name: "Pat Lee", players: "2", bundle: "Group of 2 — 5 Sessions", player_ages: "9, 11", message: "Weekends please" });
    const [contact] = await db`select sources from public.contacts where email = 'pat@example.test'`;
    expect(contact!.sources).toEqual(["private_training"]);

    const bot = await siteCall(post("/api/site/inquiry", { name: "Bot", email: "bot@example.test", phone: "617-555-0102", website: "spam" }));
    expect(await bot.json()).toEqual({ success: true });
    expect(await countRows(db, "private_training_requests")).toBe(1);
  });

  it("records a bought package with the player Stripe collected", async () => {
    expect((await siteCall(post("/api/site/checkout-training", { packageId: "nope" }))).status).toBe(400);
    const res = await siteCall(post("/api/site/checkout-training", { packageId: "individual_5" }));
    const { url } = (await res.json()) as { url: string };
    expect(deps.payments.sessions.get(sessionIdFrom(url))!.amountTotal).toBe(55000);
    await pay(url);
    const [row] = await db`select package_id, package_name, email, phone, player_name, player_age, status from public.training_purchases`;
    expect(row).toMatchObject({
      package_id: "individual_5", package_name: "Individual — 5 Sessions (1 hr 30 min each)", email: "stripe-asked@example.test",
      phone: "+16175550199", player_name: "Mock Answer", player_age: "12", status: "new",
    });
  });
});

describe("site adapter: catalog", () => {
  it("publishes dashboard prices, spots and options in the site's ids", async () => {
    await db`update public.sessions set price_cents = 52500, capacity = 30 where slug = 'summer'`;
    const body = (await (await siteCall(get("/api/site/catalog"))).json()) as any;
    expect(body.camps.arlington_catholic_2027.sessions.summer).toMatchObject({ price: 525, spotsLeft: 30, minAge: 6, maxAge: 13, open: true });
    expect(body.camps.watertown_2027.sessions.both).toMatchObject({ price: 830 });
    expect(body.miami).toMatchObject({ id: "miami_combine_2027", price: 1500 });
    expect(body.miami.priceTiers).toHaveLength(2);
    expect(body.miami.options.positions).toContain("Winger");
    expect(body.trainingPackages.group2_7).toMatchObject({ price: 1000 });
  });
});

describe("payments from the site's original checkout (before the switch)", () => {
  const legacy = (id: string, amount: number, metadata: Record<string, string>) =>
    deps.payments.signedEvent("checkout.session.completed", {
      id, payment_status: "paid", amount_total: amount, amount_subtotal: amount, currency: "usd",
      payment_intent: `pi_${id}`, metadata, customer_details: { email: metadata.parent_email, phone: "+16175550111" },
    });

  it("turns old camp metadata into registrations, once", async () => {
    const event = legacy("cs_old_camp", 83000, {
      camp_id: "watertown_2027", session_id: "both", player_name: "Sam Rivera", player_age: "9",
      parent_name: "Jamie Rivera", parent_email: "jamie@example.test", town: "Watertown",
    });
    expect(await (await deliver(deps, event)).json()).toMatchObject({ result: "registered" });
    expect(await (await deliver(deps, event)).json()).toMatchObject({ result: "duplicate" });
    const replay = deps.payments.signedEvent("checkout.session.completed", JSON.parse(event.body).data.object, "backfill_cs_old_camp");
    expect(await (await deliver(deps, replay)).json()).toMatchObject({ result: "already_completed" });
    const regs = await db`select player_name, parent_phone, parent_town, price_cents from public.registrations order by line_no`;
    expect(regs.map((r) => r.price_cents)).toEqual([41500, 41500]);
    expect(regs[0]).toMatchObject({ player_name: "Sam Rivera", parent_phone: "+16175550111", parent_town: "Watertown" });
  });

  it("turns old combine metadata into a Miami registration", async () => {
    await deliver(deps, legacy("cs_old_miami", 150000, {
      camp_id: "miami_combine_2027", session_id: "boys", player_name: "Chris Day", player_age: "17", player_email: "chris@example.test",
      player_height: "5' 11\"", player_weight_lb: "160", position: "Striker", club: "Test FC", clothing_size: "Adult M",
      parent_name: "Robin Day", parent_email: "robin@example.test", parent_phone: "305-555-0100",
      address_line1: "2 Test Ave", address_city: "Miami", address_state: "FL", address_zip: "33184", access_code: "verified",
    }));
    const [reg] = await db`select miami_group, player_height_in, via_access_code, parent_phone from public.registrations`;
    expect(reg).toMatchObject({ miami_group: "boys", player_height_in: 71, via_access_code: true, parent_phone: "305-555-0100" });
  });

  it("records old training package purchases", async () => {
    const event = deps.payments.signedEvent("checkout.session.completed", {
      id: "cs_old_training", payment_status: "paid", amount_total: 64000, amount_subtotal: 64000, currency: "usd", payment_intent: "pi_old_training",
      metadata: { package_id: "individual_7", package_name: "Individual — 7 Sessions (1 hr 30 min each)" },
      customer_details: { email: "lee@example.test", name: "Lee Park", phone: "+16175550122" },
      custom_fields: [{ key: "player_name", type: "text", text: { value: "Jo Park" } }, { key: "player_age", type: "text", text: { value: "11" } }],
    });
    expect(await (await deliver(deps, event)).json()).toMatchObject({ result: "training_recorded" });
    const [row] = await db`select package_id, parent_name, player_name, player_age from public.training_purchases`;
    expect(row).toMatchObject({ package_id: "individual_7", parent_name: "Lee Park", player_name: "Jo Park", player_age: "11" });
  });
});
