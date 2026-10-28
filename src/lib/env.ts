export interface Env {
  databaseUrl: string;
  siteUrl: string;
  isProduction: boolean;
  paymentsMode: "stripe" | "mock";
  stripeSecretKey: string | undefined;
  stripeWebhookSecret: string;
  brevoApiKey: string | undefined;
  emailFrom: string;
  emailFromName: string;
  turnstileSecretKey: string | undefined;
  cronSecret: string | undefined;
  rateLimitSalt: string;
  /** Supabase project URL and publishable (anon) key, used to verify admin logins. */
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  /** Without Supabase configured, local development uses a signed dev login instead. */
  adminAuthMode: "supabase" | "dev" | "unconfigured";
}

const MOCK_WEBHOOK_SECRET = "whsec_local_mock_only";

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const isProduction = source.VERCEL_ENV === "production";
  const stripeSecretKey = source.STRIPE_SECRET_KEY || undefined;

  const requestedMode = source.PAYMENTS_MODE;
  if (requestedMode && requestedMode !== "stripe" && requestedMode !== "mock") {
    throw new Error(`PAYMENTS_MODE must be "stripe" or "mock", got "${requestedMode}"`);
  }
  const paymentsMode = (requestedMode as Env["paymentsMode"] | undefined) ?? (stripeSecretKey ? "stripe" : "mock");

  if (isProduction && paymentsMode === "mock") {
    throw new Error("Mock payments are not allowed in production. Set STRIPE_SECRET_KEY.");
  }
  if (paymentsMode === "stripe" && !stripeSecretKey) {
    throw new Error("PAYMENTS_MODE=stripe requires STRIPE_SECRET_KEY");
  }

  const stripeWebhookSecret =
    paymentsMode === "stripe" ? required(source, "STRIPE_WEBHOOK_SECRET") : source.STRIPE_WEBHOOK_SECRET || MOCK_WEBHOOK_SECRET;

  const supabaseUrl = source.SUPABASE_URL?.replace(/\/+$/, "") || undefined;
  const supabaseAnonKey = source.SUPABASE_ANON_KEY || undefined;
  // The dev login is for local machines only; on Vercel admin login needs Supabase.
  const adminAuthMode: Env["adminAuthMode"] = supabaseUrl && supabaseAnonKey ? "supabase" : source.VERCEL_ENV ? "unconfigured" : "dev";

  return {
    supabaseUrl,
    supabaseAnonKey,
    adminAuthMode,
    databaseUrl: required(source, "DATABASE_URL"),
    siteUrl: (source.PUBLIC_SITE_URL || "http://localhost:4319").replace(/\/+$/, ""),
    isProduction,
    paymentsMode,
    stripeSecretKey,
    stripeWebhookSecret,
    brevoApiKey: source.BREVO_API_KEY || undefined,
    emailFrom: source.EMAIL_FROM || "no-reply@footyupp.net",
    emailFromName: source.EMAIL_FROM_NAME || "Footy Up",
    turnstileSecretKey: source.TURNSTILE_SECRET_KEY || undefined,
    cronSecret: source.CRON_SECRET || undefined,
    rateLimitSalt: isProduction ? required(source, "RATE_LIMIT_SALT") : source.RATE_LIMIT_SALT || "local-dev-salt",
  };
}
