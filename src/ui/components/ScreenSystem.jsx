import React from 'react';

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  metadata = [],
  backLabel,
  onBack,
  primaryAction,
  compact = false,
}) {
  return (
    <header className={`app-screen-header ${compact ? 'is-compact' : ''}`}>
      <div className="app-screen-header__main">
        {(eyebrow || onBack) && (
          <div className="app-screen-header__top">
            {onBack ? <button className="btn app-screen-header__back" onClick={onBack}>← {backLabel ?? 'Back'}</button> : null}
            {eyebrow ? <span className="app-screen-header__eyebrow">{eyebrow}</span> : null}
          </div>
        )}
        <h1 className="app-screen-header__title">{title}</h1>
        {subtitle ? <p className="app-screen-header__subtitle">{subtitle}</p> : null}
      </div>
      {primaryAction ? <div className="app-screen-header__action">{primaryAction}</div> : null}
      {metadata.length > 0 ? (
        <div className="app-screen-header__meta">
          {metadata.map((item) => (
            <span key={`${item.label}-${item.value}`} className="app-screen-meta-pill">
              <strong>{item.label}</strong> {item.value}
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
}

export function SectionCard({ title, subtitle, actions = null, children }) {
  return (
    <section className="app-section-card card">
      {(title || subtitle || actions) ? (
        <div className="app-section-card__header">
          <div>
            {title ? <h3 className="app-section-card__title">{title}</h3> : null}
            {subtitle ? <p className="app-section-card__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="app-section-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="app-section-card__body">{children}</div>
    </section>
  );
}

export function EmptyState({ title, body }) {
  return (
    <div className="app-empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

export function StickySubnav({ title, children }) {
  return (
    <div className="app-sticky-subnav card">
      {title ? <div className="app-sticky-subnav__title">{title}</div> : null}
      <div className="app-sticky-subnav__content">{children}</div>
    </div>
  );
}
