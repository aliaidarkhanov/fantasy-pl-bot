const BASE_URL = "https://fantasy.premierleague.com/api";

export interface FplEvent {
  id: number;
  name: string;
  finished: boolean;
  data_checked: boolean;
  is_current: boolean;
}

export interface FplElement {
  id: number;
  web_name: string;
  team: number;
}

export interface Bootstrap {
  events: FplEvent[];
  elements: FplElement[];
}

export interface Fixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  kickoff_time: string | null;
  started: boolean | null;
  finished: boolean;
  finished_provisional: boolean;
}

export interface LeagueEntry {
  entry: number;
  entry_name: string;
  player_name: string;
}

interface StandingsPage {
  league: { id: number; name: string };
  standings: { has_next: boolean; results: LeagueEntry[] };
}

export interface Pick {
  element: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface EntryPicks {
  active_chip: string | null;
  picks: Pick[];
}

export interface LiveElement {
  id: number;
  stats: { minutes: number; total_points: number };
}

export class HttpError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`FPL API ответил ${status} на ${url}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<T>(pathname: string, attempt = 1): Promise<T> {
  const url = `${BASE_URL}${pathname}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (fpl-captain-cli)", Accept: "application/json" },
  });

  // 429 — лимит запросов, 5xx — в т.ч. 503 "The game is being updated"
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(2000 * attempt);
    return get<T>(pathname, attempt + 1);
  }
  if (!res.ok) {
    if (res.status === 503) {
      throw new Error("FPL сейчас обновляет данные (503). Попробуйте позже.");
    }
    throw new HttpError(res.status, url);
  }
  return (await res.json()) as T;
}

export const getBootstrap = () => get<Bootstrap>("/bootstrap-static/");

export const getFixtures = () => get<Fixture[]>("/fixtures/");

export const getLive = (gw: number) =>
  get<{ elements: LiveElement[] }>(`/event/${gw}/live/`).then((r) => r.elements);

/** null — у менеджера нет состава в этом туре (присоединился позже) */
export async function getPicks(entryId: number, gw: number): Promise<EntryPicks | null> {
  try {
    return await get<EntryPicks>(`/entry/${entryId}/event/${gw}/picks/`);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

export async function getLeague(leagueId: number) {
  const entries: LeagueEntry[] = [];
  let name = "";
  for (let page = 1; ; page++) {
    const data = await get<StandingsPage>(
      `/leagues-classic/${leagueId}/standings/?page_standings=${page}`
    );
    name = data.league.name;
    entries.push(...data.standings.results);
    if (!data.standings.has_next) break;
  }
  return { name, entries };
}

/** Параллельно, но не больше `limit` запросов одновременно — чтобы FPL не банил */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}
