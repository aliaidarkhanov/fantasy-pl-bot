import type { CaptainResult } from "./captain";
import type { GameweekState } from "./league-state";

export interface EventInput {
  id: number;
  finished: boolean;
  data_checked: boolean;
}

export interface FixtureInput {
  team_h: number;
  team_a: number;
  kickoff_time: string | null;
  finished: boolean;
  finished_provisional: boolean;
}

const londonDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" });

export const isFixtureDone = (f: FixtureInput) => f.finished || f.finished_provisional;

/** Дни тура (YYYY-MM-DD по Лондону), в которые все матчи уже доиграны */
export function getCompletedDays(fixtures: readonly FixtureInput[]): string[] {
  const byDay = new Map<string, FixtureInput[]>();
  for (const f of fixtures) {
    if (!f.kickoff_time) continue; // перенесённые матчи без даты
    const day = londonDate.format(new Date(f.kickoff_time));
    byDay.set(day, [...(byDay.get(day) ?? []), f]);
  }
  return [...byDay.entries()]
    .filter(([, list]) => list.every(isFixtureDone))
    .map(([day]) => day)
    .sort();
}

/**
 * Сыграла ли команда все свои матчи тура. В двойном туре — оба матча.
 * Команда без матчей в туре считается «доигравшей».
 */
export function isTeamDone(
  teamId: number,
  event: EventInput,
  gwFixtures: readonly FixtureInput[],
): boolean {
  return (
    event.finished ||
    gwFixtures.filter((f) => f.team_h === teamId || f.team_a === teamId).every(isFixtureDone)
  );
}

export interface GameweekPlan {
  status: GameweekState["status"];
  completedDays: string[];
  /** Появились новые завершённые данные — пересчитываем всех */
  dataChanged: boolean;
  /** Участники, которых ещё нет в сохранённом туре (вступили в лигу позже) */
  missing: number[];
  /** Кого нужно (пере)считать */
  toFetch: number[];
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Решает, нужно ли пересчитывать тур и для кого.
 * null — тур ещё не начался (нет ни одного завершённого дня) или ничего не изменилось.
 */
export function planGameweekUpdate(input: {
  event: EventInput;
  gwFixtures: readonly FixtureInput[];
  prev: GameweekState | undefined;
  entryIds: readonly number[];
}): GameweekPlan | null {
  const { event, gwFixtures, prev, entryIds } = input;
  const isFinal = event.finished && event.data_checked;
  const completedDays = event.finished
    ? getCompletedDays(gwFixtures.map((f) => ({ ...f, finished: true })))
    : getCompletedDays(gwFixtures);

  // Считаем тур только если он закончен или закончен хотя бы один игровой день
  if (!event.finished && completedDays.length === 0) return null;

  const dataChanged =
    !prev || (isFinal && prev.status !== "final") || !sameList(prev.completedDays, completedDays);
  const missing = entryIds.filter((id) => !prev || !(String(id) in prev.captains));

  if (!dataChanged && missing.length === 0) return null;

  return {
    status: isFinal ? "final" : "provisional",
    completedDays,
    dataChanged,
    missing,
    toFetch: dataChanged ? [...entryIds] : missing,
  };
}

/** Собирает новое состояние тура из плана и только что посчитанных результатов */
export function applyGameweekUpdate(
  plan: GameweekPlan,
  prev: GameweekState | undefined,
  results: Record<string, CaptainResult | null>,
  updatedAt: string,
): GameweekState {
  return {
    status: plan.status,
    completedDays: plan.completedDays,
    updatedAt,
    captains: { ...(plan.dataChanged ? {} : prev?.captains), ...results },
  };
}
