import { and, asc, eq, getTableColumns, inArray, notInArray, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Database } from "./client";
import {
  captainPicks,
  gameweeks,
  leagueMembers,
  leagues,
  managers,
  players,
  type NewCaptainPick,
} from "./schema";

/** SET для ON CONFLICT DO UPDATE: все колонки из вставляемой строки, кроме ключа */
function updateFromExcluded<T extends PgTable>(table: T, except: string[]) {
  const set: Record<string, SQL> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (except.includes(key)) continue;
    set[key] = sql.raw(`excluded."${column.name}"`);
  }
  return set;
}

export async function upsertGameweeks(db: Database, rows: (typeof gameweeks.$inferInsert)[]) {
  if (!rows.length) return;
  await db
    .insert(gameweeks)
    .values(rows)
    .onConflictDoUpdate({ target: gameweeks.id, set: updateFromExcluded(gameweeks, ["id"]) });
}

export async function upsertPlayers(db: Database, rows: (typeof players.$inferInsert)[]) {
  if (!rows.length) return;
  await db
    .insert(players)
    .values(rows)
    .onConflictDoUpdate({ target: players.id, set: updateFromExcluded(players, ["id"]) });
}

export async function upsertLeague(db: Database, league: { id: number; name: string }) {
  await db
    .insert(leagues)
    .values(league)
    .onConflictDoUpdate({ target: leagues.id, set: { name: league.name } });
}

export async function upsertManagers(db: Database, rows: (typeof managers.$inferInsert)[]) {
  if (!rows.length) return;
  await db
    .insert(managers)
    .values(rows)
    .onConflictDoUpdate({
      target: managers.entryId,
      set: updateFromExcluded(managers, ["entryId"]),
    });
}

/** Приводит состав лиги к переданному списку: новых добавляет, ушедших удаляет */
export async function setLeagueMembers(db: Database, leagueId: number, entryIds: number[]) {
  await db
    .delete(leagueMembers)
    .where(
      entryIds.length
        ? and(eq(leagueMembers.leagueId, leagueId), notInArray(leagueMembers.entryId, entryIds))
        : eq(leagueMembers.leagueId, leagueId),
    );
  if (!entryIds.length) return;
  await db
    .insert(leagueMembers)
    .values(entryIds.map((entryId) => ({ leagueId, entryId })))
    .onConflictDoNothing();
}

/** Какие туры уже сохранены для этих менеджеров: entryId → множество gw */
export async function getSyncedGameweeks(
  db: Database,
  entryIds: number[],
): Promise<Map<number, Set<number>>> {
  const result = new Map<number, Set<number>>(entryIds.map((id) => [id, new Set()]));
  if (!entryIds.length) return result;
  const rows = await db
    .select({ entryId: captainPicks.entryId, gw: captainPicks.gw })
    .from(captainPicks)
    .where(inArray(captainPicks.entryId, entryIds));
  for (const r of rows) result.get(r.entryId)?.add(r.gw);
  return result;
}

export async function upsertCaptainPicks(db: Database, rows: NewCaptainPick[]) {
  if (!rows.length) return;
  await db
    .insert(captainPicks)
    .values(rows)
    .onConflictDoUpdate({
      target: [captainPicks.entryId, captainPicks.gw],
      set: updateFromExcluded(captainPicks, ["entryId", "gw"]),
    });
}

export async function markLeagueSynced(db: Database, leagueId: number, at: Date) {
  await db.update(leagues).set({ lastSyncedAt: at }).where(eq(leagues.id, leagueId));
}

export async function listLeagueIds(db: Database): Promise<number[]> {
  const rows = await db.select({ id: leagues.id }).from(leagues).orderBy(asc(leagues.id));
  return rows.map((r) => r.id);
}

export async function getLeague(db: Database, leagueId: number) {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  return league ?? null;
}

export async function getLeagueMembers(db: Database, leagueId: number) {
  return db
    .select(getTableColumns(managers))
    .from(leagueMembers)
    .innerJoin(managers, eq(managers.entryId, leagueMembers.entryId))
    .where(eq(leagueMembers.leagueId, leagueId))
    .orderBy(asc(managers.entryId));
}

/** Все сохранённые капитаны участников лиги, по порядку туров */
export async function getLeagueCaptainPicks(db: Database, leagueId: number) {
  return db
    .select(getTableColumns(captainPicks))
    .from(captainPicks)
    .innerJoin(leagueMembers, eq(leagueMembers.entryId, captainPicks.entryId))
    .where(eq(leagueMembers.leagueId, leagueId))
    .orderBy(asc(captainPicks.gw), asc(captainPicks.entryId));
}
