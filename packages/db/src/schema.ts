import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Лиги, которые мы отслеживаем и синхронизируем */
export const leagues = pgTable("leagues", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
});

/** Менеджеры FPL (команды). Один менеджер может состоять в нескольких лигах. */
export const managers = pgTable("managers", {
  entryId: integer("entry_id").primaryKey(),
  playerName: text("player_name").notNull(),
  teamName: text("team_name").notNull(),
});

export const leagueMembers = pgTable(
  "league_members",
  {
    leagueId: integer("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => managers.entryId, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.entryId] })],
);

export const gameweeks = pgTable("gameweeks", {
  id: smallint("id").primaryKey(),
  name: text("name").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  finished: boolean("finished").notNull(),
  dataChecked: boolean("data_checked").notNull(),
});

export const players = pgTable("players", {
  id: integer("id").primaryKey(),
  webName: text("web_name").notNull(),
  teamId: smallint("team_id").notNull(),
  /** 1 — вратарь, 2 — защитник, 3 — полузащитник, 4 — нападающий */
  position: smallint("position").notNull(),
});

/**
 * Капитан менеджера в завершённом туре.
 * captainPlayerId = null — у менеджера не было состава в этом туре.
 * effectiveCaptainId = null при заполненном captainPlayerId — не сыграли ни капитан, ни вице.
 * С игроками намеренно нет внешних ключей: FPL может убрать игрока из bootstrap-static.
 */
export const captainPicks = pgTable(
  "captain_picks",
  {
    entryId: integer("entry_id")
      .notNull()
      .references(() => managers.entryId, { onDelete: "cascade" }),
    gw: smallint("gw")
      .notNull()
      .references(() => gameweeks.id),
    captainPlayerId: integer("captain_player_id"),
    vicePlayerId: integer("vice_player_id"),
    effectiveCaptainId: integer("effective_captain_id"),
    /** Множитель менеджера: 2, или 3 с Triple Captain; 0 — нет состава */
    multiplier: smallint("multiplier").notNull(),
    basePoints: smallint("base_points").notNull(),
    captainPoints: smallint("captain_points").notNull(),
    viceUsed: boolean("vice_used").notNull(),
    activeChip: text("active_chip"),
    /** Лучший игрок стартового состава и его очки × multiplier */
    bestPlayerId: integer("best_player_id"),
    bestPossiblePoints: smallint("best_possible_points"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.gw] }), index().on(t.gw)],
);

export type League = typeof leagues.$inferSelect;
export type Manager = typeof managers.$inferSelect;
export type Gameweek = typeof gameweeks.$inferSelect;
export type Player = typeof players.$inferSelect;
export type CaptainPick = typeof captainPicks.$inferSelect;
export type NewCaptainPick = typeof captainPicks.$inferInsert;
