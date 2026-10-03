# FPL Captain Analytics

Captaincy analytics for Fantasy Premier League mini-leagues: total captain
points per manager across the season, Triple Captain usage, vice-captain
fallbacks.

The project is being turned from a CLI into a full-stack web app — see
[docs/PLAN.md](docs/PLAN.md). Right now it's a pnpm + Turborepo monorepo with a
CLI on top of shared packages.

## Structure

```
apps/
└── cli/             # command-line tool (update-league, show, sync)
packages/
├── core/            # pure scoring functions, no network or DB
├── fpl-client/      # FPL API client with Zod-validated responses
│   └── fixtures/    # trimmed real API responses used in tests
├── db/              # Drizzle schema, SQL migrations, repositories
└── sync/            # loads finished gameweeks from FPL into Postgres
docker-compose.yml   # local Postgres
```

- `packages/core` — captain points (vice-captain, Triple Captain, double
  gameweeks), completed match days, when a gameweek needs recalculating,
  league standings.
- `packages/fpl-client` — `createFplClient()` with timeouts, retries with
  exponential backoff on 429/5xx/network errors, standings pagination, and a
  concurrency helper (`mapLimit`).
- `packages/db` — Postgres schema (leagues, managers, gameweeks, players,
  captain picks) and repositories that work with any Drizzle Postgres client
  (postgres.js in production, in-memory PGlite in tests).
- `packages/sync` — `syncLeague()` / `syncAllLeagues()`: stores every finished
  and FPL-checked gameweek of a league; safe to re-run.
- `apps/cli` — config, local JSON state, the text table and `sync`.

## Setup

Requires Node 22 (see `.nvmrc`) and pnpm via corepack.

```bash
corepack enable
pnpm install
cp config.example.json config.json   # fill in league_id and my_id
```

`config.json`:

| Field       | Required | Description                                                                             |
| ----------- | -------- | --------------------------------------------------------------------------------------- |
| `league_id` | yes      | Classic league ID (from the URL `.../leagues/<id>/standings/c`)                         |
| `my_id`     | no       | Your team ID (from the URL `.../entry/<id>/event/N`); highlighted with `►` in the table |
| `data_file` | no       | Where accumulated data is stored, defaults to `data/state.json`                         |

The config path can be overridden with the `FPL_CONFIG` environment variable.

## Commands

```bash
pnpm cli update-league          # check for new data, recalculate, print the table
pnpm cli update-league --force  # recalculate all gameweeks from scratch
pnpm cli show                   # print the saved table without calling the FPL API

pnpm typecheck                  # TypeScript in every package
pnpm test                       # Vitest in every package
pnpm lint                       # ESLint
pnpm format                     # Prettier
```

### Database

```bash
cp .env.example .env    # DATABASE_URL=postgres://fpl:fpl@localhost:5432/fpl
pnpm db:up              # start Postgres in Docker
pnpm db:migrate         # apply migrations
pnpm cli sync --league 123456   # or without --league to use league_id from config.json
```

`pnpm test` does not need Docker: database tests run on in-memory PGlite.

Note: use `pnpm cli show`, not `pnpm show` — the latter is pnpm's built-in
alias for `pnpm view`.

## How sync works

- Only gameweeks that are `finished` and `data_checked` are stored; their
  points never change afterwards.
- For each such gameweek, only managers without a stored row are fetched, so a
  second run makes just two requests (bootstrap-static and standings).
- A manager without a team in a gameweek (joined later) is stored as a row
  without a captain, so it is not re-requested every run.
- Each gameweek is written in a single statement: if FPL fails midway, finished
  gameweeks stay saved and the next run continues from there.
- Besides captain points, it stores the best possible captain from the starting
  XI (all 15 with Bench Boost) — the base for "missed points" analytics.

## How update-league works

- A gameweek is recalculated only when a new match day has finished since the
  last run (all matches of that day, London time) or the whole gameweek has
  finished.
- While a gameweek is in progress, points are marked as provisional. Once FPL
  closes the gameweek (`finished` + `data_checked`), it is recalculated one
  last time (including final bonus points) and never touched again.
- Captain points = the player's gameweek points × 2 (× 3 with Triple Captain).
  If the captain didn't play, the armband passes to the vice-captain; if
  neither played, the score is 0. In a double gameweek the captain counts as
  "not played" only after both matches are over.
- Managers who join the league later are automatically backfilled for all
  past gameweeks.
- The first run processes every past gameweek of the season, which means
  "managers × gameweeks" requests to FPL, so it may take a little while.
  Requests run at most 5 at a time and are retried on 429/5xx responses.
- Every FPL API response is validated with Zod; if FPL changes its format the
  CLI fails with a clear error instead of producing wrong numbers.
