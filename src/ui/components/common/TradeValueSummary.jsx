import React from 'react';
import { TRADE_BALANCE } from '../../selectors/deriveTradeContext.js';

const BALANCE_TONE_CLASS = Object.freeze({
  [TRADE_BALANCE.FAVORABLE]: 'trade-value-summary__value-row--favorable',
  [TRADE_BALANCE.UNFAVORABLE]: 'trade-value-summary__value-row--unfavorable',
  [TRADE_BALANCE.EVEN]: 'trade-value-summary__value-row--even',
  [TRADE_BALANCE.UNKNOWN]: 'trade-value-summary__value-row--unknown',
});

const EMPTY_COPY = 'Add players or picks to preview trade context.';
const LIMITED_COPY = 'Limited trade context available.';

/**
 * TradeValueSummary — the "Trade Breakdown" card for the trade builder.
 *
 * Purely presentational: it renders a TradeContext produced by the
 * display-only `deriveTradeContext` selector. It never shows raw signal
 * codes — only the plain-language labels — and it changes no trade,
 * valuation, cap, or acceptance behavior.
 *
 * @param {object} props
 * @param {import('../../selectors/deriveTradeContext.js').TradeContext} [props.context]
 * @param {boolean} [props.hasSelection] Whether any asset is in the package.
 * @param {string}  [props.testId]
 */
export default function TradeValueSummary({
  context,
  hasSelection = true,
  testId = 'trade-value-summary',
}) {
  const balance = context?.userBalance ?? TRADE_BALANCE.UNKNOWN;
  const motivationLabels = Array.isArray(context?.motivationLabels)
    ? context.motivationLabels.slice(0, 2)
    : [];
  const capNote = context?.capNote ?? null;
  const limited =
    balance === TRADE_BALANCE.UNKNOWN && motivationLabels.length === 0 && !capNote;
  const toneClass = BALANCE_TONE_CLASS[balance] ?? BALANCE_TONE_CLASS[TRADE_BALANCE.UNKNOWN];

  return (
    <div
      className="card trade-value-summary"
      data-testid={testId}
      data-balance={balance}
    >
      <div className="trade-value-summary__eyebrow">Trade Breakdown</div>
      {!hasSelection ? (
        <div className="trade-value-summary__copy">{EMPTY_COPY}</div>
      ) : limited ? (
        <div className="trade-value-summary__copy">{LIMITED_COPY}</div>
      ) : (
        <>
          <div className={`trade-value-summary__value-row ${toneClass}`}>
            <span className="trade-value-summary__pill">Value read</span>
            <span className="trade-value-summary__balance-label">
              {context?.userBalanceLabel}
            </span>
          </div>
          {motivationLabels.length > 0 ? (
            <div className="trade-value-summary__interest">
              <span className="trade-value-summary__interest-label">
                Their interest:
              </span>
              {motivationLabels.map((label) => (
                <div key={label} className="trade-value-summary__copy">
                  {label}
                </div>
              ))}
            </div>
          ) : null}
          {capNote ? (
            <div className="trade-value-summary__copy">{capNote}</div>
          ) : null}
        </>
      )}
    </div>
  );
}
