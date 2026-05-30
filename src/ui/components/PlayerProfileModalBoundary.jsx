import React, { Component } from "react";

export default class PlayerProfileModalBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[PlayerProfileModalBoundary] Player modal render failed", {
      error,
      info,
      playerId: this.props.playerId,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 9000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}>
          <div style={{
            width: "min(560px, 100%)",
            borderRadius: 12,
            border: "1px solid var(--hairline)",
            background: "var(--surface-elevated)",
            padding: 16,
            display: "grid",
            gap: 10,
          }}>
            <strong>Player unavailable</strong>
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              This player reference could not be resolved from the loaded franchise data. You can close this panel and keep playing.
            </div>
            <div>
              <button className="btn" onClick={this.props.onClose}>Close</button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
