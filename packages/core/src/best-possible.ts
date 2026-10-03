import type { CaptainResult, LiveStats, PicksInput } from "./captain";

export interface LineupPicksInput extends PicksInput {
  picks: readonly (PicksInput["picks"][number] & { position: number })[];
}

export interface BestPossible {
  playerId: number;
  basePoints: number;
  /** basePoints × множитель менеджера (2, или 3 с Triple Captain) */
  points: number;
}

const STARTING_XI = 11;

/**
 * Лучший возможный капитан тура: игрок с максимумом очков среди стартовых 11
 * (среди всех 15 при Bench Boost). Фактический капитан тоже участвует —
 * если он попал в состав автозаменой, «лучший» не окажется хуже реального выбора.
 * При равенстве очков выигрывает игрок выше в составе.
 */
export function computeBestPossible(
  picks: LineupPicksInput,
  live: ReadonlyMap<number, LiveStats>,
  actual: CaptainResult,
): BestPossible | null {
  const multiplier = actual.tripleCaptain ? 3 : 2;
  const benchBoost = picks.active_chip === "bboost";
  const candidates = picks.picks
    .filter((p) => benchBoost || p.position <= STARTING_XI || p.element === actual.playerId)
    .toSorted((a, b) => a.position - b.position);

  let best: BestPossible | null = null;
  for (const p of candidates) {
    const basePoints = live.get(p.element)?.total_points ?? 0;
    if (!best || basePoints > best.basePoints) {
      best = { playerId: p.element, basePoints, points: basePoints * multiplier };
    }
  }
  return best;
}
