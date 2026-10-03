import {
  getLeague,
  getLeagueCaptainPicks,
  getLeagueMembers,
  type CaptainPick,
  type Database,
} from "@fpl/db";
import { createTestDb } from "@fpl/db/testing";
import { createFplClient, FPL_BASE_URL } from "@fpl/fpl-client";
import bootstrapRaw from "@fpl/fpl-client/fixtures/bootstrap-static.json";
import liveGw3 from "@fpl/fpl-client/fixtures/live-gw3.json";
import liveGw5 from "@fpl/fpl-client/fixtures/live-gw5.json";
import picksVice from "@fpl/fpl-client/fixtures/picks-2749551-gw3.json";
import picksTc from "@fpl/fpl-client/fixtures/picks-3009035-gw5.json";
import picksRegular from "@fpl/fpl-client/fixtures/picks-7294-gw5.json";
import standingsRaw from "@fpl/fpl-client/fixtures/standings-1941-page1.json";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { syncAllLeagues, syncLeague, type SyncOptions } from "./sync";

const LEAGUE_ID = 1941;
const REGULAR = 7294;
const TC = 3009035;
const VICE = 2749551;

/**
 * Мок FPL API на реальных фикстурах. Финальными считаются только GW3 и GW5 —
 * для них есть live. GW6 «закончен, но не проверен FPL» и не должен попасть в БД.
 */
const bootstrap = {
  ...bootstrapRaw,
  events: bootstrapRaw.events.map((e) => ({
    ...e,
    finished: [3, 5, 6].includes(e.id),
    data_checked: [3, 5].includes(e.id),
  })),
};

/** entryId/gw → picks; нет ключа — 404 (менеджер пропустил тур) */
const picks: Record<string, unknown> = {
  [`${REGULAR}/3`]: picksRegular,
  [`${REGULAR}/5`]: picksRegular,
  [`${TC}/5`]: picksTc,
  [`${VICE}/3`]: picksVice,
  // В GW5 не сыграли ни капитан (Watkins), ни вице (João Pedro)
  [`${VICE}/5`]: picksVice,
};
const live: Record<string, unknown> = { "3": liveGw3, "5": liveGw5 };

let members: number[];
let failLiveFor: string | null;
let requests: string[];

const standings = () => ({
  league: standingsRaw.league,
  standings: {
    has_next: false,
    results: members.map((entry) => ({
      entry,
      entry_name: `Team ${entry}`,
      player_name: `Manager ${entry}`,
    })),
  },
});

const server = setupServer(
  http.get(`${FPL_BASE_URL}/bootstrap-static/`, () => HttpResponse.json(bootstrap)),
  http.get(`${FPL_BASE_URL}/leagues-classic/:id/standings/`, () => HttpResponse.json(standings())),
  http.get(`${FPL_BASE_URL}/event/:gw/live/`, ({ params }) => {
    const gw = String(params.gw);
    if (gw === failLiveFor) return new HttpResponse(null, { status: 500 });
    return live[gw] ? HttpResponse.json(live[gw]) : new HttpResponse(null, { status: 404 });
  }),
  http.get(`${FPL_BASE_URL}/entry/:entry/event/:gw/picks/`, ({ params }) => {
    const body = picks[`${String(params.entry)}/${String(params.gw)}`];
    return body
      ? HttpResponse.json(body)
      : HttpResponse.json({ detail: "Not found." }, { status: 404 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let db: Database;
let close: () => Promise<void>;
let opts: SyncOptions;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  members = [REGULAR, TC, VICE];
  failLiveFor = null;
  requests = [];
  server.events.on("request:start", ({ request }) => {
    requests.push(new URL(request.url).pathname);
  });
  opts = {
    db,
    fpl: createFplClient({ retryDelayMs: 0 }),
    now: () => new Date("2026-09-30T12:00:00Z"),
  };
});

afterEach(async () => {
  server.events.removeAllListeners();
  server.resetHandlers();
  await close();
});

const count = (pattern: RegExp) => requests.filter((r) => pattern.test(r)).length;

async function picksByKey() {
  const rows = await getLeagueCaptainPicks(db, LEAGUE_ID);
  return new Map<string, CaptainPick>(rows.map((r) => [`${r.entryId}/${r.gw}`, r]));
}

describe("syncLeague", () => {
  it("первая синхронизация сохраняет все финальные туры лиги", async () => {
    const result = await syncLeague(LEAGUE_ID, opts);

    expect(result).toEqual({
      leagueId: LEAGUE_ID,
      leagueName: "Test Classic League",
      members: 3,
      gameweeks: [
        { gw: 3, synced: 3, withoutPicks: 1 },
        { gw: 5, synced: 3, withoutPicks: 0 },
      ],
    });
    expect(await getLeague(db, LEAGUE_ID)).toMatchObject({
      name: "Test Classic League",
      lastSyncedAt: new Date("2026-09-30T12:00:00Z"),
    });
    expect((await getLeagueMembers(db, LEAGUE_ID)).map((m) => m.entryId)).toEqual([
      REGULAR,
      VICE,
      TC,
    ]);

    const rows = await picksByKey();
    expect([...rows.keys()].sort()).toEqual(
      [`${REGULAR}/3`, `${REGULAR}/5`, `${TC}/3`, `${TC}/5`, `${VICE}/3`, `${VICE}/5`].sort(),
    );
    // Идущий / непроверенный тур в БД не пишется
    expect([...rows.values()].some((r) => r.gw === 6)).toBe(false);
  });

  it("считает очки капитана и лучший возможный выбор", async () => {
    await syncLeague(LEAGUE_ID, opts);
    const rows = await picksByKey();

    // Обычный тур: Haaland 6 × 2, а лучшим был Hall с 13 очками
    expect(rows.get(`${REGULAR}/5`)).toMatchObject({
      captainPlayerId: 411,
      effectiveCaptainId: 411,
      multiplier: 2,
      basePoints: 6,
      captainPoints: 12,
      viceUsed: false,
      activeChip: "freehit",
      bestPlayerId: 449,
      bestPossiblePoints: 26,
    });
    // Triple Captain: Haaland 6 × 3
    expect(rows.get(`${TC}/5`)).toMatchObject({
      effectiveCaptainId: 411,
      multiplier: 3,
      captainPoints: 18,
      activeChip: "3xc",
      bestPossiblePoints: 18,
    });
    // Капитан Watkins не вышел — повязка у вице João Pedro: 1 × 2
    expect(rows.get(`${VICE}/3`)).toMatchObject({
      captainPlayerId: 55,
      vicePlayerId: 165,
      effectiveCaptainId: 165,
      captainPoints: 2,
      viceUsed: true,
      bestPlayerId: 112,
      bestPossiblePoints: 16,
    });
    // Не сыграли ни капитан, ни вице
    expect(rows.get(`${VICE}/5`)).toMatchObject({
      captainPlayerId: 55,
      effectiveCaptainId: null,
      captainPoints: 0,
      bestPossiblePoints: 28,
    });
    // Пропущенный тур (404 от FPL) — строка без капитана
    expect(rows.get(`${TC}/3`)).toMatchObject({
      captainPlayerId: null,
      multiplier: 0,
      captainPoints: 0,
      bestPossiblePoints: null,
    });
  });

  it("повторный запуск идемпотентен и не запрашивает picks и live", async () => {
    await syncLeague(LEAGUE_ID, opts);
    const before = await getLeagueCaptainPicks(db, LEAGUE_ID);
    requests = [];

    const result = await syncLeague(LEAGUE_ID, opts);

    expect(result.gameweeks).toEqual([]);
    expect(requests).toEqual([
      "/api/bootstrap-static/",
      `/api/leagues-classic/${LEAGUE_ID}/standings/`,
    ]);
    expect(await getLeagueCaptainPicks(db, LEAGUE_ID)).toEqual(before);
  });

  it("новый участник лиги — досчитывается только он", async () => {
    await syncLeague(LEAGUE_ID, opts);
    const NEWCOMER = 555;
    members = [...members, NEWCOMER];
    picks[`${NEWCOMER}/5`] = picksRegular;
    requests = [];

    const result = await syncLeague(LEAGUE_ID, opts);
    delete picks[`${NEWCOMER}/5`];

    expect(result.gameweeks).toEqual([
      { gw: 3, synced: 1, withoutPicks: 1 },
      { gw: 5, synced: 1, withoutPicks: 0 },
    ]);
    expect(count(/\/picks\/$/)).toBe(2);
    expect(count(new RegExp(`/entry/${NEWCOMER}/`))).toBe(2);
    expect((await picksByKey()).get(`${NEWCOMER}/5`)).toMatchObject({ captainPoints: 12 });
  });

  it("вышедший из лиги участник пропадает из состава, но его история остаётся", async () => {
    await syncLeague(LEAGUE_ID, opts);
    members = [REGULAR, VICE];
    await syncLeague(LEAGUE_ID, opts);

    expect((await getLeagueMembers(db, LEAGUE_ID)).map((m) => m.entryId)).toEqual([REGULAR, VICE]);
    const rows = await getLeagueCaptainPicks(db, LEAGUE_ID);
    expect(rows.some((r) => r.entryId === TC)).toBe(false);
  });

  it("сбой FPL посреди синхронизации — сохранённые туры не теряются, повтор продолжает", async () => {
    failLiveFor = "5";
    await expect(syncLeague(LEAGUE_ID, opts)).rejects.toThrow();

    let rows = await picksByKey();
    expect(new Set([...rows.values()].map((r) => r.gw))).toEqual(new Set([3]));
    expect((await getLeague(db, LEAGUE_ID))?.lastSyncedAt).toBeNull();

    failLiveFor = null;
    requests = [];
    const result = await syncLeague(LEAGUE_ID, opts);

    expect(result.gameweeks.map((g) => g.gw)).toEqual([5]);
    expect(count(/\/event\/3\/live\/$/)).toBe(0);
    rows = await picksByKey();
    expect(rows.size).toBe(6);
  });

  it("syncAllLeagues синхронизирует все лиги из БД и загружает bootstrap один раз", async () => {
    await syncLeague(LEAGUE_ID, opts);
    requests = [];

    const results = await syncAllLeagues(opts);

    expect(results.map((r) => r.leagueId)).toEqual([LEAGUE_ID]);
    expect(count(/bootstrap-static/)).toBe(1);
  });
});
