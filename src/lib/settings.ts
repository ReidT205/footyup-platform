import type { Db } from "./db.js";

/**
 * Runtime settings stored in the `settings` table, so the client's pending
 * decisions can be changed without a deploy. Missing rows fall back to these
 * defaults. Change them with `pnpm settings set <key> <json>`.
 */
export const SETTING_DEFAULTS = {
  /** Who receives private training notifications. */
  notify_email: null as string | null,
  /** Reply-to on parent emails (Stage 3). */
  reply_to_email: null as string | null,
  /** Postal address required in marketing email footers (Stage 2). */
  mailing_address: null as string | null,
  timezone: "America/New_York",
  /** Require waiver acceptance on camp checkouts once a camp waiver exists. */
  camp_waiver_required: false,
  /** Minutes a camp spot is held during Stripe Checkout (Stripe minimum is 30). */
  camp_hold_minutes: 35,
  default_success_path: "/registration/success",
  default_cancel_path: "/registration/cancelled",
};

export type Settings = typeof SETTING_DEFAULTS;
export type SettingKey = keyof Settings;

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db<{ key: string; value: unknown }[]>`select key, value from public.settings`;
  const merged: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (row.key in SETTING_DEFAULTS) merged[row.key] = row.value;
  }
  return merged as Settings;
}

export function isSettingKey(key: string): key is SettingKey {
  return key in SETTING_DEFAULTS;
}
