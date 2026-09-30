import fs from "node:fs";
import path from "node:path";
import type { LeagueState } from "@fpl/core";

export function loadState(file: string): LeagueState | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as LeagueState;
}

export function saveState(file: string, state: LeagueState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Пишем во временный файл и переименовываем — чтобы при сбое не получить битый JSON
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}
