import { describe, expect, it, vi } from "vitest";
import picksRegular from "../fixtures/picks-7294-gw5.json";
import { createFplClient, FplValidationError, HttpError } from "./client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function clientWith(handler: (url: string) => Response | Promise<Response>) {
  // Клиент всегда передаёт URL строкой
  const fetch = vi.fn((url: string) => Promise.resolve(handler(url)));
  const client = createFplClient({
    fetch: fetch as unknown as typeof globalThis.fetch,
    retryDelayMs: 0,
  });
  return { client, fetch };
}

describe("createFplClient", () => {
  it("возвращает провалидированные picks", async () => {
    const { client, fetch } = clientWith(() => json(picksRegular));
    const picks = await client.getPicks(7294, 5);
    expect(picks?.picks).toHaveLength(15);
    expect(fetch).toHaveBeenCalledWith(
      "https://fantasy.premierleague.com/api/entry/7294/event/5/picks/",
      expect.anything(),
    );
  });

  it("getPicks возвращает null на 404 (менеджер пропустил тур)", async () => {
    const { client } = clientWith(() => json({ detail: "Not found." }, 404));
    await expect(client.getPicks(1, 1)).resolves.toBeNull();
  });

  it("другие коды ошибок пробрасывает как HttpError", async () => {
    const { client } = clientWith(() => json({}, 403));
    await expect(client.getBootstrap()).rejects.toBeInstanceOf(HttpError);
  });

  it("повторяет запрос при 429 и 5xx", async () => {
    const responses = [json({}, 429), json({}, 502), json({ elements: [] })];
    const { client, fetch } = clientWith(() => responses.shift()!);
    await expect(client.getLive(1)).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("повторяет запрос при сетевой ошибке", async () => {
    let calls = 0;
    const { client } = clientWith(() => {
      if (++calls === 1) throw new TypeError("fetch failed");
      return json({ elements: [] });
    });
    await expect(client.getLive(1)).resolves.toEqual([]);
  });

  it("после исчерпания попыток сообщает про 503 понятным текстом", async () => {
    const { client, fetch } = clientWith(() => json({}, 503));
    await expect(client.getFixtures()).rejects.toThrow("FPL сейчас обновляет данные");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("бросает FplValidationError, если формат ответа изменился", async () => {
    const { client } = clientWith(() => json({ elements: [{ id: 1 }] }));
    const err = await client.getLive(1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FplValidationError);
    expect((err as Error).message).toContain("elements.0.stats");
  });

  it("getLeague проходит по всем страницам standings", async () => {
    const page = (n: number, hasNext: boolean) =>
      json({
        league: { id: 1, name: "Лига" },
        standings: {
          has_next: hasNext,
          results: [{ entry: n, entry_name: `Team ${n}`, player_name: `Manager ${n}` }],
        },
      });
    const { client, fetch } = clientWith((url) => {
      const n = Number(new URL(url).searchParams.get("page_standings"));
      return page(n, n < 3);
    });
    const league = await client.getLeague(1);
    expect(league.name).toBe("Лига");
    expect(league.entries.map((e) => e.entry)).toEqual([1, 2, 3]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
