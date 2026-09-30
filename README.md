# FPL Captain CLI

A command-line tool for a Fantasy Premier League mini-league: it tracks the
total captaincy points each manager has scored over the season.

## Setup

```bash
npm install
cp config.example.json config.json   # fill in league_id and my_id
npm run build
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
node dist/cli.js update-league          # check for new data, recalculate, print the table
node dist/cli.js update-league --force  # recalculate all gameweeks from scratch
node dist/cli.js show                   # print the saved table without calling the FPL API
```

Without building: `npm run dev -- update-league`.

## How update-league works

- A gameweek is recalculated only when a new match day has finished since the
  last run (all matches of that day, London time) or the whole gameweek has
  finished.
- While a gameweek is in progress, points are marked as provisional. Once FPL
  closes the gameweek (`finished` + `data_checked`), it is recalculated one
  last time (including final bonus points) and never touched again.
- Captain points = the player's gameweek points × 2 (× 3 with Triple Captain).
  If the captain didn't play, the armband passes to the vice-captain; if
  neither played, the score is 0.
- Managers who join the league later are automatically backfilled for all
  past gameweeks.
- The first run processes every past gameweek of the season, which means
  "managers × gameweeks" requests to FPL, so it may take a little while.
  Requests run at most 5 at a time and are retried on 429/503 responses.

## Project structure

```
src/
├── cli.ts       # entry point, command parsing
├── config.ts    # reads config.json
├── fpl-api.ts   # FPL API client
├── update.ts    # update-league logic: detects new data, recalculates gameweeks
├── captain.ts   # captain points calculation (vice-captain, Triple Captain)
├── state.ts     # reads/writes data/state.json
└── report.ts    # formats the output table
```
