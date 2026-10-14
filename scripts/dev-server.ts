/**
 * Local stand-in for `vercel dev`: serves every function in api/ on one port,
 * plus a fake Stripe Checkout page when PAYMENTS_MODE=mock.
 */
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDeps, setDeps } from "../src/lib/deps.js";
import { loadEnv } from "../src/lib/env.js";
import { MockGateway } from "../src/lib/payments.js";

const port = Number(process.env.PORT ?? 4319);
const env = loadEnv();
const deps = createDeps(env);
setDeps(deps);

const apiRoot = resolve("api");

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  headers.set("x-forwarded-for", req.socket.remoteAddress ?? "127.0.0.1");
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Footy Up API (local)</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#0f172a}code{background:#f1f5f9;padding:2px 6px;border-radius:4px}
button{font:inherit;padding:10px 18px;border-radius:8px;border:0;margin-right:8px;cursor:pointer}.pay{background:#16a34a;color:#fff}.cancel{background:#e2e8f0}
.box{border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0}li{margin:4px 0}</style></head><body>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function resolveApi(pathname: string): Promise<Record<string, unknown> | null> {
  const rel = pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  if (rel.includes("..")) return null;
  for (const candidate of [`${rel}.ts`, join(rel, "index.ts")]) {
    const file = join(apiRoot, candidate);
    if (file.startsWith(apiRoot) && existsSync(file)) return import(pathToFileURL(file).href);
  }
  return null;
}

async function mockCheckout(req: Request, url: URL): Promise<Response> {
  const gateway = deps.payments;
  if (!(gateway instanceof MockGateway)) return html("<p>Mock checkout is only available with PAYMENTS_MODE=mock.</p>", 404);
  const [, , , id, action] = url.pathname.split("/");
  const session = id ? gateway.sessions.get(id) : undefined;
  if (!session) return html("<p>Unknown or restarted checkout session.</p>", 404);

  if (req.method === "POST" && (action === "pay" || action === "cancel")) {
    const delivery = action === "pay" ? gateway.complete(session.id) : gateway.expire(session.id);
    const webhook = await fetch(`http://localhost:${port}/api/stripe/webhook`, {
      method: "POST",
      headers: { "stripe-signature": delivery.signature, "content-type": "application/json" },
      body: delivery.body,
    });
    if (!webhook.ok) return html(`<p>Webhook failed with status ${webhook.status}.</p>`, 500);
    const target = action === "pay" ? session.input.successUrl.replace("{CHECKOUT_SESSION_ID}", session.id) : session.input.cancelUrl;
    return new Response(null, { status: 303, headers: { location: target } });
  }

  const total = (session.amountTotal / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const items = session.input.lines
    .map((l) => `<li>${l.quantity} × ${l.name} — ${(l.unitAmountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</li>`)
    .join("");
  return html(`<h1>Mock Stripe Checkout</h1><p>Local testing only. No money moves.</p>
    <div class="box"><ul>${items}</ul><p><strong>Total: ${total}</strong></p>
    <form method="post" style="display:inline" action="/__mock/checkout/${session.id}/pay"><button class="pay">Pay (test)</button></form>
    <form method="post" style="display:inline" action="/__mock/checkout/${session.id}/cancel"><button class="cancel">Abandon checkout</button></form></div>`);
}

const server = createServer(async (nodeReq, nodeRes) => {
  try {
    const req = await toRequest(nodeReq);
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) {
      const mod = await resolveApi(url.pathname);
      const handler = mod?.[req.method] as ((r: Request) => Promise<Response>) | undefined;
      if (!mod) return send(nodeRes, Response.json({ error: "not_found", message: "No such endpoint" }, { status: 404 }));
      if (!handler) return send(nodeRes, Response.json({ error: "method_not_allowed", message: "Method not allowed" }, { status: 405 }));
      return send(nodeRes, await handler(req));
    }
    if (url.pathname.startsWith("/__mock/checkout/")) return send(nodeRes, await mockCheckout(req, url));
    if (url.pathname === "/registration/success") {
      return send(nodeRes, html(`<h1>Registration received</h1><p>Stripe session <code>${url.searchParams.get("session_id") ?? ""}</code>. This placeholder stands in for the success page Ivy Devs builds.</p><p><a href="/">Back</a></p>`));
    }
    if (url.pathname === "/registration/cancelled") {
      return send(nodeRes, html(`<h1>Checkout cancelled</h1><p>The held spot is released. This placeholder stands in for Ivy Devs' page.</p><p><a href="/">Back</a></p>`));
    }
    if (url.pathname === "/") {
      return send(
        nodeRes,
        html(`<h1>Footy Up registration API</h1><p>Local server. Payments: <code>${env.paymentsMode}</code>. Email: <code>${deps.mailer.mode}</code>.</p>
        <ul><li><a href="/api/camps">GET /api/camps</a></li><li><a href="/api/miami">GET /api/miami</a></li>
        <li>POST /api/checkout/camp</li><li>POST /api/miami/verify-code</li><li>POST /api/miami/checkout</li>
        <li>POST /api/private-training</li><li>POST /api/waitlist</li><li>POST /api/stripe/webhook</li><li><a href="/api/cron/cleanup">GET /api/cron/cleanup</a></li></ul>
        <p>Shapes are in <code>docs/api-contract.md</code>.</p>`),
      );
    }
    return send(nodeRes, html("<p>Not found.</p>", 404));
  } catch (err) {
    console.error(err);
    nodeRes.statusCode = 500;
    nodeRes.end("Internal error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Footy Up API listening on http://localhost:${port} (payments: ${env.paymentsMode}, email: ${deps.mailer.mode})`);
});
