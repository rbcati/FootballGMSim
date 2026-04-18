import React from 'react';
import { cn } from "@/lib/utils";

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  metadata = [],
  backLabel,
  onBack,
  primaryAction,
  compact = false,
  className,
}) {
  return (
    <header className={cn("app-screen-header", compact && "is-compact", className)}>
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

export function SectionCard({ title, subtitle, actions = null, children, className, variant = "elevated" }) {
  return (
    <section className={cn("app-section-card card", `variant-${variant}`, className)}>
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

export function HeroCard({ eyebrow, title, subtitle, footer, children, className }) {
  return (
    <div className={cn("app-hero-card", className)}>
      <div className="app-hero-card__content">
        {eyebrow && <span className="app-hero-card__eyebrow">{eyebrow}</span>}
        {title && <h2 className="app-hero-card__title">{title}</h2>}
        {subtitle && <p className="app-hero-card__subtitle">{subtitle}</p>}
        <div className="app-hero-card__body">{children}</div>
      </div>
      {footer && <div className="app-hero-card__footer">{footer}</div>}
    </div>
  );
}

export function ActionTile({ icon, label, sublabel, onClick, disabled, variant = "default", className }) {
  return (
    <button
      type="button"
      className={cn("app-action-tile", `variant-${variant}`, className)}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <div className="app-action-tile__icon">{icon}</div>}
      <div className="app-action-tile__label">{label}</div>
      {sublabel && <div className="app-action-tile__sublabel">{sublabel}</div>}
    </button>
  );
}

export function StatStrip({ children, className }) {
  return (
    <div className={cn("app-stat-strip", className)}>
      {children}
    </div>
  );
}

export function StatPill({ label, value, note, tone = "neutral" }) {
  return (
    <div className={cn("app-stat-pill", `tone-${tone}`)}>
      <span className="app-stat-pill__label">{label}</span>
      <span className="app-stat-pill__value">{value}</span>
      {note && <span className="app-stat-pill__note">{note}</span>}
    </div>
  );
}

export function PriorityRail({ children, className }) {
  return (
    <div className={cn("app-priority-rail", className)}>
      {children}
    </div>
  );
}

export function PriorityItem({ label, detail, tone = "neutral", actionLabel, onAction, className }) {
  return (
    <div className={cn("app-priority-item", `tone-${tone}`, className)}>
      <div className="app-priority-item__content">
        <div className="app-priority-item__label">{label}</div>
        {detail && <div className="app-priority-item__detail">{detail}</div>}
      </div>
      {actionLabel && (
        <button className="btn btn-sm btn-outline app-priority-item__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
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

export function StatusChip({ label, tone = "neutral" }) {
  return <span className={`app-status-chip tone-${tone}`}>{label}</span>;
}

export function CtaRow({ actions = [] }) {
  if (!actions.length) return null;
  return (
    <div className="app-cta-row">
      {actions.map((action) => (
        <button
          key={`${action.label}-${action.href ?? action.variant ?? "default"}`}
          type="button"
          className={cn("btn", action.compact ? "btn-sm" : "", action.variant === 'outline' ? 'btn-outline' : '')}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function CardActionFooter({ children }) {
  if (!children) return null;
  return <div className="app-card-action-footer">{children}</div>;
}

export function CompactListRow({ title, subtitle, meta, children }) {
  return (
    <div className="app-compact-list-row">
      <div className="app-compact-list-row__main">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {meta ? <div className="app-compact-list-row__meta">{meta}</div> : null}
      {children ? <div className="app-compact-list-row__actions">{children}</div> : null}
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
