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

export function SectionHeader({ eyebrow, title, subtitle, actions = null }) {
  return (
    <div className="app-section-header">
      <div>
        {eyebrow ? <div className="app-section-header__eyebrow">{eyebrow}</div> : null}
        <h2 className="app-section-header__title">{title}</h2>
        {subtitle ? <p className="app-section-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="app-section-header__actions">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({ title, subtitle, actions = null, children, variant = 'elevated' }) {
  return (
    <section className={`app-section-card card variant-${variant}`}>
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

export function HeroCard({ eyebrow, title, subtitle, rightMeta = null, children, actions = null }) {
  return (
    <section className="app-hero-card card">
      <div className="app-hero-card__top">
        <div>
          {eyebrow ? <div className="app-hero-card__eyebrow">{eyebrow}</div> : null}
          <h1 className="app-hero-card__title">{title}</h1>
          {subtitle ? <p className="app-hero-card__subtitle">{subtitle}</p> : null}
        </div>
        {rightMeta ? <div className="app-hero-card__meta">{rightMeta}</div> : null}
      </div>
      {children ? <div className="app-hero-card__body">{children}</div> : null}
      {actions ? <div className="app-hero-card__actions">{actions}</div> : null}
    </section>
  );
}

export const HeroPanel = HeroCard;
export const WeeklyHero = HeroCard;

export function ActionTile({ icon = null, title, subtitle, badge = null, onClick, tone = 'info' }) {
  return (
    <button type="button" className={`app-action-tile tone-${tone}`} onClick={onClick}>
      <div className="app-action-tile__title-row">
        <strong>{icon ? <span className="app-action-tile__icon">{icon}</span> : null}{title}</strong>
        {badge}
      </div>
      {subtitle ? <span className="app-action-tile__subtitle">{subtitle}</span> : null}
    </button>
  );
}

export function StatPill({ label, value, tone = 'neutral' }) {
  return (
    <div className={`app-stat-pill tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function StatStrip({ items = [] }) {
  if (!items.length) return null;
  return (
    <section className="app-stat-strip card">
      {items.map((item) => (
        <StatPill key={`${item.label}-${item.value}`} label={item.label} value={item.value} tone={item.tone ?? 'neutral'} />
      ))}
    </section>
  );
}

export function CompactInsightCard({ title, subtitle, tone = 'info', ctaLabel, onCta }) {
  return (
    <div className={`app-compact-insight tone-${tone}`}>
      <div className="app-compact-insight__text">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {ctaLabel ? <button type="button" className="btn btn-sm" onClick={onCta}>{ctaLabel}</button> : null}
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

export function StatusChip({ label, tone = 'neutral' }) {
  return <span className={`app-status-chip tone-${tone}`}>{label}</span>;
}
export const StatusBadge = StatusChip;

export function CtaRow({ actions = [] }) {
  if (!actions.length) return null;
  return (
    <div className="app-cta-row">
      {actions.map((action) => (
        <button
          key={`${action.label}-${action.href ?? action.variant ?? 'default'}`}
          type="button"
          className={`btn ${action.compact ? 'btn-sm' : ''}`}
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

export function TaskRow({ icon = '🏈', title, subtitle, badge, tone = 'info', onClick }) {
  return (
    <button type="button" className={`app-task-row tone-${tone}`} onClick={onClick}>
      <span className="app-task-row__icon" aria-hidden>{icon}</span>
      <span className="app-task-row__copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </span>
      {badge ? <StatusChip label={badge} tone={tone} /> : null}
      <span className="app-task-row__chevron" aria-hidden>›</span>
    </button>
  );
}

export function TaskList({ tasks = [], onOpenTask }) {
  if (!tasks.length) return <EmptyState title="No urgent tasks" body="You're set for this week. Explore team and scouting upgrades." />;
  return (
    <div className="app-task-list">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          icon={task.icon ?? '🏈'}
          title={task.title}
          subtitle={task.description ?? task.detail}
          badge={task.badge ?? task.ctaLabel}
          tone={task.severity ?? 'info'}
          onClick={() => onOpenTask?.(task)}
        />
      ))}
    </div>
  );
}

export function AgendaItemRow({ item, onOpenTask }) {
  return (
    <TaskRow
      icon={item?.icon ?? '🏈'}
      title={item?.title}
      subtitle={item?.description ?? item?.detail}
      badge={item?.badge ?? item?.ctaLabel}
      tone={item?.severity ?? 'info'}
      onClick={() => onOpenTask?.(item)}
    />
  );
}

export function WeeklyAgenda({ items = [], onOpenTask }) {
  if (!items.length) return <EmptyState title="Agenda clear" body="No urgent front office tasks this week." />;
  return (
    <div className="app-task-list">
      {items.map((item) => <AgendaItemRow key={item.id} item={item} onOpenTask={onOpenTask} />)}
    </div>
  );
}

export function StatPair({ label, value, tone = 'neutral' }) {
  return <StatPill label={label} value={value} tone={tone} />;
}

export function SummaryCard({ title, subtitle, items = [] }) {
  return (
    <SectionCard title={title} subtitle={subtitle} variant="compact">
      <div className="app-stat-strip">
        {items.map((item) => <StatPair key={`${item.label}-${item.value}`} label={item.label} value={item.value} tone={item.tone} />)}
      </div>
    </SectionCard>
  );
}

export function SummaryGrid({ items = [] }) {
  if (!items.length) return null;
  return (
    <div className="app-summary-grid">
      {items.map((item) => <StatPair key={`${item.label}-${item.value}`} label={item.label} value={item.value} tone={item.tone} />)}
    </div>
  );
}

export function NewsList({ items = [], emptyLabel = 'No major league updates yet.' }) {
  if (!items.length) return <p className="app-news-empty">{emptyLabel}</p>;
  return (
    <ul className="app-news-list">
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.headline}</strong>
          {item.detail ? <span>{item.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function CompactNewsCard({ title, subtitle }) {
  return (
    <div className="app-compact-news-card">
      <strong>{title}</strong>
      {subtitle ? <span>{subtitle}</span> : null}
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
