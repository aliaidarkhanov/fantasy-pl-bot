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
└── cli/             # command-line tool (update-league, show)
packages/
├── core/            # pure scoring functions, no network or DB
└── fpl-client/      # FPL API client with Zod-validated responses
    └── fixtures/    # trimmed real API responses used in tests
```

- `packages/core` — captain points (vice-captain, Triple Captain, double
  gameweeks), completed match days, when a gameweek needs recalculating,
  league standings.
- `packages/fpl-client` — `createFplClient()` with timeouts, retries with
  exponential backoff on 429/5xx/network errors, standings pagination, and a
  concurrency helper (`mapLimit`).
- `apps/cli` — config, local JSON state and the text table.

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

Note: use `pnpm cli show`, not `pnpm show` — the latter is pnpm's built-in
alias for `pnpm view`.

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
