export interface MiamiGroupRow {
  grp: "boys" | "girls";
  label: string;
  cap: number;
  paid: number;
  held: number;
  code_taken: number;
  public_taken: number;
  reserved_effective: number;
  left_for_code_holders: number;
  left_for_public: number;
  price_code_holder_cents: number | null;
  price_public_cents: number | null;
  starts_on: string | null;
  ends_on: string | null;
}

export interface Overview {
  me: { email: string };
  event: {
    name: string;
    opens_at: string | null;
    public_opens_at: string | null;
    closes_at: string | null;
    checkout_open: boolean;
    reserved_total: number;
    reserved_until: string | null;
  } | null;
  codes: { active: boolean; required: boolean };
  miami: MiamiGroupRow[];
  byCamp: { camp: string; kind: string; session: string; registrations: number }[];
  totals: { registrations: number; net_cents: number; new_requests: number; waiting: number; legacy_payments: number };
}

export interface Registration {
  id: string;
  created_at: string;
  camp: string;
  camp_kind: string;
  session: string | null;
  session_id: string | null;
  miami_group: "boys" | "girls" | null;
  via_access_code: boolean;
  status: string;
  parent_name: string;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_email: string;
  parent_phone: string;
  emergency_phone: string | null;
  parent_town: string;
  player_name: string;
  player_first_name: string | null;
  player_last_name: string | null;
  player_age: number;
  player_sex: string | null;
  player_email: string | null;
  player_height_in: number | null;
  player_weight_lb: number | null;
  player_position: string | null;
  player_club: string | null;
  shirt_size: string | null;
  short_size: string | null;
  ship_line1: string | null;
  ship_line2: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_postal_code: string | null;
  extra: Record<string, unknown>;
  waiver_status: string;
  waiver_version: number | null;
  waiver_accepted_at: string | null;
  waiver_accepted_name: string | null;
  payment_status: string;
  checkout_total_cents: number;
  discount_cents: number;
  refunded_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string;
}

export interface TrainingRequest {
  id: string;
  created_at: string;
  parent_name: string;
  email: string;
  phone: string;
  town: string;
  player_name: string;
  player_age: number;
  message: string | null;
  preferred_times: string | null;
  status: string;
}

export interface WaitlistEntry {
  id: string;
  created_at: string;
  camp: string;
  session: string | null;
  miami_group: string | null;
  parent_name: string;
  email: string;
  phone: string;
  town: string;
  spots: number;
  status: string;
}

export const programOf = (r: { camp_kind?: string; camp: string; session: string | null; miami_group: string | null }) =>
  r.miami_group ? `Miami – ${r.miami_group === "boys" ? "Boys" : "Girls"}` : `${r.camp} – ${r.session ?? ""}`;
