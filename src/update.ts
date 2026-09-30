import type { Config } from "./config";
import { computeCaptain } from "./captain";
import {
  getBootstrap,
  getFixtures,
  getLeague,
  getLive,
  getPicks,
  mapLimit,
  type Fixture,
} from "./fpl-api";
import { emptyState, loadState, saveState, type GameweekState, type State } from "./state";

const londonDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" });

const isFixtureDone = (f: Fixture) => f.finished || f.finished_provisional;

/** Дни тура, в которые все матчи уже доиграны */
function getCompletedDays(fixtures: Fixture[]): string[] {
  const byDay = new Map<string, Fixture[]>();
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

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export interface UpdateResult {
  state: State;
  changes: string[];
}

export async function updateLeague(cfg: Config, opts: { force?: boolean } = {}): Promise<UpdateResult> {
  let state = loadState(cfg.dataFile);
  if (!state || state.leagueId !== cfg.leagueId || opts.force) {
    state = emptyState(cfg.leagueId);
  }

  const [bootstrap, fixtures, league] = await Promise.all([
    getBootstrap(),
    getFixtures(),
    getLeague(cfg.leagueId),
  ]);

  state.leagueName = league.name;
  state.entries = Object.fromEntries(
    league.entries.map((e) => [String(e.entry), { manager: e.player_name, team: e.entry_name }])
  );
  const entryIds = league.entries.map((e) => e.entry);

  const elements = new Map(bootstrap.elements.map((el) => [el.id, el]));
  const changes: string[] = [];

  for (const event of bootstrap.events) {
    const gwFixtures = fixtures.filter((f) => f.event === event.id);
    const isFinal = event.finished && event.data_checked;
    const completedDays = event.finished
      ? getCompletedDays(gwFixtures.map((f) => ({ ...f, finished: true })))
      : getCompletedDays(gwFixtures);

    // Считаем тур только если он закончен или закончен хотя бы один игровой день
    if (!event.finished && completedDays.length === 0) continue;

    const prev: GameweekState | undefined = state.gameweeks[event.id];
    const dataChanged =
      !prev ||
      (isFinal && prev.status !== "final") ||
      !sameList(prev.completedDays, completedDays);
    const missing = entryIds.filter((id) => !prev || !(String(id) in prev.captains));

    if (!dataChanged && missing.length === 0) continue;

    const toFetch = dataChanged ? entryIds : missing;
    const live = new Map((await getLive(event.id)).map((el) => [el.id, el.stats]));

    const teamDone = (teamId: number) =>
      isFinal ||
      event.finished ||
      gwFixtures
        .filter((f) => f.team_h === teamId || f.team_a === teamId)
        .every(isFixtureDone);

    const ctx = {
      live,
      playerName: (id: number) => elements.get(id)?.web_name ?? `#${id}`,
      isPlayerDone: (id: number) => {
        const el = elements.get(id);
        return el ? teamDone(el.team) : true;
      },
    };

    const results = await mapLimit(toFetch, 5, async (entryId) => {
      const picks = await getPicks(entryId, event.id);
      return [String(entryId), picks ? computeCaptain(picks, ctx) : null] as const;
    });

    state.gameweeks[event.id] = {
      status: isFinal ? "final" : "provisional",
      completedDays,
      updatedAt: new Date().toISOString(),
      captains: { ...(dataChanged ? {} : prev?.captains), ...Object.fromEntries(results) },
    };

    const what = isFinal
      ? "тур завершён, очки финальные"
      : event.finished
        ? "тур завершён, ждём финальной проверки данных FPL"
        : `завершены дни: ${completedDays.join(", ")}`;
    changes.push(
      dataChanged
        ? `GW${event.id}: ${what}`
        : `GW${event.id}: добавлены новые участники (${missing.length})`
    );

    // Сохраняем после каждого тура — если упадём посередине, прогресс не потеряется
    saveState(cfg.dataFile, state);
  }

  saveState(cfg.dataFile, state);
  return { state, changes };
}
