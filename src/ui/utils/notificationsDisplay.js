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
