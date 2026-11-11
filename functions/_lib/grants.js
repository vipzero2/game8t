// The effective subscription end is rebuilt from the pre-Stars baseline and
// each non-revoked grant in chronological order. Rebuilding (rather than
// subtracting a flat number of days) preserves later purchases when an
// older partly-consumed payment is refunded.
export const entitlementEndSql = `(
  WITH RECURSIVE ordered AS (
    SELECT ROW_NUMBER() OVER(ORDER BY granted_at, id) AS position,
           granted_at, duration_seconds
    FROM subscription_grants
    WHERE user_id = users.id AND revoked_at IS NULL
  ), timeline(position, expires_at) AS (
    SELECT 0, (SELECT baseline_until FROM subscription_baselines WHERE user_id = users.id)
    UNION ALL
    SELECT ordered.position,
           MAX(timeline.expires_at, ordered.granted_at) + ordered.duration_seconds
    FROM timeline JOIN ordered ON ordered.position = timeline.position + 1
  )
  SELECT expires_at FROM timeline ORDER BY position DESC LIMIT 1
)`;
