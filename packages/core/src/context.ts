import type { CaptainContext, LiveStats } from "./captain";
import { isTeamDone, type EventInput, type FixtureInput } from "./gameweek";

export interface ElementInput {
  id: number;
  web_name: string;
  team: number;
}

/** Контекст для computeCaptain из данных одного тура */
export function createCaptainContext(input: {
  event: EventInput;
  gwFixtures: readonly FixtureInput[];
  elements: readonly ElementInput[];
  live: readonly { id: number; stats: LiveStats }[];
}): CaptainContext {
  const { event, gwFixtures } = input;
  const elements = new Map(input.elements.map((el) => [el.id, el]));
  return {
    live: new Map(input.live.map((el) => [el.id, el.stats])),
    playerName: (id) => elements.get(id)?.web_name ?? `#${id}`,
    isPlayerDone: (id) => {
      const el = elements.get(id);
      return el ? isTeamDone(el.team, event, gwFixtures) : true;
    },
  };
}
