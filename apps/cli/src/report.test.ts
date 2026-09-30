import { emptyLeagueState, type CaptainResult, type LeagueState } from "@fpl/core";
import { describe, expect, it } from "vitest";
import { formatReport } from "./report";

const cap = (over: Partial<CaptainResult>): CaptainResult => ({
  playerId: 1,
  playerName: "Haaland",
  basePoints: 6,
  multiplier: 2,
  points: 12,
  viceUsed: false,
  tripleCaptain: false,
  pending: false,
  ...over,
});

const state: LeagueState = {
  ...emptyLeagueState(1),
  leagueName: "Лига",
  entries: {
    "1": { manager: "Анна", team: "A" },
    "2": { manager: "Борис", team: "B" },
    "3": { manager: "Вера", team: "C" },
    "4": { manager: "Глеб", team: "D" },
  },
  gameweeks: {
    "1": {
      status: "final",
      completedDays: ["2026-08-22"],
      updatedAt: "",
      captains: {
        "1": cap({ multiplier: 3, points: 18, tripleCaptain: true }),
        "2": cap({ playerName: "Salah", basePoints: 2, points: 4, viceUsed: true }),
        "3": cap({ playerId: null, playerName: null, basePoints: 0, multiplier: 0, points: 0 }),
        "4": null,
      },
    },
    "2": {
      status: "provisional",
      completedDays: ["2026-08-29"],
      updatedAt: "",
      captains: {
        "1": cap({ pending: true, basePoints: 0, points: 0 }),
        "2": cap({}),
        "3": cap({ playerId: null, playerName: null, basePoints: 0, multiplier: 0, points: 0 }),
        "4": null,
      },
    },
  },
};

describe("formatReport", () => {
  it("печатает таблицу лиги", () => {
    expect(formatReport(state, 2)).toMatchInlineSnapshot(`
      "Лига: Лига · туры GW1–GW2
      GW2 идёт — очки предварительные (завершены дни: 2026-08-29)

           #  Менеджер  Команда   Очки  Капитан GW2
           1  Анна      A           18  Haaland 0×2=0 (ещё играет)  [TC: GW1]
      ►    2  Борис     B           16  Haaland 6×2=12
           3  Вера      C            0  капитан и вице не сыграли
           3  Глеб      D            0  —"
    `);
  });

  it("предупреждает, если my_id нет в лиге", () => {
    expect(formatReport(state, 99)).toContain("my_id 99 не найден");
  });

  it("сообщает, что считать нечего", () => {
    expect(formatReport(emptyLeagueState(1), null)).toContain("считать нечего");
  });
});
