import postgres from "postgres";

export type Sql = postgres.Sql;
export type Db = postgres.Sql | postgres.TransactionSql;

const clients = new Map<string, Sql>();

/**
 * One pool per URL, reused across warm serverless invocations. On Supabase use
 * the transaction pooler URL (port 6543); prepared statements are disabled
 * because the pooler does not support them.
 */
export function getSql(url: string, options: { max?: number } = {}): Sql {
  let client = clients.get(url);
  if (!client) {
    client = postgres(url, {
      prepare: false,
      max: options.max ?? 5,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
    clients.set(url, client);
  }
  return client;
}

/** Postgres RAISE EXCEPTION messages used by the capacity functions, e.g. "group_full:boys". */
export function capacityError(err: unknown): { kind: string; subject: string } | null {
  if (err instanceof postgres.PostgresError && err.code === "P0001") {
    const match = /^(group_full|group_closed|unknown_group|session_full):(.+)$/.exec(err.message);
    if (match) return { kind: match[1]!, subject: match[2]! };
  }
  return null;
}
