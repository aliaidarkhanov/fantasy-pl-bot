import fs from "node:fs";
import path from "node:path";
import type { CaptainResult } from "./captain";

export interface GameweekState {
  /** final — тур закрыт и данные проверены FPL; provisional — тур идёт */
  status: "final" | "provisional";
  /** Игровые дни (YYYY-MM-DD, время Лондона), все матчи которых завершены */
  completedDays: string[];
  updatedAt: string;
  /** entryId → результат; null — у менеджера не было состава в этом туре */
  captains: Record<string, CaptainResult | null>;
}

export interface State {
  version: 1;
  leagueId: number;
  leagueName: string;
  entries: Record<string, { manager: string; team: string }>;
  gameweeks: Record<string, GameweekState>;
}

export function emptyState(leagueId: number): State {
  return { version: 1, leagueId, leagueName: "", entries: {}, gameweeks: {} };
}

export function loadState(file: string): State | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as State;
}

export function saveState(file: string, state: State): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Пишем во временный файл и переименовываем — чтобы при сбое не получить битый JSON
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}
