import React from 'react';
import ReactDOM from 'react-dom/client';
import App, { ErrorBoundary } from './App';

// Design system — order matters: base vars (+ Tailwind) first, then components, then overrides
import './styles/base.css';
import './styles/style.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/hub.css';
import './styles/mobile.css';
import './styles/app-mobile.css';
import './styles/stadium-theme.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
