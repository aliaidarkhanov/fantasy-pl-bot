#!/usr/bin/env node
import { loadConfig } from "./config";
import { formatReport } from "./report";
import { loadState } from "./state";
import { updateLeague } from "./update";

const HELP = `Использование:
  node dist/cli.js update-league [--force]   проверить новые данные, пересчитать и показать таблицу
  node dist/cli.js show                      показать сохранённую таблицу без запросов к FPL

  --force   пересчитать все туры с нуля`;

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "update-league": {
      const cfg = loadConfig();
      console.log("Проверяю данные FPL...");
      const { state, changes } = await updateLeague(cfg, { force: args.includes("--force") });
      console.log(changes.length ? changes.join("\n") : "Новых завершённых дней или туров нет.");
      console.log("\n" + formatReport(state, cfg.myId));
      break;
    }
    case "show": {
      const cfg = loadConfig();
      const state = loadState(cfg.dataFile);
      if (!state || state.leagueId !== cfg.leagueId) {
        console.log("Данных для этой лиги ещё нет. Запустите update-league.");
        return;
      }
      console.log(formatReport(state, cfg.myId));
      break;
    }
    default:
      console.log(HELP);
      if (command && command !== "help" && command !== "--help") process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Ошибка:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
