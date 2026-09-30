import {
  bootstrapSchema,
  entryPicksSchema,
  fixturesSchema,
  liveSchema,
  type EntryPicks,
} from "@fpl/fpl-client/schemas";
import bootstrapRaw from "@fpl/fpl-client/fixtures/bootstrap-static.json";
import fixturesRaw from "@fpl/fpl-client/fixtures/fixtures.json";
import liveGw3Raw from "@fpl/fpl-client/fixtures/live-gw3.json";
import liveGw5Raw from "@fpl/fpl-client/fixtures/live-gw5.json";
import picksViceRaw from "@fpl/fpl-client/fixtures/picks-2749551-gw3.json";
import picksTcRaw from "@fpl/fpl-client/fixtures/picks-3009035-gw5.json";
import picksRegularRaw from "@fpl/fpl-client/fixtures/picks-7294-gw5.json";
import { describe, expect, it } from "vitest";
import { computeCaptain, type CaptainContext, type LiveStats, type PicksInput } from "./captain";
import { createCaptainContext } from "./context";

describe("computeCaptain на реальных данных FPL", () => {
  const bootstrap = bootstrapSchema.parse(bootstrapRaw);
  const fixtures = fixturesSchema.parse(fixturesRaw);
  const live = { 3: liveSchema.parse(liveGw3Raw), 5: liveSchema.parse(liveGw5Raw) };

  const contextFor = (gw: 3 | 5) =>
    createCaptainContext({
      event: bootstrap.events.find((e) => e.id === gw)!,
      gwFixtures: fixtures.filter((f) => f.event === gw),
      elements: bootstrap.elements,
      live: live[gw].elements,
    });

  const cases: [string, EntryPicks, 3 | 5][] = [
    ["обычный тур", entryPicksSchema.parse(picksRegularRaw), 5],
    ["Triple Captain", entryPicksSchema.parse(picksTcRaw), 5],
    ["замена капитана на вице", entryPicksSchema.parse(picksViceRaw), 3],
  ];

  it("обычный тур: очки капитана × 2", () => {
    const [, picks, gw] = cases[0]!;
    expect(computeCaptain(picks, contextFor(gw))).toEqual({
      playerId: 411,
      playerName: "Haaland",
      basePoints: 6,
      multiplier: 2,
      points: 12,
      viceUsed: false,
      tripleCaptain: false,
      pending: false,
    });
  });

  it("Triple Captain: очки капитана × 3", () => {
    const [, picks, gw] = cases[1]!;
    expect(computeCaptain(picks, contextFor(gw))).toMatchObject({
      playerName: "Haaland",
      basePoints: 6,
      multiplier: 3,
      points: 18,
      tripleCaptain: true,
    });
  });

  it("капитан не вышел на поле — повязка переходит к вице", () => {
    const [, picks, gw] = cases[2]!;
    expect(computeCaptain(picks, contextFor(gw))).toMatchObject({
      playerId: 165,
      playerName: "João Pedro",
      basePoints: 1,
      multiplier: 2,
      points: 2,
      viceUsed: true,
      pending: false,
    });
  });

  // В завершённом туре FPL сам проставляет multiplier > 1 фактическому капитану.
  // Наша логика должна давать тот же результат.
  it.each(cases)("%s: совпадает с multiplier из ответа FPL", (_, picks, gw) => {
    const result = computeCaptain(picks, contextFor(gw));
    const fromFpl = picks.picks.find((p) => p.multiplier > 1)!;
    expect(result.playerId).toBe(fromFpl.element);
    expect(result.multiplier).toBe(fromFpl.multiplier);
  });
});

describe("computeCaptain на синтетических данных", () => {
  const CAPTAIN = 1;
  const VICE = 2;

  const picks = (chip: string | null = null): PicksInput => ({
    active_chip: chip,
    picks: [
      { element: CAPTAIN, is_captain: true, is_vice_captain: false },
      { element: VICE, is_captain: false, is_vice_captain: true },
      { element: 3, is_captain: false, is_vice_captain: false },
    ],
  });

  const ctx = (live: Record<number, LiveStats>, notDone: number[] = []): CaptainContext => ({
    live: new Map(Object.entries(live).map(([id, s]) => [Number(id), s])),
    playerName: (id) => `P${id}`,
    isPlayerDone: (id) => !notDone.includes(id),
  });

  it("двойной тур: берёт суммарные очки за оба матча из live", () => {
    // 90 + 90 минут, 7 + 5 очков — live уже отдаёт сумму
    const result = computeCaptain(picks(), ctx({ [CAPTAIN]: { minutes: 180, total_points: 12 } }));
    expect(result).toMatchObject({ playerId: CAPTAIN, basePoints: 12, points: 24, pending: false });
  });

  it("двойной тур: капитан сыграл первый матч — очки засчитаны, второй матч ещё впереди", () => {
    const result = computeCaptain(
      picks(),
      ctx({ [CAPTAIN]: { minutes: 90, total_points: 7 } }, [CAPTAIN]),
    );
    // Сыгранные минуты уже есть, поэтому к вице не переходим
    expect(result).toMatchObject({ playerId: CAPTAIN, points: 14, viceUsed: false });
  });

  it("двойной тур: капитан не вышел в первом матче, но может сыграть во втором — ждём", () => {
    const result = computeCaptain(
      picks(),
      ctx(
        { [CAPTAIN]: { minutes: 0, total_points: 0 }, [VICE]: { minutes: 90, total_points: 9 } },
        [CAPTAIN],
      ),
    );
    expect(result).toMatchObject({ playerId: CAPTAIN, points: 0, pending: true, viceUsed: false });
  });

  it("Triple Captain переходит к вице с множителем × 3", () => {
    const result = computeCaptain(
      picks("3xc"),
      ctx({ [CAPTAIN]: { minutes: 0, total_points: 0 }, [VICE]: { minutes: 90, total_points: 5 } }),
    );
    expect(result).toMatchObject({ playerId: VICE, multiplier: 3, points: 15, viceUsed: true });
  });

  it("вице ещё может сыграть — результат предварительный", () => {
    const result = computeCaptain(picks(), ctx({}, [VICE]));
    expect(result).toMatchObject({ playerId: VICE, viceUsed: true, pending: true, points: 0 });
  });

  it("не сыграли ни капитан, ни вице — 0 очков", () => {
    expect(computeCaptain(picks("3xc"), ctx({}))).toEqual({
      playerId: null,
      playerName: null,
      basePoints: 0,
      multiplier: 0,
      points: 0,
      viceUsed: false,
      tripleCaptain: true,
      pending: false,
    });
  });

  it("отрицательные очки капитана тоже умножаются", () => {
    const result = computeCaptain(picks(), ctx({ [CAPTAIN]: { minutes: 90, total_points: -1 } }));
    expect(result.points).toBe(-2);
  });

  it("нет капитана в составе — 0 очков", () => {
    const result = computeCaptain({ active_chip: null, picks: [] }, ctx({}));
    expect(result).toMatchObject({ playerId: null, points: 0 });
  });
});
