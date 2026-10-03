import fs from "node:fs";
import { createDb } from "@fpl/db";
import { createFplClient } from "@fpl/fpl-client";
import { syncLeague } from "@fpl/sync";
import { loadConfig } from "./config";

function parseLeagueId(args: string[]): number {
  const idx = args.indexOf("--league");
  if (idx === -1) return loadConfig().leagueId;
  const id = Number(args[idx + 1]);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`--league должен быть положительным целым числом, получено: ${args[idx + 1]}`);
  }
  return id;
}

export async function runSync(args: string[]): Promise<void> {
  const leagueId = parseLeagueId(args);
  if (fs.existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Не задан DATABASE_URL (см. .env.example).");

  const { db, close } = createDb(url);
  try {
    console.log(`Синхронизирую лигу ${leagueId}...`);
    const result = await syncLeague(leagueId, {
      db,
      fpl: createFplClient(),
      log: (msg) => console.log(`  ${msg}`),
    });
    console.log(`Лига: ${result.leagueName} · участников: ${result.members}`);
    if (!result.gameweeks.length) {
      console.log("Новых завершённых туров нет — всё уже в БД.");
      return;
    }
    for (const g of result.gameweeks) {
      const skipped = g.withoutPicks ? ` (без состава: ${g.withoutPicks})` : "";
      console.log(`GW${g.gw}: сохранено ${g.synced}${skipped}`);
    }
  } finally {
    await close();
  }
}
