CREATE TABLE "captain_picks" (
	"entry_id" integer NOT NULL,
	"gw" smallint NOT NULL,
	"captain_player_id" integer,
	"vice_player_id" integer,
	"effective_captain_id" integer,
	"multiplier" smallint NOT NULL,
	"base_points" smallint NOT NULL,
	"captain_points" smallint NOT NULL,
	"vice_used" boolean NOT NULL,
	"active_chip" text,
	"best_player_id" integer,
	"best_possible_points" smallint,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "captain_picks_entry_id_gw_pk" PRIMARY KEY("entry_id","gw")
);
--> statement-breakpoint
CREATE TABLE "gameweeks" (
	"id" smallint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"finished" boolean NOT NULL,
	"data_checked" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"league_id" integer NOT NULL,
	"entry_id" integer NOT NULL,
	CONSTRAINT "league_members_league_id_entry_id_pk" PRIMARY KEY("league_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"entry_id" integer PRIMARY KEY NOT NULL,
	"player_name" text NOT NULL,
	"team_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" integer PRIMARY KEY NOT NULL,
	"web_name" text NOT NULL,
	"team_id" smallint NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "captain_picks" ADD CONSTRAINT "captain_picks_entry_id_managers_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."managers"("entry_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captain_picks" ADD CONSTRAINT "captain_picks_gw_gameweeks_id_fk" FOREIGN KEY ("gw") REFERENCES "public"."gameweeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_entry_id_managers_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."managers"("entry_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "captain_picks_gw_index" ON "captain_picks" USING btree ("gw");