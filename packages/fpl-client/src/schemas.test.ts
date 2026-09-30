import { describe, expect, it } from "vitest";
import bootstrap from "../fixtures/bootstrap-static.json";
import fixtures from "../fixtures/fixtures.json";
import liveGw3 from "../fixtures/live-gw3.json";
import liveGw5 from "../fixtures/live-gw5.json";
import picksVice from "../fixtures/picks-2749551-gw3.json";
import picksTc from "../fixtures/picks-3009035-gw5.json";
import picksRegular from "../fixtures/picks-7294-gw5.json";
import standings from "../fixtures/standings-1941-page1.json";
import {
  bootstrapSchema,
  entryPicksSchema,
  fixturesSchema,
  liveSchema,
  standingsPageSchema,
} from "./schemas";

describe("схемы принимают реальные ответы FPL API", () => {
  it("bootstrap-static", () => {
    const data = bootstrapSchema.parse(bootstrap);
    expect(data.events).toHaveLength(38);
    expect(data.elements.length).toBeGreaterThan(0);
  });

  it("fixtures, включая ещё не сыгранные матчи", () => {
    const data = fixturesSchema.parse(fixtures);
    expect(data.some((f) => !f.started && !f.finished)).toBe(true);
  });

  it("standings", () => {
    const data = standingsPageSchema.parse(standings);
    expect(data.standings.results.length).toBeGreaterThan(0);
  });

  it.each([
    ["обычный тур", picksRegular],
    ["Triple Captain", picksTc],
    ["вице-капитан", picksVice],
  ])("picks: %s", (_, raw) => {
    expect(entryPicksSchema.parse(raw).picks).toHaveLength(15);
  });

  it.each([liveGw3, liveGw5])("event live", (raw) => {
    expect(liveSchema.parse(raw).elements.length).toBeGreaterThan(0);
  });

  it("отбрасывает лишние поля", () => {
    const data = entryPicksSchema.parse(picksRegular);
    expect(data).not.toHaveProperty("entry_history");
    expect(data.picks[0]).not.toHaveProperty("position");
  });

  it("отклоняет ответ с изменившейся структурой", () => {
    const broken = { ...picksRegular, picks: [{ element: "1", multiplier: 2 }] };
    expect(entryPicksSchema.safeParse(broken).success).toBe(false);
  });
});
