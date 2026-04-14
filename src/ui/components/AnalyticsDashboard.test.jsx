import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import AnalyticsDashboard from './AnalyticsDashboard.jsx';

vi.mock('react-chartjs-2', () => ({
  Line: () => React.createElement('div', { 'data-chart': 'line' }),
  Pie: () => React.createElement('div', { 'data-chart': 'pie' }),
}));

describe('AnalyticsDashboard', () => {
  it('renders key dashboard sections', () => {
    const html = renderToString(
      <AnalyticsDashboard
        league={{ week: 3, seasonId: 1 }}
        actions={{
          getAnalyticsDashboard: () => Promise.resolve({ payload: { analytics: null } }),
        }}
      />,
    );

    expect(html).toContain('Analytics dashboard');
    expect(html).toContain('Expected Points &amp; Win Projection');
    expect(html).toContain('Cap Allocation &amp; Financial Trend');
  });
});
