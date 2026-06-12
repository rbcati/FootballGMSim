/**
 * Offseason Free Agency Market V2 — post-merge user-flow smoke.
 *
 * Existing e2e coverage (surveyed before adding this spec):
 *  - simulateWeek.spec.js — mid-season week sim only; never enters offseason.
 *  - phase_hydration_regression.spec.js — phase pipeline mechanics
 *    (offseason → free_agency → draft) via gameController, no offer lifecycle.
 *  - core_flow_reliability.spec.js / daily_regression.spec.js — visit the
 *    Free Agency tab during the regular season only.
 *
 * This spec proves the Market V2 loop works from the user's perspective inside
 * the real free_agency phase:
 *   enter offseason → open Free Agency → submit offer → pending panel +
 *   effective-cap reservation → withdraw (reservation releases) → strong
 *   offer → advance FA day(s) → accepted player joins roster / leaves the FA
 *   pool, or the offer stays pending with feedback.
 */
import { test, expect } from '@playwright/test';
import { launchFranchise, goToTab } from './helpers/franchise.js';

const SMOKE_TIMEOUT = 90000;

test.setTimeout(300000);

async function simToPhase(page, targetPhase, timeout = 180000) {
  await page.evaluate((phase) => {
    window.gameController.simToPhase(phase);
  }, targetPhase);
  await page.waitForFunction(
    ({ want }) => {
      const p = window?.state?.league?.phase;
      if (!p) return false;
      if (want === 'offseason') return p === 'offseason' || p === 'offseason_resign';
      return p === want;
    },
    { want: targetPhase },
    { timeout },
  );
}

/** Read the FA payload through the same worker action the UI uses. */
function getFaPayload(page) {
  return page.evaluate(async () => {
    const res = await window.gameController.getFreeAgents();
    return res.payload;
  });
}

/** Newest ledger row for a player (worker returns newest-first). */
function getLedgerRow(page, playerId) {
  return page.evaluate(async (pid) => {
    const res = await window.gameController.getFreeAgents();
    const row = (res.payload.pendingOffers ?? []).find((r) => Number(r.playerId) === Number(pid)) ?? null;
    return row ? { status: row.status, feedback: row.feedback ?? [] } : null;
  }, playerId);
}

/**
 * Pick FA targets the UI will actually let us bid on (no "Cannot Afford"
 * gate) and that buildDecisionTiming keeps pending after a submit: players
 * with live AI bids or elite OVR have patience; cheap low-OVR vets resolve
 * immediately. Returns up to 3 candidates, best first.
 */
function pickCandidates(page) {
  return page.evaluate(async () => {
    const res = await window.gameController.getFreeAgents();
    const p = res.payload;
    const capRoom = Number(p?.capSummary?.capRoom ?? 0);
    // Replicate the UI's fallback ask (FreeAgency.jsx suggestedSalary): the
    // Submit Bid button is replaced by "Cannot Afford" when this exceeds room.
    const POS_MULT = { QB: 2.2, WR: 1.15, RB: 0.7, TE: 1.0, OL: 1.0, DL: 1.0, LB: 0.9, CB: 1.0, S: 0.85 };
    const uiAsk = (fa) => {
      const ovr = fa.ovr ?? 50;
      const age = fa.age ?? 28;
      const base = ovr >= 90 ? 25 : ovr >= 80 ? 15 : ovr >= 70 ? 8 : ovr >= 60 ? 3 : 0.8;
      let raw = base * (POS_MULT[fa.pos] || 1);
      if (age > 32) raw *= 0.7;
      else if (age > 29) raw *= 0.85;
      return Math.max(0.75 + (age > 26 ? 0.25 : 0), Number(raw.toFixed(1)));
    };
    const score = (fa) => ((fa.offers?.count ?? 0) > 0 ? 200 : 0) + (fa.ovr ?? 0) + ((fa.age ?? 99) <= 25 ? 5 : 0);
    const candidates = (p.freeAgents ?? [])
      .filter((fa) => Number(fa?.demandProfile?.askAnnual) > 0 && (fa.ovr ?? 0) >= 60)
      .filter((fa) => {
        const ask = Number(fa.demandProfile.askAnnual);
        return ask * 1.9 + 1 <= capRoom && uiAsk(fa) <= capRoom;
      })
      .sort((a, b) => score(b) - score(a))
      .slice(0, 3)
      .map((fa) => ({
        id: fa.id,
        name: fa.name,
        ask: Number(fa.demandProfile.askAnnual),
        askYears: Math.max(1, Number(fa.demandProfile.askYears ?? 3)),
      }));
    return { capRoom, candidates };
  });
}

/** Drive the real bid form: search the player, open the inline form, confirm. */
async function submitBidViaUi(page, target, annual, years) {
  const search = page.getByPlaceholder('Search players...');
  await search.fill('');
  await search.fill(target.name);
  const row = page.locator('tr', { hasText: target.name }).first();
  await expect(row.getByRole('button', { name: /Submit Bid|Update Bid/ }).first()).toBeVisible({ timeout: 30000 });
  await row.getByRole('button', { name: /Submit Bid|Update Bid/ }).first().click();

  const formRow = page.locator('tr', { hasText: `Your bid for ${target.name}` });
  await expect(formRow).toBeVisible({ timeout: 30000 });
  const inputs = formRow.locator('input[type="number"]');
  await inputs.first().fill(String(annual));
  await inputs.nth(1).fill(String(years));
  await formRow.getByRole('button', { name: 'Confirm Bid' }).click();
}

test('offseason FA loop: submit → reserve cap → withdraw → strong offer → advance day → resolution', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await launchFranchise(page);
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  // ── Reach the real free_agency phase (same path as phase_hydration spec) ──
  await simToPhase(page, 'offseason');
  await expect
    .poll(async () => page.evaluate(() => window?.state?.league?.phase))
    .toBe('offseason_resign');
  await page.evaluate(() => window.gameController.advanceOffseason());
  await page.waitForFunction(() => window?.state?.league?.phase === 'free_agency', { timeout: 120000 });

  // ── Open Free Agency ───────────────────────────────────────────────────────
  await goToTab(page, 'free-agency');
  await expect(page.getByRole('button', { name: /Advance Day/ })).toBeVisible({ timeout: SMOKE_TIMEOUT });
  // No bids yet: the pending offers panel must not render.
  await expect(page.getByTestId('pending-offers-panel')).toHaveCount(0);

  const { candidates } = await pickCandidates(page);
  expect(candidates.length, 'no affordable FA targets in the pool').toBeGreaterThan(0);

  // ── Submit a modest offer that stays pending ───────────────────────────────
  // Some players decide instantly (decision_imminent); try up to 3 targets.
  let target = null;
  let modestOffer = 0;
  for (const candidate of candidates) {
    const modest = Math.round(candidate.ask * 1.15 * 10) / 10;
    await submitBidViaUi(page, candidate, modest, candidate.askYears);
    await expect(page.getByTestId('pending-offers-panel')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId(`pending-offer-${candidate.id}`).first()).toBeVisible({ timeout: 30000 });
    const row = await getLedgerRow(page, candidate.id);
    expect(row, `submitted offer for ${candidate.name} missing from ledger`).not.toBeNull();
    if (row.status === 'pending') {
      target = candidate;
      modestOffer = modest;
      break;
    }
  }
  expect(target, 'no submitted offer stayed pending — cannot exercise the withdraw flow').not.toBeNull();

  // Pending panel row: player name, Pending status, withdraw available.
  const offerRow = page.getByTestId(`pending-offer-${target.id}`).first();
  await expect(offerRow).toContainText(target.name);
  await expect(offerRow.getByText('Pending', { exact: true })).toBeVisible();
  await expect(offerRow.getByRole('button', { name: 'Withdraw' })).toBeVisible();

  // FA table row shows the pending status chip next to the player name.
  await expect(
    page.locator('tr', { hasText: target.name }).first().getByText('Pending', { exact: true }),
  ).toBeVisible();

  // Effective cap reflects the reservation, in the badge and in the payload.
  const capBadge = page.getByTestId('effective-cap-badge');
  await expect(capBadge).toBeVisible();
  await expect(capBadge).toContainText(`reserved $${modestOffer.toFixed(1)}M`);
  const capAfterSubmit = (await getFaPayload(page)).capSummary;
  expect(capAfterSubmit.reservedPendingCap).toBeCloseTo(modestOffer, 1);
  expect(capAfterSubmit.effectiveCapRoom).toBeCloseTo(capAfterSubmit.capRoom - modestOffer, 1);

  // ── Withdraw: the cap reservation must release ─────────────────────────────
  await offerRow.getByRole('button', { name: 'Withdraw' }).click();
  await expect(offerRow.getByText('Withdrawn', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(capBadge).toContainText('reserved $0.0M');
  const capAfterWithdraw = (await getFaPayload(page)).capSummary;
  expect(capAfterWithdraw.reservedPendingCap).toBe(0);
  expect(capAfterWithdraw.effectiveCapRoom).toBeCloseTo(capAfterWithdraw.capRoom, 1);

  // ── Strong offer, then advance FA days until the market resolves it ───────
  const strongOffer = Math.min(
    Math.round(target.ask * 1.8 * 10) / 10,
    Math.round((capAfterWithdraw.capRoom - 1) * 10) / 10,
  );
  await submitBidViaUi(page, target, strongOffer, target.askYears);
  await expect(page.getByTestId(`pending-offer-${target.id}`).first()).toBeVisible({ timeout: 30000 });

  let resolution = null;
  for (let i = 0; i < 3; i += 1) {
    const advanceBtn = page.getByRole('button', { name: /Advance Day/ });
    if (!(await advanceBtn.isVisible().catch(() => false))) break;
    await advanceBtn.click();
    // GET_FREE_AGENTS queues behind ADVANCE_FREE_AGENCY_DAY in the worker, so
    // this payload reflects the fully-processed day.
    resolution = await page.evaluate(async (pid) => {
      const res = await window.gameController.getFreeAgents();
      const p = res.payload;
      const row = (p.pendingOffers ?? []).find((r) => Number(r.playerId) === Number(pid)) ?? null;
      const league = window?.state?.league;
      const userTeam = league?.teams?.find((t) => t.id === league.userTeamId);
      return {
        status: row?.status ?? null,
        feedback: row?.feedback ?? [],
        reserved: Number(p.capSummary?.reservedPendingCap ?? 0),
        inPool: (p.freeAgents ?? []).some((fa) => Number(fa.id) === Number(pid)),
        onRoster: Boolean(
          (userTeam?.roster ?? []).some((rp) => Number(rp?.id) === Number(pid))
          || (userTeam?.rosterIds ?? []).map(Number).includes(Number(pid)),
        ),
        phase: p.phase,
      };
    }, target.id);
    await page.waitForFunction(() => !window?.state?.busy && !window?.state?.simulating, { timeout: SMOKE_TIMEOUT }).catch(() => {});
    if (resolution.status !== 'pending' || resolution.phase !== 'free_agency') break;
  }

  expect(resolution, 'advance-day loop never produced an FA payload').not.toBeNull();
  if (resolution.status === 'accepted') {
    // Accepted: player left the FA pool, joined the roster, reservation freed.
    expect(resolution.inPool).toBe(false);
    expect(resolution.onRoster).toBe(true);
    expect(resolution.reserved).toBe(0);
  } else if (resolution.status === 'pending') {
    // Not resolved yet: the offer must still reserve cap and explain itself.
    expect(resolution.feedback.length).toBeGreaterThan(0);
    expect(resolution.reserved).toBeGreaterThan(0);
  } else {
    // Market resolved against us (signed elsewhere / expired): the loop must
    // not wedge — reservation released, player not silently on our roster.
    expect(['rejected', 'expired']).toContain(resolution.status);
    expect(resolution.onRoster).toBe(false);
    expect(resolution.reserved).toBe(0);
  }

  // ── Re-open Free Agency: the panel survives a remount with the final state ─
  if (resolution.phase === 'free_agency') {
    await goToTab(page, 'roster');
    await goToTab(page, 'free-agency');
    await expect(page.getByTestId('pending-offers-panel')).toBeVisible({ timeout: SMOKE_TIMEOUT });
    const finalLabel = { accepted: 'Accepted', pending: 'Pending', rejected: 'Rejected', expired: 'Expired' }[resolution.status];
    await expect(
      page.getByTestId(`pending-offer-${target.id}`).first().getByText(finalLabel, { exact: true }),
    ).toBeVisible({ timeout: 30000 });
  }
});
