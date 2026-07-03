import React from 'react';

/**
 * ReSignDecisionTabs — presentational triage filter tabs for expiring-contract
 * list surfaces. Renders precomputed { key, label, count } tabs; never filters
 * or evaluates recommendations itself.
 */
export default function ReSignDecisionTabs({ tabs = [], activeTab, onChange }) {
  return (
    <div className="resign-decision-tabs" role="tablist" aria-label="Contract decision filters">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const isEmpty = tab.count === 0;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`resign-decision-tab-${tab.key}`}
            className={[
              'resign-decision-tab',
              isActive ? 'resign-decision-tab--active' : '',
              isEmpty ? 'resign-decision-tab--empty' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onChange?.(tab.key)}
          >
            <span>{tab.label}</span>
            <span className="resign-decision-tab-count">{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}
