import { getSql, type Sql } from "./db.js";
import { BrevoMailer, LogMailer, MemoryMailer, type Mailer } from "./email.js";
import { BrevoProvider, MockEmailProvider, NoEmailProvider, type EmailProvider } from "../email/provider.js";
import { unsubscribeUrl } from "../email/links.js";
import { loadEnv, type Env } from "./env.js";
import { MockGateway, StripeGateway, type PaymentsGateway } from "./payments.js";

export interface Deps {
  db: Sql;
  env: Env;
  payments: PaymentsGateway;
  mailer: Mailer;
  /** Campaign email provider (Brevo). */
  email: EmailProvider;
}

export function createDeps(env: Env): Deps {
  const payments =
    env.paymentsMode === "stripe"
      ? new StripeGateway(env.stripeSecretKey!, env.stripeWebhookSecret)
      : new MockGateway(env.siteUrl, env.stripeWebhookSecret);
  // Without Brevo: locally, emails are kept in memory (see /__mock/outbox); on Vercel, they're logged and campaigns are refused.
  const mailer = env.brevoApiKey
    ? new BrevoMailer(env.brevoApiKey, { email: env.emailFrom, name: env.emailFromName })
    : env.onVercel
      ? new LogMailer()
      : new MemoryMailer();
  const email = env.brevoApiKey
    ? new BrevoProvider(env.brevoApiKey)
    : env.onVercel
      ? new NoEmailProvider()
      : new MockEmailProvider((address) => unsubscribeUrl(env, address));
  return { db: getSql(env.databaseUrl), env, payments, mailer, email };
}

let shared: Deps | undefined;

export function getDeps(): Deps {
  shared ??= createDeps(loadEnv());
  return shared;
}

/** Lets the local dev server and tests swap in their own dependencies. */
export function setDeps(deps: Deps): void {
  shared = deps;
}
