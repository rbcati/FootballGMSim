# Completed-game archive flow notes

This pass centralizes completed-game identity and retrieval around the canonical game id:

- Canonical ID format: `{seasonId}_w{week}_{homeId}_{awayId}`.
- Simulation writes this ID into:
  - schedule row (`game.gameId`),
  - archived game blob (`games.id`),
  - week-complete ticker payload (`results[].gameId`).

## Read path

All UI surfaces should resolve completed game links through `resolveCompletedGameId(...)` and then load details via `GET_BOX_SCORE`.

`GET_BOX_SCORE` now resolves in this order:
1. hot in-memory week cache,
2. direct IndexedDB lookup by canonical id,
3. deterministic legacy fallback by parsing canonical id and matching season/week/home/away (with string/number season compatibility),
4. schedule-row reconstruction fallback (final score + matchup metadata) when no archived blob exists.

## Legacy save handling

On load, the worker backfills missing `gameId`/`seasonId`/`week` on played schedule rows where score data already exists.
This keeps legacy schedules linkable without inventing data or adding non-deterministic matching.

## Partial archives

If a game has only partial archived payload (e.g. score + recap, but sparse stats), Box Score renders available sections and only shows section-level empty states where detail is missing.

Archive quality is now tagged as:
- `full`: play-by-play and box payload present,
- `partial`: final + recap/summary (or reconstructed schedule fallback),
- `missing`: no recoverable archived payload.

Schedule recap rows and completed-game cards surface this quality state so users are not shown fake “full box score” affordances.
