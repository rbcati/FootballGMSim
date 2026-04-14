# Modding API

Football GM Sim supports JSON-based mod imports via the **Modding & Customisation Hub**.

## Supported payloads

### 1) Full league file
```json
{
  "version": 2,
  "kind": "league_file",
  "meta": { "name": "My League", "year": 2028, "phase": "regular", "currentWeek": 5 },
  "settings": { "overtimeFormat": "nfl", "draftOrderLogic": "lottery" },
  "snapshot": { "meta": {}, "teams": [], "players": [] },
  "modData": { "roster": { "players": [] }, "draftClass": { "prospects": [] } }
}
```

### 2) Custom roster
```json
{
  "players": [
    { "id": 101, "name": "Alex QB", "age": 24, "pos": "QB", "ovr": 82, "potential": 88, "teamId": 3 }
  ]
}
```

### 3) Draft class
```json
{
  "prospects": [
    { "id": "rookie_1", "name": "Chris Edge", "age": 21, "pos": "DE", "ovr": 75, "potential": 90 }
  ]
}
```

## League settings schema notes

The worker normalizes and clamps incoming values using core league rules. New modding-aware settings:

- `overtimeFormat`: `"nfl" | "college"`
- `playoffTeams`: `2..32`
- `draftOrderLogic`: `"reverse_standings" | "lottery" | "random"`
- `injuryFrequency`: `0..100`
- `suspensionFrequency`: `0..100`
- `leagueUniverse`: `"fictional" | "historical"`

## Validation behavior

- All imports are validated inside the Shared Worker.
- Invalid payloads are rejected with a summarized error path list.
- Existing saves remain compatible: missing new settings default to current behavior.
