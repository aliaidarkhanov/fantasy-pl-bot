import type { z } from "zod";
import {
  bootstrapSchema,
  entryPicksSchema,
  fixturesSchema,
  liveSchema,
  standingsPageSchema,
  type EntryPicks,
  type LeagueEntry,
} from "./schemas";

export const FPL_BASE_URL = "https://fantasy.premierleague.com/api";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`FPL API ответил ${status} на ${url}`);
    this.name = "HttpError";
  }
}

/** Ответ FPL не совпал с ожидаемой схемой — скорее всего, API изменился */
export class FplValidationError extends Error {
  constructor(
    public readonly url: string,
    public readonly issues: z.core.$ZodIssue[],
  ) {
    const details = issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    super(`Неожиданный формат ответа FPL API на ${url}: ${details}`);
    this.name = "FplValidationError";
  }
}

export interface FplClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Таймаут одного запроса, мс */
  timeoutMs?: number;
  /** Сколько всего попыток делать при 429/5xx и сетевых ошибках */
  maxAttempts?: number;
  /** Базовая задержка между попытками, мс; растёт экспоненциально */
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createFplClient(options: FplClientOptions = {}) {
  const {
    baseUrl = FPL_BASE_URL,
    fetch: fetchFn = globalThis.fetch,
    timeoutMs = 15_000,
    maxAttempts = 4,
    retryDelayMs = 2_000,
  } = options;

  async function request(url: string, attempt: number): Promise<unknown> {
    const retry = async () => {
      await sleep(retryDelayMs * 2 ** (attempt - 1));
      return request(url, attempt + 1);
    };

    let res: Response;
    try {
      res = await fetchFn(url, {
        headers: { "User-Agent": "Mozilla/5.0 (fpl-captain-cli)", Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Таймаут или сетевая ошибка
      if (attempt < maxAttempts) return retry();
      throw err;
    }

    // 429 — лимит запросов, 5xx — в т.ч. 503 "The game is being updated"
    if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) return retry();
    if (!res.ok) {
      if (res.status === 503) {
        throw new Error("FPL сейчас обновляет данные (503). Попробуйте позже.");
      }
      throw new HttpError(res.status, url);
    }
    return res.json();
  }

  async function get<T>(pathname: string, schema: z.ZodType<T>): Promise<T> {
    const url = `${baseUrl}${pathname}`;
    const parsed = schema.safeParse(await request(url, 1));
    if (!parsed.success) throw new FplValidationError(url, parsed.error.issues);
    return parsed.data;
  }

  return {
    getBootstrap: () => get("/bootstrap-static/", bootstrapSchema),

    getFixtures: () => get("/fixtures/", fixturesSchema),

    getLive: (gw: number) => get(`/event/${gw}/live/`, liveSchema).then((r) => r.elements),

    /** null — у менеджера нет состава в этом туре (присоединился позже) */
    async getPicks(entryId: number, gw: number): Promise<EntryPicks | null> {
      try {
        return await get(`/entry/${entryId}/event/${gw}/picks/`, entryPicksSchema);
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) return null;
        throw err;
      }
    },

    /** Все участники лиги (проходит по всем страницам standings) */
    async getLeague(leagueId: number): Promise<{ name: string; entries: LeagueEntry[] }> {
      const entries: LeagueEntry[] = [];
      let name: string;
      for (let page = 1; ; page++) {
        const data = await get(
          `/leagues-classic/${leagueId}/standings/?page_standings=${page}`,
          standingsPageSchema,
        );
        name = data.league.name;
        entries.push(...data.standings.results);
        if (!data.standings.has_next) break;
      }
      return { name, entries };
    },
  };
}

export type FplClient = ReturnType<typeof createFplClient>;
