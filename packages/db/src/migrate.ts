import fs from "node:fs";
import { createDb } from "./client";

// Применяет миграции к DATABASE_URL: pnpm db:migrate
if (fs.existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Не задан DATABASE_URL (см. .env.example).");
  process.exit(1);
}

const { migrate, close } = createDb(url);
try {
  await migrate();
  console.log("Миграции применены.");
} finally {
  await close();
}
