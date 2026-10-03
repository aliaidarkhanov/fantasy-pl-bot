import { entryPicksSchema, liveSchema } from "@fpl/fpl-client/schemas";
import liveGw3Raw from "@fpl/fpl-client/fixtures/live-gw3.json";
import liveGw5Raw from "@fpl/fpl-client/fixtures/live-gw5.json";
import picksViceRaw from "@fpl/fpl-client/fixtures/picks-2749551-gw3.json";
import picksTcRaw from "@fpl/fpl-client/fixtures/picks-3009035-gw5.json";
import picksRegularRaw from "@fpl/fpl-client/fixtures/picks-7294-gw5.json";
import { describe, expect, it } from "vitest";
import { computeBestPossible, type LineupPicksInput } from "./best-possible";
import { computeCaptain, type CaptainResult, type LiveStats } from "./captain";

const liveMap = (raw: unknown) =>
  new Map(liveSchema.parse(raw).elements.map((el) => [el.id, el.stats] as const));

/** Эталон «в лоб»: максимум очков среди стартовых 11 */
function bruteForceBest(picks: LineupPicksInput, live: ReadonlyMap<number, LiveStats>) {
  return Math.max(
    ...picks.picks
      .filter((p) => p.position <= 11)
      .map((p) => live.get(p.element)?.total_points ?? 0),
  );
}

describe("computeBestPossible на реальных данных FPL", () => {
  const ctx = (live: ReadonlyMap<number, LiveStats>) => ({
    live,
    playerName: (id: number) => `#${id}`,
    isPlayerDone: () => true,
  });

  it.each([
    ["обычный тур", picksRegularRaw, liveGw5Raw],
    ["Triple Captain", picksTcRaw, liveGw5Raw],
    ["замена на вице", picksViceRaw, liveGw3Raw],
  ])("%s: лучший игрок стартовых 11 и не хуже фактического капитана", (_, picksRaw, liveRaw) => {
    const picks = entryPicksSchema.parse(picksRaw);
    const live = liveMap(liveRaw);
    const actual = computeCaptain(picks, ctx(live));
    const best = computeBestPossible(picks, live, actual)!;

    expect(best.basePoints).toBe(bruteForceBest(picks, live));
    expect(best.points).toBe(best.basePoints * (actual.tripleCaptain ? 3 : 2));
    expect(best.points).toBeGreaterThanOrEqual(actual.points);
  });
});

describe("computeBestPossible на синтетических данных", () => {
  const picks = (chip: string | null = null): LineupPicksInput => ({
    active_chip: chip,
    picks: Array.from({ length: 15 }, (_, i) => ({
      element: i + 1,
      position: i + 1,
      is_captain: i === 0,
      is_vice_captain: i === 1,
    })),
  });
  const live = (points: Record<number, number>) =>
    new Map(
      Object.entries(points).map(([id, p]) => [Number(id), { minutes: 90, total_points: p }]),
    );
  const actual = (over: Partial<CaptainResult> = {}): CaptainResult => ({
    playerId: 1,
    playerName: "P1",
    basePoints: 2,
    multiplier: 2,
    points: 4,
    viceUsed: false,
    tripleCaptain: false,
    pending: false,
    ...over,
  });

  it("игроки со скамейки не учитываются", () => {
    const best = computeBestPossible(picks(), live({ 1: 2, 5: 10, 13: 15 }), actual());
    expect(best).toEqual({ playerId: 5, basePoints: 10, points: 20 });
  });

  it("с Bench Boost учитываются все 15", () => {
    const best = computeBestPossible(picks("bboost"), live({ 1: 2, 5: 10, 13: 15 }), actual());
    expect(best).toEqual({ playerId: 13, basePoints: 15, points: 30 });
  });

  it("с Triple Captain множитель × 3", () => {
    const best = computeBestPossible(
      picks("3xc"),
      live({ 1: 2, 5: 10 }),
      actual({ tripleCaptain: true, multiplier: 3, points: 6 }),
    );
    expect(best).toMatchObject({ playerId: 5, points: 30 });
  });

  it("множитель × 2, даже если ни капитан, ни вице не сыграли", () => {
    const best = computeBestPossible(
      picks(),
      live({ 5: 10 }),
      actual({ playerId: null, multiplier: 0, points: 0 }),
    );
    expect(best).toMatchObject({ playerId: 5, points: 20 });
  });

  it("капитан, вошедший автозаменой со скамейки, тоже кандидат", () => {
    const withBenchCaptain = picks();
    const best = computeBestPossible(
      withBenchCaptain,
      live({ 3: 4, 12: 9 }),
      actual({ playerId: 12, basePoints: 9, points: 18 }),
    );
    expect(best).toMatchObject({ playerId: 12, points: 18 });
  });

  it("при равенстве очков — игрок выше в составе", () => {
    const best = computeBestPossible(picks(), live({ 7: 8, 3: 8 }), actual());
    expect(best?.playerId).toBe(3);
  });

  it("все игроки с отрицательными очками — лучший из них", () => {
    const negative = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i + 1, -1]));
    const best = computeBestPossible(picks(), live({ ...negative, 4: 0 }), actual());
    expect(best).toMatchObject({ playerId: 4, basePoints: 0 });
  });

  it("пустой состав — null", () => {
    expect(computeBestPossible({ active_chip: null, picks: [] }, live({}), actual())).toBeNull();
  });
});
