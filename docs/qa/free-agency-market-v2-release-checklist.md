# Free Agency Market V2 — release smoke checklist

Manual QA pass for the offseason loop after Market V2 (#1580/#1581). Run on a
safe starter league advanced into the `free_agency` phase. Automated coverage:
`tests/e2e/offseasonFaFlow.spec.js` (browser),
`tests/integration/offseasonFaSmoke.worker.test.js` and
`tests/integration/freeAgencyMarketV2.worker.test.js` (worker),
`tests/unit/pendingOffersPanelLayout.test.jsx` (panel layout). Use this list
when Playwright browsers are unavailable in the environment.

- [ ] **Submit offer** — open Free Agency, bid on a player. "Your offers"
      panel appears with a Pending row; effective cap badge shows the
      reservation (`Effective cap = cap room − reserved`).
- [ ] **Replace offer** — re-bid on the same player. Still exactly one pending
      row and one reservation (no double-reserve).
- [ ] **Withdraw offer** — row flips to Withdrawn, badge reads
      `reserved $0.0M`, cap room is fully available again.
- [ ] **Advance day** — Advance Day button progresses the FA clock; pending
      offers age and show feedback lines instead of vanishing.
- [ ] **Accepted signing** — a clearly above-ask offer resolves to Accepted
      within a few days; player leaves the FA pool and appears on the roster;
      reservation releases.
- [ ] **Weak rejection** — a clearly below-ask offer never force-signs; it
      resolves Rejected/Expired with feedback and releases its reservation.
- [ ] **Save/load with pending offer** — save with a pending offer, reload the
      slot: the offer is still pending and still reserving cap. A pre-#1580
      save loads with an empty offer ledger and no crash.
