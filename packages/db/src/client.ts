import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

/** Любой Drizzle-клиент Postgres с нашей схемой: postgres.js, PGlite или транзакция */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 5, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return {
    db: db as Database,
    migrate: () => migrate(db, { migrationsFolder }),
    close: () => client.end(),
  };
}
