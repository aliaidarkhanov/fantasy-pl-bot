import {
  applyGameweekUpdate,
  computeCaptain,
  createCaptainContext,
  emptyLeagueState,
  planGameweekUpdate,
  type LeagueState,
} from "@fpl/core";
import { createFplClient, mapLimit, type FplClient } from "@fpl/fpl-client";
import type { Config } from "./config";
import { loadState, saveState } from "./state";

export interface UpdateResult {
  state: LeagueState;
  changes: string[];
}

export async function updateLeague(
  cfg: Config,
  opts: { force?: boolean; client?: FplClient } = {},
): Promise<UpdateResult> {
  const fpl = opts.client ?? createFplClient();
  let state = loadState(cfg.dataFile);
  if (!state || state.leagueId !== cfg.leagueId || opts.force) {
    state = emptyLeagueState(cfg.leagueId);
  }

  const [bootstrap, fixtures, league] = await Promise.all([
    fpl.getBootstrap(),
    fpl.getFixtures(),
    fpl.getLeague(cfg.leagueId),
  ]);

  state.leagueName = league.name;
  state.entries = Object.fromEntries(
    league.entries.map((e) => [String(e.entry), { manager: e.player_name, team: e.entry_name }]),
  );
  const entryIds = league.entries.map((e) => e.entry);
  const changes: string[] = [];

  for (const event of bootstrap.events) {
    const gwFixtures = fixtures.filter((f) => f.event === event.id);
    const prev = state.gameweeks[event.id];
    const plan = planGameweekUpdate({ event, gwFixtures, prev, entryIds });
    if (!plan) continue;

    const ctx = createCaptainContext({
      event,
      gwFixtures,
      elements: bootstrap.elements,
      live: await fpl.getLive(event.id),
    });

    const results = await mapLimit(plan.toFetch, 5, async (entryId) => {
      const picks = await fpl.getPicks(entryId, event.id);
      return [String(entryId), picks ? computeCaptain(picks, ctx) : null] as const;
    });

    state.gameweeks[event.id] = applyGameweekUpdate(
      plan,
      prev,
      Object.fromEntries(results),
      new Date().toISOString(),
    );

    const what =
      plan.status === "final"
        ? "тур завершён, очки финальные"
        : event.finished
          ? "тур завершён, ждём финальной проверки данных FPL"
          : `завершены дни: ${plan.completedDays.join(", ")}`;
    changes.push(
      plan.dataChanged
        ? `GW${event.id}: ${what}`
        : `GW${event.id}: добавлены новые участники (${plan.missing.length})`,
    );

    // Сохраняем после каждого тура — если упадём посередине, прогресс не потеряется
    saveState(cfg.dataFile, state);
  }

  saveState(cfg.dataFile, state);
  return { state, changes };
}
