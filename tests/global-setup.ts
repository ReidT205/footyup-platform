import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { adminUrl, TEST_DB, testUrl } from "./db-url.js";

/** Creates a throwaway database and applies the real migrations to it. */
export default async function setup() {
  const admin = postgres(adminUrl(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${TEST_DB} with (force)`);
  await admin.unsafe(`create database ${TEST_DB}`);
  await admin.end();

  const db = postgres(testUrl(), { max: 1, onnotice: () => {} });
  await db.unsafe(await readFile("supabase/local/supabase-shim.sql", "utf8"));
  const dir = "supabase/migrations";
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
    await db.unsafe(await readFile(join(dir, file), "utf8"));
  }
  await db.end();
}
