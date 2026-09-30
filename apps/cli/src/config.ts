import fs from "node:fs";
import path from "node:path";

export interface Config {
  leagueId: number;
  myId: number | null;
  /** Куда сохранять накопленные очки между запусками */
  dataFile: string;
}

const CONFIG_FILE = path.resolve(process.env.FPL_CONFIG ?? "config.json");

function parseId(value: unknown, field: string, required: boolean): number | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`В ${CONFIG_FILE} не указан ${field}.`);
    return null;
  }
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(
      `${field} в ${CONFIG_FILE} должен быть положительным целым числом, получено: ${JSON.stringify(value)}`,
    );
  }
  return id;
}

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(
      `Не найден ${CONFIG_FILE}. Скопируйте config.example.json в config.json и впишите league_id и my_id.`,
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Не удалось прочитать ${CONFIG_FILE}: ${(err as Error).message}`, {
      cause: err,
    });
  }

  return {
    leagueId: parseId(raw.league_id, "league_id", true)!,
    myId: parseId(raw.my_id, "my_id", false),
    dataFile: path.resolve(
      path.dirname(CONFIG_FILE),
      typeof raw.data_file === "string" ? raw.data_file : "data/state.json",
    ),
  };
}
