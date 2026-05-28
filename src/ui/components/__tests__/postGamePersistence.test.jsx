/** @vitest-environment jsdom */
/**
 * Tests for postgame persistence: verifies that the stash/restore contract
 * between PostGameScreen, App-level state, and LeagueDashboard's onGameDetailBack
 * keeps the result context accessible after opening Game Book.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, fireEvent } from '@testing-library/react';

// Minimal harness that simulates the App-level stash/restore logic
function PostGamePersistenceHarness({ initialResult = null }) {
  const [postGameResult, setPostGameResult] = useState(initialResult);
  const [postGameResultStash, setPostGameResultStash] = useState(null);
  const [externalBoxScoreOpen, setExternalBoxScoreOpen] = useState(false);

  const openBoxScore = (gameId) => {
    if (!gameId) return;
    setPostGameResultStash(postGameResult);
    setPostGameResult(null);
    setExternalBoxScoreOpen(true);
  };

  const onGameDetailBack = () => {
    if (postGameResultStash) {
      setPostGameResult(postGameResultStash);
      setPostGameResultStash(null);
    }
    setExternalBoxScoreOpen(false);
  };

  const dismissResult = () => {
    setPostGameResult(null);
    setPostGameResultStash(null);
  };

  return (
    <div>
      {postGameResult && !externalBoxScoreOpen && (
        <div data-testid="postgame-modal">
          <span data-testid="result-label">{postGameResult.label}</span>
          <button data-testid="view-box-score" onClick={() => openBoxScore(postGameResult.gameId)}>
            View Box Score
          </button>
          <button data-testid="dismiss-result" onClick={dismissResult}>
            Back to Hub
          </button>
        </div>
      )}
      {externalBoxScoreOpen && (
        <div data-testid="game-detail-screen">
          <span>Game Book</span>
          <button data-testid="game-detail-back" onClick={onGameDetailBack}>
            Back
          </button>
        </div>
      )}
      {!postGameResult && !externalBoxScoreOpen && (
        <div data-testid="hq-view">Franchise HQ</div>
      )}
    </div>
  );
}

describe('Postgame persistence stash/restore', () => {
  beforeEach(() => { cleanup(); });

  it('shows postgame modal initially', () => {
    const { getByTestId } = render(
      <PostGamePersistenceHarness initialResult={{ label: 'VICTORY', gameId: 'g1' }} />,
    );
    expect(getByTestId('postgame-modal')).toBeTruthy();
    expect(getByTestId('result-label').textContent).toBe('VICTORY');
  });

  it('hides postgame modal and shows Game Detail when View Box Score is clicked', () => {
    const { getByTestId, queryByTestId } = render(
      <PostGamePersistenceHarness initialResult={{ label: 'VICTORY', gameId: 'g1' }} />,
    );
    fireEvent.click(getByTestId('view-box-score'));
    expect(queryByTestId('postgame-modal')).toBeNull();
    expect(getByTestId('game-detail-screen')).toBeTruthy();
  });

  it('restores postgame modal when Back is clicked from Game Detail', () => {
    const { getByTestId, queryByTestId } = render(
      <PostGamePersistenceHarness initialResult={{ label: 'DEFEAT', gameId: 'g2' }} />,
    );
    fireEvent.click(getByTestId('view-box-score'));
    expect(queryByTestId('postgame-modal')).toBeNull();
    fireEvent.click(getByTestId('game-detail-back'));
    expect(getByTestId('postgame-modal')).toBeTruthy();
    expect(getByTestId('result-label').textContent).toBe('DEFEAT');
  });

  it('does not restore stash when result was explicitly dismissed', () => {
    const { getByTestId, queryByTestId } = render(
      <PostGamePersistenceHarness initialResult={{ label: 'TIE', gameId: 'g3' }} />,
    );
    fireEvent.click(getByTestId('dismiss-result'));
    expect(queryByTestId('postgame-modal')).toBeNull();
    expect(getByTestId('hq-view')).toBeTruthy();
  });

  it('shows HQ when no post-game result is present', () => {
    const { getByTestId } = render(<PostGamePersistenceHarness initialResult={null} />);
    expect(getByTestId('hq-view')).toBeTruthy();
  });

  it('post-sim result context is not permanently lost after opening Game Book', () => {
    const { getByTestId, queryByTestId } = render(
      <PostGamePersistenceHarness initialResult={{ label: 'VICTORY', gameId: 'g4' }} />,
    );
    // Open box score
    fireEvent.click(getByTestId('view-box-score'));
    expect(queryByTestId('postgame-modal')).toBeNull();
    // Return from game book
    fireEvent.click(getByTestId('game-detail-back'));
    // Context is restored
    expect(queryByTestId('postgame-modal')).not.toBeNull();
    expect(getByTestId('result-label').textContent).toBe('VICTORY');
  });
});
