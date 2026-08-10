/**
 * Which notification rules a company has switched on.
 *
 * Lives in `organizations.settings->'notifications'` so that both sides can
 * read it: the Settings screen writes it, and the scheduled Postgres job that
 * creates notifications reads the same key before emitting anything. Keeping it
 * in one place is what stops the switches and the job from disagreeing.
 *
 * Absent keys default to **on**. A company created before this existed, or one
 * that never opened Settings, should still be told when a guest fails to check
 * out — silence is the wrong default for an alert.
 */
export const NOTIFICATION_RULE_KEYS = [
  "upcoming_check_in",
  "upcoming_check_out",
  "late_payment",
  "invoice_due",
  "cleaning_reminder",
  "maintenance_reminder",
  "booking_conflict",
  "apartment_available",
] as const;

export type NotificationRuleKey = (typeof NOTIFICATION_RULE_KEYS)[number];

export function notificationSettings(
  settings: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  const stored = settings?.notifications;
  const table =
    stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(
    NOTIFICATION_RULE_KEYS.map((key) => [key, table[key] !== false]),
  );
}
