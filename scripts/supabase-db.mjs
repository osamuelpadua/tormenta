// Direct Postgres access for the verification scripts. Reads everything from
// the environment; nothing is stored in the repository.
//   SUPABASE_DB_HOST      db.<project-ref>.supabase.co
//   SUPABASE_DB_PASSWORD  database password (Project Settings → Database)
import pg from "pg";
export function client() {
  const host = process.env.SUPABASE_DB_HOST;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!host || !password)
    throw new Error("Defina SUPABASE_DB_HOST e SUPABASE_DB_PASSWORD.");
  return new pg.Client({
    host,
    port: 5432,
    user: "postgres",
    database: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}
