import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./client";
import {
  getLeague,
  getLeagueCaptainPicks,
  getLeagueMembers,
  getSyncedGameweeks,
  listLeagueIds,
  markLeagueSynced,
  setLeagueMembers,
  upsertCaptainPicks,
  upsertGameweeks,
  upsertLeague,
  upsertManagers,
  upsertPlayers,
} from "./repositories";
import { players, type NewCaptainPick } from "./schema";
import { createTestDb } from "./testing";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await upsertGameweeks(db, [
    {
      id: 1,
      name: "GW1",
      deadline: new Date("2026-08-21T17:30:00Z"),
      finished: true,
      dataChecked: true,
    },
    {
      id: 2,
      name: "GW2",
      deadline: new Date("2026-08-29T10:00:00Z"),
      finished: true,
      dataChecked: true,
    },
  ]);
  await upsertLeague(db, { id: 100, name: "Лига" });
  await upsertManagers(db, [
    { entryId: 1, playerName: "Анна", teamName: "A" },
    { entryId: 2, playerName: "Борис", teamName: "B" },
  ]);
  await setLeagueMembers(db, 100, [1, 2]);
});

afterEach(() => close());

const pick = (entryId: number, gw: number, over: Partial<NewCaptainPick> = {}): NewCaptainPick => ({
  entryId,
  gw,
  captainPlayerId: 10,
  vicePlayerId: 11,
  effectiveCaptainId: 10,
  multiplier: 2,
  basePoints: 6,
  captainPoints: 12,
  viceUsed: false,
  activeChip: null,
  bestPlayerId: 10,
  bestPossiblePoints: 12,
  ...over,
});

describe("репозитории", () => {
  it("upsert обновляет существующие строки, а не дублирует их", async () => {
    await upsertPlayers(db, [{ id: 10, webName: "Haaland", teamId: 15, position: 4 }]);
    await upsertPlayers(db, [{ id: 10, webName: "E.Haaland", teamId: 15, position: 4 }]);
    await upsertManagers(db, [{ entryId: 1, playerName: "Анна", teamName: "Новое имя" }]);
    await upsertLeague(db, { id: 100, name: "Лига 2" });

    expect(await db.select().from(players)).toEqual([
      { id: 10, webName: "E.Haaland", teamId: 15, position: 4 },
    ]);
    expect((await getLeagueMembers(db, 100)).map((m) => m.teamName)).toEqual(["Новое имя", "B"]);
    expect(await getLeague(db, 100)).toMatchObject({ name: "Лига 2", lastSyncedAt: null });
  });

  it("setLeagueMembers убирает вышедших и добавляет новых", async () => {
    await upsertManagers(db, [{ entryId: 3, playerName: "Вера", teamName: "C" }]);
    await setLeagueMembers(db, 100, [2, 3]);
    expect((await getLeagueMembers(db, 100)).map((m) => m.entryId)).toEqual([2, 3]);

    await setLeagueMembers(db, 100, []);
    expect(await getLeagueMembers(db, 100)).toEqual([]);
  });

  it("getSyncedGameweeks возвращает сохранённые туры по менеджерам", async () => {
    await upsertCaptainPicks(db, [pick(1, 1), pick(1, 2), pick(2, 2)]);
    const synced = await getSyncedGameweeks(db, [1, 2, 3]);
    expect([...synced.get(1)!]).toEqual([1, 2]);
    expect([...synced.get(2)!]).toEqual([2]);
    expect(synced.get(3)?.size).toBe(0);
  });

  it("upsertCaptainPicks перезаписывает строку тура", async () => {
    await upsertCaptainPicks(db, [pick(1, 1)]);
    await upsertCaptainPicks(db, [pick(1, 1, { captainPoints: 18, multiplier: 3 })]);
    const rows = await getLeagueCaptainPicks(db, 100);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ captainPoints: 18, multiplier: 3 });
  });

  it("хранит тур без состава как строку без капитана", async () => {
    await upsertCaptainPicks(db, [
      pick(2, 1, {
        captainPlayerId: null,
        vicePlayerId: null,
        effectiveCaptainId: null,
        multiplier: 0,
        basePoints: 0,
        captainPoints: 0,
        bestPlayerId: null,
        bestPossiblePoints: null,
      }),
    ]);
    const [row] = await getLeagueCaptainPicks(db, 100);
    expect(row).toMatchObject({ entryId: 2, captainPlayerId: null, captainPoints: 0 });
  });

  it("отмечает время синхронизации лиги", async () => {
    const at = new Date("2026-09-30T12:00:00Z");
    await markLeagueSynced(db, 100, at);
    expect((await getLeague(db, 100))?.lastSyncedAt).toEqual(at);
    expect(await listLeagueIds(db)).toEqual([100]);
  });
});
