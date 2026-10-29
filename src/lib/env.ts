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
  /** Server-only Supabase secret key; lets admins invite other admins from the dashboard. */
  supabaseServiceRoleKey: string | undefined;
  /** Where Supabase invite links land, e.g. https://<api domain>/admin/ */
  adminUrl: string | undefined;
  /** Public origin of this API, used for unsubscribe links in emails. */
  apiUrl: string;
  /** Shared secret in the Brevo webhook URL (?token=...). */
  brevoWebhookSecret: string | undefined;
  /** Domain authenticated in Brevo for sending (SPF/DKIM/DMARC). */
  emailDomain: string;
  onVercel: boolean;
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

  const siteUrl = (source.PUBLIC_SITE_URL || "http://localhost:4319").replace(/\/+$/, "");
  const adminOrigin = source.PUBLIC_ADMIN_URL ? new URL(source.PUBLIC_ADMIN_URL).origin : undefined;
  const apiUrl = (source.PUBLIC_API_URL || adminOrigin || (source.VERCEL_PROJECT_PRODUCTION_URL ? `https://${source.VERCEL_PROJECT_PRODUCTION_URL}` : siteUrl)).replace(/\/+$/, "");
  const emailFrom = source.EMAIL_FROM || "no-reply@footyupp.net";

  return {
    apiUrl,
    brevoWebhookSecret: source.BREVO_WEBHOOK_SECRET || undefined,
    emailDomain: source.EMAIL_DOMAIN || emailFrom.split("@")[1] || "footyupp.net",
    onVercel: Boolean(source.VERCEL_ENV),
    supabaseUrl,
    supabaseAnonKey,
    adminAuthMode,
    supabaseServiceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY || undefined,
    adminUrl: source.PUBLIC_ADMIN_URL || undefined,
    databaseUrl: required(source, "DATABASE_URL"),
    siteUrl,
    isProduction,
    paymentsMode,
    stripeSecretKey,
    stripeWebhookSecret,
    brevoApiKey: source.BREVO_API_KEY || undefined,
    emailFrom,
    emailFromName: source.EMAIL_FROM_NAME || "Footy Up",
    turnstileSecretKey: source.TURNSTILE_SECRET_KEY || undefined,
    cronSecret: source.CRON_SECRET || undefined,
    rateLimitSalt: isProduction ? required(source, "RATE_LIMIT_SALT") : source.RATE_LIMIT_SALT || "local-dev-salt",
  };
}
