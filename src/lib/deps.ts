import { getSql, type Sql } from "./db.js";
import { BrevoMailer, LogMailer, type Mailer } from "./email.js";
import { loadEnv, type Env } from "./env.js";
import { MockGateway, StripeGateway, type PaymentsGateway } from "./payments.js";

export interface Deps {
  db: Sql;
  env: Env;
  payments: PaymentsGateway;
  mailer: Mailer;
}

export function createDeps(env: Env): Deps {
  const payments =
    env.paymentsMode === "stripe"
      ? new StripeGateway(env.stripeSecretKey!, env.stripeWebhookSecret)
      : new MockGateway(env.siteUrl, env.stripeWebhookSecret);
  const mailer = env.brevoApiKey
    ? new BrevoMailer(env.brevoApiKey, { email: env.emailFrom, name: env.emailFromName })
    : new LogMailer();
  return { db: getSql(env.databaseUrl), env, payments, mailer };
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
