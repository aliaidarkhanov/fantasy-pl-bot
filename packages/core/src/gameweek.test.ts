import { fixturesSchema } from "@fpl/fpl-client/schemas";
import fixturesRaw from "@fpl/fpl-client/fixtures/fixtures.json";
import { describe, expect, it } from "vitest";
import type { CaptainResult } from "./captain";
import {
  applyGameweekUpdate,
  getCompletedDays,
  isTeamDone,
  planGameweekUpdate,
  type EventInput,
  type FixtureInput,
} from "./gameweek";
import type { GameweekState } from "./league-state";

const fixture = (over: Partial<FixtureInput> = {}): FixtureInput => ({
  team_h: 1,
  team_a: 2,
  kickoff_time: "2026-09-20T14:00:00Z",
  finished: false,
  finished_provisional: false,
  ...over,
});

const event = (over: Partial<EventInput> = {}): EventInput => ({
  id: 7,
  finished: false,
  data_checked: false,
  ...over,
});

describe("getCompletedDays", () => {
  it("возвращает дни реального завершённого тура по Лондону", () => {
    const gw5 = fixturesSchema.parse(fixturesRaw).filter((f) => f.event === 5);
    expect(getCompletedDays(gw5)).toEqual(["2026-09-18", "2026-09-19", "2026-09-20"]);
  });

  it("не возвращает ничего для тура, который ещё не начался", () => {
    const gw6 = fixturesSchema.parse(fixturesRaw).filter((f) => f.event === 6);
    expect(getCompletedDays(gw6)).toEqual([]);
  });

  it("группирует матчи по дате в Лондоне, а не в UTC", () => {
    // 23:30 UTC 19 сентября — это уже 20 сентября по лондонскому летнему времени
    const days = getCompletedDays([
      fixture({ kickoff_time: "2026-09-19T23:30:00Z", finished: true }),
    ]);
    expect(days).toEqual(["2026-09-20"]);
  });

  it("день не завершён, пока не доигран хотя бы один матч", () => {
    const days = getCompletedDays([
      fixture({ kickoff_time: "2026-09-19T11:30:00Z", finished: true }),
      fixture({ kickoff_time: "2026-09-20T11:30:00Z", finished_provisional: true }),
      fixture({ kickoff_time: "2026-09-20T16:30:00Z" }),
    ]);
    expect(days).toEqual(["2026-09-19"]);
  });

  it("пропускает перенесённые матчи без даты", () => {
    const days = getCompletedDays([
      fixture({ kickoff_time: null }),
      fixture({ kickoff_time: "2026-09-19T11:30:00Z", finished: true }),
    ]);
    expect(days).toEqual(["2026-09-19"]);
  });
});

describe("isTeamDone", () => {
  const dgw = [
    fixture({ team_h: 1, team_a: 2, finished: true }),
    fixture({ team_h: 3, team_a: 1, kickoff_time: "2026-09-23T19:00:00Z" }),
  ];

  it("двойной тур: команда не доиграла, пока не сыгран второй матч", () => {
    expect(isTeamDone(1, event(), dgw)).toBe(false);
    expect(isTeamDone(2, event(), dgw)).toBe(true);
  });

  it("команда без матча в туре считается доигравшей", () => {
    expect(isTeamDone(20, event(), dgw)).toBe(true);
  });

  it("завершённый тур — все команды доиграли", () => {
    expect(isTeamDone(1, event({ finished: true }), dgw)).toBe(true);
  });
});

describe("planGameweekUpdate", () => {
  const result: CaptainResult = {
    playerId: 1,
    playerName: "P1",
    basePoints: 2,
    multiplier: 2,
    points: 4,
    viceUsed: false,
    tripleCaptain: false,
    pending: false,
  };
  const day1 = fixture({ kickoff_time: "2026-09-19T11:30:00Z", finished: true });
  const day2 = fixture({ kickoff_time: "2026-09-20T11:30:00Z" });

  const saved = (over: Partial<GameweekState> = {}): GameweekState => ({
    status: "provisional",
    completedDays: ["2026-09-19"],
    updatedAt: "2026-09-19T20:00:00.000Z",
    captains: { "1": result, "2": result },
    ...over,
  });

  it("тур ещё не начался — пропускаем", () => {
    const plan = planGameweekUpdate({
      event: event(),
      gwFixtures: [day2],
      prev: undefined,
      entryIds: [1, 2],
    });
    expect(plan).toBeNull();
  });

  it("первый завершённый день — считаем всех, тур предварительный", () => {
    const plan = planGameweekUpdate({
      event: event(),
      gwFixtures: [day1, day2],
      prev: undefined,
      entryIds: [1, 2],
    });
    expect(plan).toEqual({
      status: "provisional",
      completedDays: ["2026-09-19"],
      dataChanged: true,
      missing: [1, 2],
      toFetch: [1, 2],
    });
  });

  it("ничего не изменилось — пропускаем", () => {
    const plan = planGameweekUpdate({
      event: event(),
      gwFixtures: [day1, day2],
      prev: saved(),
      entryIds: [1, 2],
    });
    expect(plan).toBeNull();
  });

  it("тур закрыт и проверен FPL — финальный пересчёт всех", () => {
    const plan = planGameweekUpdate({
      event: event({ finished: true, data_checked: true }),
      gwFixtures: [day1, day2],
      prev: saved(),
      entryIds: [1, 2],
    });
    expect(plan).toMatchObject({
      status: "final",
      completedDays: ["2026-09-19", "2026-09-20"],
      dataChanged: true,
      toFetch: [1, 2],
    });
  });

  it("тур закончен, но FPL ещё не проверил данные — остаётся предварительным", () => {
    const plan = planGameweekUpdate({
      event: event({ finished: true }),
      gwFixtures: [day1, day2],
      prev: saved(),
      entryIds: [1, 2],
    });
    expect(plan).toMatchObject({ status: "provisional", dataChanged: true });
  });

  it("финальный тур больше не трогаем", () => {
    const plan = planGameweekUpdate({
      event: event({ finished: true, data_checked: true }),
      gwFixtures: [day1, day2],
      prev: saved({ status: "final", completedDays: ["2026-09-19", "2026-09-20"] }),
      entryIds: [1, 2],
    });
    expect(plan).toBeNull();
  });

  it("новый участник лиги — досчитываем только его и сохраняем остальных", () => {
    const prev = saved({ status: "final", completedDays: ["2026-09-19", "2026-09-20"] });
    const plan = planGameweekUpdate({
      event: event({ finished: true, data_checked: true }),
      gwFixtures: [day1, day2],
      prev,
      entryIds: [1, 2, 3],
    });
    expect(plan).toMatchObject({ dataChanged: false, missing: [3], toFetch: [3] });

    const next = applyGameweekUpdate(plan!, prev, { "3": null }, "2026-09-30T00:00:00.000Z");
    expect(next.captains).toEqual({ "1": result, "2": result, "3": null });
    expect(next.updatedAt).toBe("2026-09-30T00:00:00.000Z");
  });

  it("при пересчёте старые результаты отбрасываются", () => {
    const prev = saved();
    const plan = planGameweekUpdate({
      event: event({ finished: true, data_checked: true }),
      gwFixtures: [day1, day2],
      prev,
      entryIds: [1],
    });
    const next = applyGameweekUpdate(plan!, prev, { "1": result }, "2026-09-30T00:00:00.000Z");
    expect(Object.keys(next.captains)).toEqual(["1"]);
    expect(next.status).toBe("final");
  });
});
