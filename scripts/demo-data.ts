/**
 * Creates fake registrations through the real API and mock Stripe, so the
 * dashboard has something to show. Local only (PAYMENTS_MODE=mock). All names,
 * emails and addresses are invented.
 *
 *   pnpm dev            (in another terminal)
 *   pnpm demo:data [http://localhost:4319]
 */
const base = (process.argv[2] ?? "http://localhost:4319").replace(/\/+$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) {
  console.error("Demo data only runs against a local server.");
  process.exit(1);
}

const first = ["Liam", "Ava", "Noah", "Mia", "Lucas", "Sofia", "Ethan", "Chloe", "Owen", "Grace", "Leo", "Nora", "Caleb", "Ella", "Mason", "Lily"];
const last = ["Carter", "Nguyen", "Patel", "Brooks", "Silva", "Murphy", "Kim", "Rossi", "Hughes", "Ortiz", "Walsh", "Cohen"];
const towns = ["Arlington", "Brookline", "Newton", "Watertown", "Lexington", "Belmont", "Winchester", "Needham"];
const positions = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
const sizes = ["S", "M", "L", "XL"];
const pick = <T>(list: T[], i: number) => list[i % list.length]!;

async function pay(checkoutUrl: string) {
  const id = checkoutUrl.split("/").pop();
  const res = await fetch(`${base}/__mock/checkout/${id}/pay`, { method: "POST", redirect: "manual" });
  if (res.status !== 303) throw new Error(`Mock payment failed (${res.status})`);
}

async function post(path: string, body: unknown, ip: string) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
  const json = (await res.json()) as { checkoutUrl?: string; message?: string };
  if (!res.ok) throw new Error(`${path}: ${json.message ?? res.status}`);
  return json;
}

const camps = (await (await fetch(`${base}/api/camps`)).json()) as { camps: { infoOnly: boolean; sessions: { id: string; status: string }[] }[] };
const sessions = camps.camps.flatMap((c) => (c.infoOnly ? [] : c.sessions.filter((s) => s.status === "open")));

let made = 0;
for (let i = 0; i < 14; i++) {
  const ln = pick(last, i);
  const town = pick(towns, i);
  const parent = { name: `${pick(first, i + 5)} ${ln}`, email: `${pick(first, i + 5).toLowerCase()}.${ln.toLowerCase()}${i}@example.test`, phone: `617-555-01${String(10 + i)}`, town };
  const session = pick(sessions, i);
  const players = [{ name: `${pick(first, i)} ${ln}`, age: 7 + (i % 11), sessionIds: [session.id] }];
  if (i % 4 === 0 && sessions.length > 1) players.push({ name: `${pick(first, i + 3)} ${ln}`, age: 9 + (i % 5), sessionIds: [pick(sessions, i + 1).id] });
  const { checkoutUrl } = await post("/api/checkout/camp", { parent, players, marketingOptIn: i % 2 === 0 }, `10.0.1.${i}`);
  await pay(checkoutUrl!);
  made += players.length;
}

for (let i = 0; i < 18; i++) {
  const ln = pick(last, i + 2);
  const sex = i % 2 ? "girl" : "boy";
  const city = pick(towns, i + 1);
  try {
    const { checkoutUrl } = await post(
      "/api/miami/checkout",
      {
        parent: { firstName: pick(first, i + 7), lastName: ln, email: `${ln.toLowerCase()}.family${i}@example.test`, phone: `781-555-02${String(10 + i)}`, emergencyPhone: `781-555-03${String(10 + i)}` },
        shippingAddress: { line1: `${12 + i} Example Street`, line2: i % 3 === 0 ? `Apt ${i + 1}` : undefined, city, state: "MA", postalCode: "02474" },
        players: [
          {
            firstName: pick(first, i + 1), lastName: ln, age: 14 + (i % 5), sex, heightIn: 62 + (i % 12), weightLb: 115 + i * 3,
            position: pick(positions, i), club: `${city} FC`, email: `player${i}@example.test`, shirtSize: pick(sizes, i), shortSize: pick(sizes, i + 1),
          },
        ],
      },
      `10.0.2.${i}`,
    );
    if (i !== 17) await pay(checkoutUrl!); // leave one in checkout to show a live hold
    made += 1;
  } catch (err) {
    console.warn(`Miami demo skipped: ${(err as Error).message}`);
    break;
  }
}

await post("/api/private-training", { parentName: "Dana Walsh", email: "dana.walsh@example.test", phone: "617-555-0190", town: "Belmont", playerName: "Riley Walsh", playerAge: 12, message: "Looking for weekly 1:1 sessions focused on first touch and finishing, ideally before the spring season.", preferredTimes: "Tue/Thu after 5pm" }, "10.0.3.1");
await post("/api/private-training", { parentName: "Sam Ortiz", email: "sam.ortiz@example.test", phone: "617-555-0191", town: "Newton", playerName: "Mateo Ortiz", playerAge: 15, preferredTimes: "Weekend mornings" }, "10.0.3.2");
console.log(`Created ${made} fake registrations and 2 training requests.`);
