import {
  computeBestPossible,
  computeCaptain,
  createCaptainContext,
  type CaptainContext,
} from "@fpl/core";
import {
  getSyncedGameweeks,
  listLeagueIds,
  markLeagueSynced,
  setLeagueMembers,
  upsertCaptainPicks,
  upsertGameweeks,
  upsertLeague,
  upsertManagers,
  upsertPlayers,
  type Database,
  type NewCaptainPick,
} from "@fpl/db";
import { mapLimit, type Bootstrap, type EntryPicks, type FplClient } from "@fpl/fpl-client";

export interface SyncOptions {
  db: Database;
  fpl: FplClient;
  /** Сколько запросов picks выполнять одновременно */
  concurrency?: number;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface GameweekSyncResult {
  gw: number;
  /** Сколько менеджеров досчитано в этом туре */
  synced: number;
  /** Из них без состава в туре (404 от FPL) */
  withoutPicks: number;
}

export interface LeagueSyncResult {
  leagueId: number;
  leagueName: string;
  members: number;
  gameweeks: GameweekSyncResult[];
}

/** Тур закрыт и данные проверены FPL — очки больше не изменятся */
const isFinal = (e: Bootstrap["events"][number]) => e.finished && e.data_checked;

async function syncBootstrap(opts: SyncOptions): Promise<Bootstrap> {
  const bootstrap = await opts.fpl.getBootstrap();
  await opts.db.transaction(async (tx) => {
    await upsertGameweeks(
      tx,
      bootstrap.events.map((e) => ({
        id: e.id,
        name: e.name,
        deadline: new Date(e.deadline_time),
        finished: e.finished,
        dataChecked: e.data_checked,
      })),
    );
    await upsertPlayers(
      tx,
      bootstrap.elements.map((el) => ({
        id: el.id,
        webName: el.web_name,
        teamId: el.team,
        position: el.element_type,
      })),
    );
  });
  return bootstrap;
}

function toRow(
  entryId: number,
  gw: number,
  picks: EntryPicks | null,
  ctx: CaptainContext,
): NewCaptainPick {
  if (!picks) {
    return {
      entryId,
      gw,
      captainPlayerId: null,
      vicePlayerId: null,
      effectiveCaptainId: null,
      multiplier: 0,
      basePoints: 0,
      captainPoints: 0,
      viceUsed: false,
      activeChip: null,
      bestPlayerId: null,
      bestPossiblePoints: null,
    };
  }
  const captain = computeCaptain(picks, ctx);
  const best = computeBestPossible(picks, ctx.live, captain);
  return {
    entryId,
    gw,
    captainPlayerId: picks.picks.find((p) => p.is_captain)?.element ?? null,
    vicePlayerId: picks.picks.find((p) => p.is_vice_captain)?.element ?? null,
    effectiveCaptainId: captain.playerId,
    multiplier: captain.tripleCaptain ? 3 : 2,
    basePoints: captain.basePoints,
    captainPoints: captain.points,
    viceUsed: captain.viceUsed,
    activeChip: picks.active_chip,
    bestPlayerId: best?.playerId ?? null,
    bestPossiblePoints: best?.points ?? null,
  };
}

async function syncLeagueWith(
  leagueId: number,
  bootstrap: Bootstrap,
  opts: SyncOptions,
): Promise<LeagueSyncResult> {
  const { db, fpl, concurrency = 5, now = () => new Date(), log = () => {} } = opts;

  const league = await fpl.getLeague(leagueId);
  const entryIds = league.entries.map((e) => e.entry);
  await db.transaction(async (tx) => {
    await upsertLeague(tx, { id: leagueId, name: league.name });
    await upsertManagers(
      tx,
      league.entries.map((e) => ({
        entryId: e.entry,
        playerName: e.player_name,
        teamName: e.entry_name,
      })),
    );
    await setLeagueMembers(tx, leagueId, entryIds);
  });

  const synced = await getSyncedGameweeks(db, entryIds);
  const gameweeks: GameweekSyncResult[] = [];

  for (const event of bootstrap.events.filter(isFinal)) {
    const missing = entryIds.filter((id) => !synced.get(id)?.has(event.id));
    if (!missing.length) continue;

    log(`GW${event.id}: загружаю ${missing.length} из ${entryIds.length} менеджеров`);
    const ctx = createCaptainContext({
      event,
      // Тур завершён — все матчи сыграны, расписание не нужно
      gwFixtures: [],
      elements: bootstrap.elements,
      live: await fpl.getLive(event.id),
    });
    const rows = await mapLimit(missing, concurrency, async (entryId) =>
      toRow(entryId, event.id, await fpl.getPicks(entryId, event.id), ctx),
    );

    // Один INSERT на тур: либо тур записан целиком, либо не записан вовсе
    await upsertCaptainPicks(db, rows);
    gameweeks.push({
      gw: event.id,
      synced: rows.length,
      withoutPicks: rows.filter((r) => r.captainPlayerId === null).length,
    });
  }

  await markLeagueSynced(db, leagueId, now());
  return { leagueId, leagueName: league.name, members: entryIds.length, gameweeks };
}

/**
 * Синхронизирует лигу: участников и все завершённые туры, которых ещё нет в БД.
 * Повторный запуск идемпотентен и не делает лишних запросов picks/live.
 */
export async function syncLeague(leagueId: number, opts: SyncOptions): Promise<LeagueSyncResult> {
  const bootstrap = await syncBootstrap(opts);
  return syncLeagueWith(leagueId, bootstrap, opts);
}

/** Синхронизирует все отслеживаемые лиги (для cron) */
export async function syncLeagues(
  leagueIds: readonly number[],
  opts: SyncOptions,
): Promise<LeagueSyncResult[]> {
  if (!leagueIds.length) return [];
  const bootstrap = await syncBootstrap(opts);
  const results: LeagueSyncResult[] = [];
  // Лиги по очереди: параллельность уже есть внутри, а FPL не любит всплесков запросов
  for (const id of leagueIds) results.push(await syncLeagueWith(id, bootstrap, opts));
  return results;
}

/** Синхронизирует все лиги, которые уже есть в БД */
export async function syncAllLeagues(opts: SyncOptions): Promise<LeagueSyncResult[]> {
  return syncLeagues(await listLeagueIds(opts.db), opts);
}
