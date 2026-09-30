import { describe, expect, it } from "vitest";
import type { CaptainResult } from "./captain";
import { emptyLeagueState, type GameweekState, type LeagueState } from "./league-state";
import { buildStandings } from "./standings";

const cap = (points: number, over: Partial<CaptainResult> = {}): CaptainResult => ({
  playerId: 1,
  playerName: "P1",
  basePoints: points / 2,
  multiplier: 2,
  points,
  viceUsed: false,
  tripleCaptain: false,
  pending: false,
  ...over,
});

const gw = (captains: GameweekState["captains"]): GameweekState => ({
  status: "final",
  completedDays: [],
  updatedAt: "2026-09-30T00:00:00.000Z",
  captains,
});

function league(): LeagueState {
  return {
    ...emptyLeagueState(1),
    leagueName: "Лига",
    entries: {
      "10": { manager: "Борис", team: "B" },
      "20": { manager: "Анна", team: "A" },
      "30": { manager: "Вера", team: "C" },
      "40": { manager: "Глеб", team: "D" },
    },
    gameweeks: {
      "1": gw({
        "10": cap(10),
        "20": cap(4),
        "30": cap(18, { tripleCaptain: true, multiplier: 3 }),
      }),
      "2": gw({ "10": cap(8), "20": cap(14), "30": null, "40": cap(6) }),
    },
  };
}

describe("buildStandings", () => {
  it("возвращает null, если туров ещё нет", () => {
    expect(buildStandings(emptyLeagueState(1))).toBeNull();
  });

  it("сортирует по сумме очков, при равенстве — одно место и алфавит", () => {
    const s = buildStandings(league())!;
    expect(s.rows.map((r) => [r.place, r.manager, r.total])).toEqual([
      [1, "Анна", 18],
      [1, "Борис", 18],
      [1, "Вера", 18],
      [4, "Глеб", 6],
    ]);
  });

  it("пропущенный тур (нет состава) и позднее вступление не ломают сумму", () => {
    const rows = buildStandings(league())!.rows;
    const vera = rows.find((r) => r.manager === "Вера")!;
    const gleb = rows.find((r) => r.manager === "Глеб")!;
    expect(vera).toMatchObject({ total: 18, last: null });
    expect(gleb.total).toBe(6);
  });

  it("собирает туры с Triple Captain", () => {
    const vera = buildStandings(league())!.rows.find((r) => r.manager === "Вера")!;
    expect(vera.tcUsed).toEqual([1]);
  });

  it("сортирует туры численно, а не как строки", () => {
    const state = league();
    state.gameweeks["10"] = gw({ "10": cap(2) });
    const s = buildStandings(state)!;
    expect(s.gwIds).toEqual([1, 2, 10]);
    expect(s.lastGwId).toBe(10);
    expect(s.rows[0]).toMatchObject({ manager: "Борис", total: 20 });
  });
});
