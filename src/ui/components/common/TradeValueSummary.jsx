import React from 'react';
import { TRADE_BALANCE } from '../../selectors/deriveTradeContext.js';

const BALANCE_TONE = Object.freeze({
  [TRADE_BALANCE.FAVORABLE]: 'var(--success)',
  [TRADE_BALANCE.UNFAVORABLE]: 'var(--warning)',
  [TRADE_BALANCE.EVEN]: 'var(--text-muted)',
  [TRADE_BALANCE.UNKNOWN]: 'var(--text-muted)',
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
  const tone = BALANCE_TONE[balance] ?? 'var(--text-muted)';

  return (
    <div
      className="card"
      data-testid={testId}
      data-balance={balance}
      style={{
        padding: 'var(--space-3)',
        marginBottom: 'var(--space-3)',
        display: 'grid',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-subtle)', fontWeight: 700 }}>
        Trade Breakdown
      </div>
      {!hasSelection ? (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{EMPTY_COPY}</div>
      ) : limited ? (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{LIMITED_COPY}</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: 10,
                fontWeight: 700,
                color: tone,
                border: `1px solid ${tone}`,
                background: `${tone}14`,
                borderRadius: 999,
                padding: '0 6px',
                lineHeight: 1.6,
                whiteSpace: 'nowrap',
              }}
            >
              Value read
            </span>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: tone }}>
              {context?.userBalanceLabel}
            </span>
          </div>
          {motivationLabels.length > 0 ? (
            <div style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', fontWeight: 700 }}>
                Their interest:
              </span>
              {motivationLabels.map((label) => (
                <div key={label} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {label}
                </div>
              ))}
            </div>
          ) : null}
          {capNote ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{capNote}</div>
          ) : null}
        </>
      )}
    </div>
  );
}
