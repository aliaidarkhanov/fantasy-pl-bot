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

export interface LeagueState {
  version: 1;
  leagueId: number;
  leagueName: string;
  entries: Record<string, { manager: string; team: string }>;
  gameweeks: Record<string, GameweekState>;
}

export function emptyLeagueState(leagueId: number): LeagueState {
  return { version: 1, leagueId, leagueName: "", entries: {}, gameweeks: {} };
}
