import type { CaptainResult } from "./captain";
import type { GameweekState, LeagueState } from "./league-state";

export interface StandingRow {
  entryId: number;
  manager: string;
  team: string;
  /** Место; при равенстве очков у менеджеров одно место */
  place: number;
  /** Сумма очков капитанства за все туры */
  total: number;
  /** Туры, в которых был сыгран Triple Captain */
  tcUsed: number[];
  /** Результат последнего тура; null — нет состава или менеджер ещё не посчитан */
  last: CaptainResult | null;
}

export interface Standings {
  gwIds: number[];
  lastGwId: number;
  lastGw: GameweekState;
  rows: StandingRow[];
}

/** Рейтинг лиги по очкам капитанства. null — ещё нет ни одного посчитанного тура. */
export function buildStandings(state: LeagueState): Standings | null {
  const gwIds = Object.keys(state.gameweeks)
    .map(Number)
    .sort((a, b) => a - b);
  const lastGwId = gwIds.at(-1);
  const lastGw = lastGwId === undefined ? undefined : state.gameweeks[lastGwId];
  if (lastGwId === undefined || !lastGw) return null;

  const rows = Object.entries(state.entries).map(([id, info]) => {
    let total = 0;
    const tcUsed: number[] = [];
    for (const gw of gwIds) {
      const r = state.gameweeks[gw]?.captains[id];
      if (!r) continue;
      total += r.points;
      if (r.tripleCaptain) tcUsed.push(gw);
    }
    return {
      entryId: Number(id),
      manager: info.manager,
      team: info.team,
      place: 0,
      total,
      tcUsed,
      last: lastGw.captains[id] ?? null,
    };
  });

  rows.sort((a, b) => b.total - a.total || a.manager.localeCompare(b.manager));
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.place = prev && prev.total === r.total ? prev.place : i + 1;
  });

  return { gwIds, lastGwId, lastGw, rows };
}
