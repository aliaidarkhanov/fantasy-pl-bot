import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { migrationsFolder, type Database } from "./client";
import * as schema from "./schema";

/** Postgres в памяти (PGlite) с применёнными миграциями — для тестов */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as Database, close: () => client.close() };
}
