import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazy singleton — avoids crash at build time when DATABASE_URL is absent
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const sql = neon(process.env.DATABASE_URL!);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

// Re-export for convenience in non-adapter contexts
export const db = {
  get query() {
    return getDb().query;
  },
  get $client() {
    return getDb().$client;
  },
  insert: (...args: Parameters<ReturnType<typeof drizzle<typeof schema>>["insert"]>) => getDb().insert(...args),
  update: (...args: Parameters<ReturnType<typeof drizzle<typeof schema>>["update"]>) => getDb().update(...args),
  delete: (...args: Parameters<ReturnType<typeof drizzle<typeof schema>>["delete"]>) => getDb().delete(...args),
  select: (...args: Parameters<ReturnType<typeof drizzle<typeof schema>>["select"]>) => getDb().select(...args),
};
