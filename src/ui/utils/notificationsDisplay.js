/**
 * notificationsDisplay.js — guards against empty dismissible notification pills.
 *
 * The post-sim / weekly-results area renders each notification as a small
 * dismissible pill with an "×" control. When a notification arrives with no
 * message/text (a stale or malformed entry) the pill rendered as a blank gray
 * block with only an "×" — looking like a broken filter tag or empty chip.
 *
 * This helper filters those out so only notifications with real, visible
 * content render a dismissible control. Pure data helper — no gameplay logic.
 */

export function getNotificationMessage(notification) {
  if (!notification || typeof notification !== 'object') return '';
  const raw = notification.message ?? notification.text ?? '';
  return typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
}

export function getDisplayableNotifications(notifications) {
  if (!Array.isArray(notifications)) return [];
  return notifications.filter((notification) => getNotificationMessage(notification).length > 0);
}

/**
 * Splits displayable notifications into the rows that render individually and
 * the older ones that collapse into a single "+N earlier notices" summary, so
 * routine post-sim messages can't stack over the weekly results on mobile.
 *
 * Warnings and retryable notices are actionable and never collapse — the
 * summary row renders as generic info with only a dismiss-all control, which
 * would silently discard their severity and retry affordance. Only routine
 * info rows count against the cap; newest entries stay visible (the queue
 * appends newest last) and original ordering is preserved.
 */
export function capVisibleNotifications(notifications, maxVisible = 3) {
  const displayable = getDisplayableNotifications(notifications);
  const max = Math.max(1, Number(maxVisible) || 1);
  const isActionable = (n) => n?.level === 'warn' || n?.retryable === true;
  const routine = displayable.filter((n) => !isActionable(n));
  const routineBudget = Math.max(0, max - (displayable.length - routine.length));
  const collapsedCount = Math.max(0, routine.length - routineBudget);
  const collapsed = routine.slice(0, collapsedCount);
  const collapsedSet = new Set(collapsed);
  return {
    visible: displayable.filter((n) => !collapsedSet.has(n)),
    collapsed,
  };
}
