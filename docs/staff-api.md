# Staff Management API

## Worker messages

- `GET_STAFF_STATE` → returns `{ staff, market, bonuses, cap }` for the user team.
- `HIRE_STAFF_MEMBER` payload: `{ teamId, roleKey, candidate }`.
- `FIRE_STAFF_MEMBER` payload: `{ teamId, roleKey }`.
- `NEGOTIATE_STAFF_CONTRACT` payload: `{ teamId, roleKey, ask: { annualSalary, years } }`.

## Staff roles

`headCoach`, `offCoordinator`, `defCoordinator`, `specialTeamsCoach`, `scoutDirector`, `headTrainer`, `mentor`, `analyticsDirector`.

## Staff member model

Each staff member carries:

- `attributes`: `tacticalSkill`, `playerDevelopment`, `injuryPrevention`, `scoutingAccuracy`, `motivation`
- `schemePreference`
- `contract`: `years`, `annualSalary`, `signedYear`
- `face` avatar config persisted via existing face hydration pipeline

## Gameplay hooks

- Development/preseason progression: `developmentDelta` + `mentorDelta`
- Injury/recovery: `injuryRateDelta` + `recoveryDelta`
- In-game AI: `tacticalEdgeDelta` + `schemePreference`
- Scouting: scout/analytics influence confidence bands
