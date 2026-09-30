import type { EntryPicks, LiveElement } from "./fpl-api";

export interface CaptainResult {
  /** Игрок, который реально получил повязку (капитан или вице) */
  playerId: number | null;
  playerName: string | null;
  basePoints: number;
  multiplier: number;
  /** basePoints * multiplier */
  points: number;
  viceUsed: boolean;
  tripleCaptain: boolean;
  /** Капитан ещё может сыграть — очки могут измениться */
  pending: boolean;
}

export interface CaptainContext {
  live: Map<number, LiveElement["stats"]>;
  playerName: (id: number) => string;
  /** Сыграл ли игрок все свои матчи тура (true и для команд без матча в туре) */
  isPlayerDone: (id: number) => boolean;
}

/**
 * Правила FPL: капитан получает x2 (x3 с Triple Captain).
 * Если капитан не вышел на поле и все его матчи сыграны — повязка
 * переходит к вице-капитану. Если не сыграли оба — очков капитана нет.
 */
export function computeCaptain(picks: EntryPicks, ctx: CaptainContext): CaptainResult {
  const tripleCaptain = picks.active_chip === "3xc";
  const multiplier = tripleCaptain ? 3 : 2;
  const captain = picks.picks.find((p) => p.is_captain);
  const vice = picks.picks.find((p) => p.is_vice_captain);

  const played = (id: number) => (ctx.live.get(id)?.minutes ?? 0) > 0;
  const result = (id: number | null, viceUsed: boolean, pending: boolean): CaptainResult => {
    const basePoints = id === null ? 0 : ctx.live.get(id)?.total_points ?? 0;
    return {
      playerId: id,
      playerName: id === null ? null : ctx.playerName(id),
      basePoints,
      multiplier: id === null ? 0 : multiplier,
      points: id === null ? 0 : basePoints * multiplier,
      viceUsed,
      tripleCaptain,
      pending,
    };
  };

  if (!captain) return result(null, false, false);
  if (played(captain.element)) return result(captain.element, false, false);
  // Капитан ещё не играл, но может — ждём
  if (!ctx.isPlayerDone(captain.element)) return result(captain.element, false, true);

  if (!vice) return result(null, false, false);
  if (played(vice.element)) return result(vice.element, true, false);
  if (!ctx.isPlayerDone(vice.element)) return result(vice.element, true, true);
  return result(null, false, false);
}
