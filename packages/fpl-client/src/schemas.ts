import { z } from "zod";

/**
 * Схемы описывают только поля, которые мы используем.
 * Лишние поля в ответах FPL Zod молча отбрасывает.
 */

export const eventSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  deadline_time: z.string(),
  finished: z.boolean(),
  data_checked: z.boolean(),
  is_current: z.boolean(),
});

export const elementSchema = z.object({
  id: z.number().int(),
  web_name: z.string(),
  team: z.number().int(),
  /** 1 — вратарь, 2 — защитник, 3 — полузащитник, 4 — нападающий */
  element_type: z.number().int(),
});

export const bootstrapSchema = z.object({
  events: z.array(eventSchema),
  elements: z.array(elementSchema),
});

export const fixtureSchema = z.object({
  id: z.number().int(),
  /** null — матч перенесён и ещё не привязан к туру */
  event: z.number().int().nullable(),
  team_h: z.number().int(),
  team_a: z.number().int(),
  kickoff_time: z.string().nullable(),
  started: z.boolean().nullable(),
  finished: z.boolean(),
  finished_provisional: z.boolean(),
});

export const fixturesSchema = z.array(fixtureSchema);

export const leagueEntrySchema = z.object({
  entry: z.number().int(),
  entry_name: z.string(),
  player_name: z.string(),
});

export const standingsPageSchema = z.object({
  league: z.object({ id: z.number().int(), name: z.string() }),
  standings: z.object({
    has_next: z.boolean(),
    results: z.array(leagueEntrySchema),
  }),
});

export const pickSchema = z.object({
  element: z.number().int(),
  /** 1–11 — стартовый состав, 12–15 — скамейка */
  position: z.number().int(),
  multiplier: z.number().int(),
  is_captain: z.boolean(),
  is_vice_captain: z.boolean(),
});

export const entryPicksSchema = z.object({
  active_chip: z.string().nullable(),
  picks: z.array(pickSchema),
});

export const liveElementSchema = z.object({
  id: z.number().int(),
  stats: z.object({
    minutes: z.number(),
    total_points: z.number(),
  }),
});

export const liveSchema = z.object({
  elements: z.array(liveElementSchema),
});

export type FplEvent = z.infer<typeof eventSchema>;
export type FplElement = z.infer<typeof elementSchema>;
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export type LeagueEntry = z.infer<typeof leagueEntrySchema>;
export type StandingsPage = z.infer<typeof standingsPageSchema>;
export type Pick = z.infer<typeof pickSchema>;
export type EntryPicks = z.infer<typeof entryPicksSchema>;
export type LiveElement = z.infer<typeof liveElementSchema>;
