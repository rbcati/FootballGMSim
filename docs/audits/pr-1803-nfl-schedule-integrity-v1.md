# NFL Schedule Integrity & Multi-Season Rotation V1

Baseline: `817ab595be9a7a80f0c1407f4e5dfeb7323cfd9d` (main, #1802 merged).
This is a simulator NFL matchup structure, **not the official 2026 NFL calendar**.

## Before and reproduction

`defaultLeague.ts::makeSchedule` rotated adjacent IDs through 18 weeks. On the
unmodified baseline, executing `buildDefaultLeague()` produced Pittsburgh **CLE
nine times, HOU nine times, 18 games, zero byes**. The regression commit precedes
the replacement; all three new tests failed on that baseline.

`nflScheduleTemplates.js::buildGeneratedTemplate` rotated active arrays and paired
opposite halves. Four such templates repeated by season modulo four. This had
no division/opponent formula. Directly materializing **each of the four original
templates gave Pittsburgh MIN 17 times**, and all four passed the old validator.
The old template validator checked weekly uniqueness
and 17 total games, allowing repeated nondivision games and missing rivalries.
The regression supplied 17 games per team against one opposite-conference opponent
and the old validator accepted it. Existing tests checked totals and template
repetition, rather than the complete annual opponent matrix.

`core/schedule.js` had greedy/random week pairing, a repeat-opponent escape,
`fixScheduleCompletely`, and a randomized simple fallback. Errors cascaded from
templates to procedural scheduling to the fallback. Rollover called the scheduler
without the season and only gated references, allowing invalid opponent composition
to persist again. Template-backed output also included legacy bye pseudo-games.

## Authority and production paths

`src/core/nflSchedule.js` is the shared pure authority:

1. `buildNflOpponentMatrix` constructs reciprocal annual obligations and 17
   perfect-match rounds, independent of week placement.
2. `assertNflOpponentMatrix` verifies counts, opponent multiplicities and division
   home-and-away series before placement.
3. `generateNflSchedule` places those exact obligations, assigns canonical IDs,
   and runs `assertNflSchedule`. The latter compares against the entire annual
   rotation/rank/home-away matrix, in addition to validating weeks, byes and IDs.

`buildDefaultLeague`, `makeLeague` through `makeAccurateSchedule`, and the real
worker's `START_NEW_SEASON` all use this authority. The old template module is
only a compatibility adapter, with no separate fixtures or rotation algorithm.
Its validator now requires teams and season context instead of inferring validity
from game totals. Standard NFL errors propagate; `createSimpleSchedule` also
routes standard structures to the strict generator and cannot bypass it.

The worker validates the slim schedule **before clearing/creating a franchise DB**,
before rollover archive/season mutations, and again before the transactional
rollover flush. Existing rollback safeguards restore the previous live state on
failure. Schedule metadata persists the frozen ranks, year, seed, policy and
placement diagnostics. `slimifySchedule` keeps real games and `teamsWithBye`;
`expandSchedule` preserves byes. UI, matchup construction, canonical Game Books,
results and archive readers retain their existing contract. Schedule Center now
labels canonical bye weeks explicitly; it previously only showed an empty game
bucket. No UI redesign or
on-field/financial/draft/tiebreak rule changes are included.

## Opponent formula and rotation policy

Every team has 6 division games, 4 same-conference rotation games, 4 main
interconference games, 2 other same-conference same-place games and 1 extra
interconference same-place game. Thus 17 games, 14 distinct opponents, 11 distinct
nondivision opponents. No self-games, third rivalry meeting or repeated
nondivision meeting is legal.

The epoch is simulator year 2026. Let `y = year - 2026`. Conferences and divisions
are sorted by their actual structural identities; IDs never derive from team
array positions. For each conference its four divisions occupy indices 0–3.

- Same-conference partner: division index XOR `[1,2,3][y mod 3]`. These three
  reciprocal perfect matchings cover every other division in three seasons.
- Main interconference partner: AFC division `d` meets NFC division `(d+y) mod 4`.
  The NFC mapping is the inverse. Every division meets all four in four years.
- Extra interconference partner: AFC division `d` meets NFC division
  `(d + y mod 4 + k) mod 4`, where `k` follows `[1,2,3,2,1,2]` over six four-year
  blocks. It can never equal the main partner. This 24-year policy gives each
  division pair six extra meetings, three hosted by each conference.
- The other two same-conference division matchings supply same-place games.
  They form a four-cycle; orienting that cycle yields one home and one away
  standings game per team. Orientation reverses after each three-year cycle.

The initial-year ranks are explicitly **simulator scheduling seeds**: ascending
canonical numeric team ID within each actual division. No historical win/loss
records are invented. Later seasons use actual regular-season finishes with
`sortStandingsRows`, the existing standings/tiebreak authority, retaining full-league opponent
context before partitioning the ordered rows into divisions. A regression proves
that conference wins/losses resolve a division tie before the seeded coin flip. Ranks are frozen at the Week-18 transition before playoff records
can change. Legacy seasons lacking that snapshot recover ranks from played
weeks 1–18 (including archived Game Book scores if the schedule lacks scores)
and the same comparator; playoff scores are excluded. Explicitly played games
without recoverable scores fail with a diagnostic instead of fabricated ranks. A genuinely
unplayed season uses the documented initial seed. Once any results exist, all
scheduled regular-season games must be complete for every team before ranks
can be recovered. Partial legacy/offseason seasons are rejected transactionally;
a fully played legacy 18-game season remains eligible for recovery. The frozen ranks travel with
the new schedule and never read current-season standings.

## Home/away, placement and determinism

Each rivalry is one home and one away. Each four-game division block gives two
home and two away games. The two standings games give one each. The extra game
is AFC-hosted in even epoch years and NFC-hosted in odd ones, yielding exactly
9/8 or 8/9 home/away totals. Four-game host orientations reverse on the next
meeting of the relevant division rotation. Over 24 years every team has 204 home
and 204 away games; extra division pairings split hosting three each.

Placement starts from 17 complete perfect-match rounds plus one empty round.
An exact-cover search moves two games from each of eight weeks in **weeks 5–13**
to the empty round. Each team moves once: four byes in each of eight weeks,
one bye per team, and games remain reciprocal. Week 10 initially consolidates
moved games; bounded optimization can move the full round. Byes always stay
in weeks 5–13. This slightly wider window permits deterministic construction
without compromising annual opponents. No bye is represented as a game.

Hard rules: 18 weeks, 272 real games, 17 games and one bye per team, no double
booking, valid references/IDs, exact annual opponent/home-away obligations.
Week 18 is division-only by construction and enforced by strict validation. No hard obligation is relaxed.

Soft preferences: spread rivalry meetings, avoid immediate rematches, distribute
rivalries over the year, minimize long home/away streaks. There are at most 32
placement candidates, 20,000 exact-cover nodes each, and 1,024 local whole-week
swap attempts. Week 18 stays fixed. Whole-week swaps cannot move byes outside
the supported window. The score penalizes close rematches and long venue streaks;
remaining venue-streak preferences are recorded in metadata, not silently treated
as achieved. Failure to construct a valid schedule throws useful diagnostics.

All sorting uses stable identities, and the local PRNG depends only on explicit
year, opaque season ID and schedule seed. No wall-clock or uncontrolled random
source participates. Different seeds can change weeks but not annual obligations.
Canonical IDs use `buildCanonicalGameId` without coercing a string season ID.

## Existing saves and custom leagues

**No schedule is regenerated on load.** No active schedule, completed score,
Game Book, statistic or history row is rewritten by this PR. This includes
untouched legacy seasons; there is no automatic or manual repair UI in V1.
A played invalid opponent repetition may make current-season compliance
mathematically impossible. Such seasons continue on their existing schedule;
the corrected generator applies on the next rollover. V1 does not claim to repair
them. A future repair pathway would need explicit transactional approval and
fixed-result feasibility checks.

Reordered and relocated teams retain numeric IDs and actual conference/division
membership, with `conf/cid` and `div/did` aliases supported. Normal league creation
also preserves supplied IDs instead of replacing them with array indices.
Nonstandard structures explicitly use `custom-round-robin` with `nflValid:false`:
a deterministic 18-round circle schedule, with natural byes for odd team counts.
It is not represented as NFL-valid. Invalid IDs are rejected.

## Pittsburgh example: initial scheduling seed

For year 2026, Pittsburgh is the fourth initial seed in the AFC North:

| Category | Opponents | Games |
| --- | --- | ---: |
| Division, one home + one away | BAL, CIN, CLE | 6 |
| Same-conference full division (AFC East) | BUF, MIA, NE, NYJ | 4 |
| Opposite-conference full division (NFC North) | CHI, DET, GB, MIN | 4 |
| Same-place AFC South/West | TEN, LAC | 2 |
| Extra same-place NFC South | TB | 1 |
| Total | 14 opponents, 11 nondivision | 17 |

Season 2 changes the full division blocks to AFC West and NFC South. Its two
same-place AFC opponents come from East/South, and its extra opponent from NFC
West; the specific teams depend on actual Season-1 divisional finishes.

## Validation evidence

Measured local validation follows.

- Baseline corrected-behavior regressions: **3/3 failed before replacement**
  (regression commit `7c60f1ba`), then passed against the shared authority.
- Complete local unit suite on Node 22: **519 files / 6,397 tests passed**;
  the subsequently added full-league tiebreak-context regression also passed
  after reproducing the incorrect conference-tie ordering before its fix.
- Independent formula oracle: 256 generated schedules over 24 years, varied
  prior-rank permutations and seeds. This checks actual division/rank obligations
  without trusting generated category labels. It also independently measures
  venue streaks across bye weeks.
- Standalone reproducible campaign: **336/336 valid schedules**, 320 seeds,
  24 seasons and 16 paired fingerprints with reversed team-array order.
  Run `node scripts/audit-nfl-schedules.mjs`; measured results, first-year/future-year
  generation times, validation times, search counts and post-run process heap
  are in [the benchmark JSON](pr-1803-schedule-benchmark.json). Heap is a process
  sample after the run, not a peak-memory estimate.
- Full durability suite passed (91 checks before the extra bootstrap-failure
  regression). The production worker played two full regular seasons and
  rolled into Season 3, checked 272 persisted regular-season games per year,
  correct standings totals before playoffs, frozen ranks, save/reload and the
  unchanged first Game Book. Explicit invalid-rank rollover and strict bootstrap
  rejection tests preserve the prior cache/DB state and prevent fallback persistence.
- Dynasty soak: 8 files / 103 tests passed. Simulation type checks passed.
- Production build and offline Netlify production/deploy-preview parity passed.
- Desktop and full 390px first-session smokes passed, including completed scores,
  Game Book navigation and reload. Dedicated Pittsburgh schedule/bye browser
  checks passed at 1280px and 390px, including no document overflow. Schedule/HQ/
  archived-result component checks passed (61 tests).
- Early overlapping validation saturated the local CPU and hit the existing
  simulation soak's 30-second timeout. The complete unit run above passed without
  changing simulation formulas or its timeout. Deploy checks reinstall dependencies,
  so they are serialized with tests that use `node_modules`.

No invalid fallback is persisted. Adversarial cases reject repeated nondivision
opponents, wrong home/away obligations, missing weeks/byes, double booking,
unknown/string-coerced IDs, duplicate IDs, fabricated bye games, malformed week
records and invalid ranks. The remaining observed soft preferences are at most
five consecutive home/away games and a minimum three-week rivalry gap; both
relaxations are explicitly reported when their stricter targets are missed.
Hosted current-head CI and review status are recorded in the PR/final handoff.

Two automated review findings were reproduced with failing regressions and fixed:
partial-season ranks cannot drive rollover, and swapping nondivision games into
Week 18 is rejected even after rebuilding otherwise valid canonical IDs. A real
worker regression checks that partial-season rejection leaves cache, DB and
completed results unchanged; a separate case preserves completed legacy
18-game season recovery.
