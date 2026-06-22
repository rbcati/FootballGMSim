import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import FrontOfficeBadge, { PERSONA_META } from '../FrontOfficeBadge.jsx';

// ── FrontOfficeBadge ──────────────────────────────────────────────────────────

describe('FrontOfficeBadge', () => {
  it('renders correct label for WIN_NOW', () => {
    const html = renderToString(<FrontOfficeBadge persona="WIN_NOW" />);
    expect(html).toContain('Win Now');
  });

  it('renders correct label for PATIENT_BUILDER', () => {
    const html = renderToString(<FrontOfficeBadge persona="PATIENT_BUILDER" />);
    expect(html).toContain('Rebuilding');
  });

  it('renders correct label for CAP_HOARDER', () => {
    const html = renderToString(<FrontOfficeBadge persona="CAP_HOARDER" />);
    expect(html).toContain('Cap Guarded');
  });

  it('renders correct label for PLAYER_LOYALIST', () => {
    const html = renderToString(<FrontOfficeBadge persona="PLAYER_LOYALIST" />);
    expect(html).toContain('Player Loyalist');
  });

  it('returns null for unknown persona', () => {
    const html = renderToString(<FrontOfficeBadge persona="UNKNOWN" />);
    expect(html).toBe('');
  });

  it('returns null when persona is undefined', () => {
    const html = renderToString(<FrontOfficeBadge persona={undefined} />);
    expect(html).toBe('');
  });

  it('WIN_NOW uses a red-family color', () => {
    const meta = PERSONA_META['WIN_NOW'];
    expect(meta.color.toLowerCase()).toContain('ff');
  });

  it('PATIENT_BUILDER uses a green-family color', () => {
    const meta = PERSONA_META['PATIENT_BUILDER'];
    // Green hex values start high in the G channel
    expect(meta.color).toMatch(/#[0-9a-fA-F]{6}/);
    const g = parseInt(meta.color.slice(3, 5), 16);
    expect(g).toBeGreaterThan(150);
  });

  it('each persona has distinct label text', () => {
    const labels = Object.values(PERSONA_META).map(m => m.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it('each persona has distinct color', () => {
    const colors = Object.values(PERSONA_META).map(m => m.color);
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });
});

// ── TradeCenter/team surface renders badge when frontOffice is present ────────

describe('FrontOfficeBadge — trade surface rendering', () => {
  it('renders badge inline when given a valid persona prop', () => {
    const html = renderToString(
      <div className="trade-target-pill">
        <FrontOfficeBadge persona="WIN_NOW" />
      </div>,
    );
    expect(html).toContain('Win Now');
  });

  it('does not render anything when persona is null', () => {
    const html = renderToString(
      <div className="trade-target-pill">
        <FrontOfficeBadge persona={null} />
      </div>,
    );
    expect(html).not.toContain('Win Now');
    expect(html).not.toContain('Rebuilding');
    expect(html).not.toContain('Cap Guarded');
    expect(html).not.toContain('Player Loyalist');
  });
});
