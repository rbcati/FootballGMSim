# Game Result Data Model (Shared Game Detail / Box Score)

## Canonical game identity
- Every completed game is keyed by a canonical id: `{seasonId}_w{week}_{homeId}_{awayId}`.
- The same id is used by schedule rows, weekly hub links, postseason bracket rows, and the Game Detail screen.

## Persisted record shape (IndexedDB `games` store)
Each archived game now stores:
- identity/context: `id`, `seasonId`, `week`, `homeId`, `awayId`
- scoreline: `homeScore`, `awayScore`
- detail payloads: `quarterScores`, `stats`, `drives`, `recap`
- summary payload: `summary` (`winnerId`, `margin`, `storyline`)

This record is written in worker simulation flow (`applyGameResultToCache`) and survives save/load.

## Season history linkage
At season archive time, `seasonSummary.gameIndex` stores a compact index of all completed games:
- `id`, `week`, `homeId`, `awayId`, `homeScore`, `awayScore`

This gives history screens a stable pointer list for future deep-link features without duplicating full box-score blobs.

## Legacy compatibility
- If loading older saves where `summary` is missing, `GET_BOX_SCORE` synthesizes a fallback summary so the Game Detail header and storyline section still render.
