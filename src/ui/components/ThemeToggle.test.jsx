/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsProvider } from '../context/SettingsContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';

afterEach(() => { cleanup(); localStorage.clear(); });

it('keeps permanent and disclosed theme controls on the same persisted preference', () => {
  render(<SettingsProvider><ThemeToggle compact /><ThemeToggle compact /><ThemeToggle /></SettingsProvider>);
  fireEvent.click(screen.getAllByRole('button', { name: 'Switch theme. Currently: System' })[1]);
  expect(screen.getAllByRole('button', { name: 'Switch theme. Currently: Dark' })).toHaveLength(2);
  expect(document.documentElement.classList.contains('force-dark')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Light theme' }));
  expect(screen.getAllByRole('button', { name: 'Switch theme. Currently: Light' })).toHaveLength(2);
  expect(document.body.classList.contains('theme-light')).toBe(true);
  expect(JSON.parse(localStorage.getItem('fgmsim_settings_v1')).theme).toBe('light');
});
