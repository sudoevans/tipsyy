ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'PENDING';

-- Delivery fees are the current driver payout rule. Backfill assignments created
-- before the payout was written at rider assignment time.
UPDATE delivery_assignments da
SET payout_minor = o.delivery_fee_minor
FROM orders o
WHERE o.id = da.order_id
  AND da.payout_minor = 0
  AND o.delivery_fee_minor > 0;

-- Older admin status changes only updated orders. Bring their delivery records
-- into the same lifecycle so driver activity and earnings stay trustworthy.
UPDATE delivery_assignments da
SET status = CASE
      WHEN o.status = 'DELIVERED' THEN 'DELIVERED'::assignment_status
      WHEN o.status = 'OUT_FOR_DELIVERY' AND da.status IN ('ASSIGNED', 'ACCEPTED') THEN 'PICKED_UP'::assignment_status
      WHEN o.status = 'CANCELLED' AND da.status IN ('ASSIGNED', 'ACCEPTED', 'PICKED_UP') THEN 'CANCELLED'::assignment_status
      ELSE da.status
    END,
    accepted_at = CASE
      WHEN o.status IN ('OUT_FOR_DELIVERY', 'DELIVERED') THEN COALESCE(da.accepted_at, o.updated_at)
      ELSE da.accepted_at
    END,
    picked_up_at = CASE
      WHEN o.status IN ('OUT_FOR_DELIVERY', 'DELIVERED') THEN COALESCE(da.picked_up_at, o.updated_at)
      ELSE da.picked_up_at
    END,
    delivered_at = CASE
      WHEN o.status = 'DELIVERED' THEN COALESCE(da.delivered_at, o.delivered_at, o.updated_at)
      ELSE da.delivered_at
    END
FROM orders o
WHERE o.id = da.order_id
  AND (
    (o.status = 'DELIVERED' AND da.status <> 'DELIVERED')
    OR (o.status = 'OUT_FOR_DELIVERY' AND da.status IN ('ASSIGNED', 'ACCEPTED'))
    OR (o.status = 'CANCELLED' AND da.status IN ('ASSIGNED', 'ACCEPTED', 'PICKED_UP'))
  );

UPDATE riders r
SET earnings_minor = COALESCE(earned.amount_minor, 0),
    availability = CASE
      WHEN EXISTS (
        SELECT 1 FROM delivery_assignments active
        WHERE active.rider_id = r.id AND active.status IN ('ASSIGNED', 'ACCEPTED', 'PICKED_UP')
      ) THEN 'BUSY'::rider_availability
      WHEN r.availability = 'BUSY' THEN 'ONLINE'::rider_availability
      ELSE r.availability
    END,
    updated_at = now()
FROM (
  SELECT rider_id, SUM(payout_minor)::bigint AS amount_minor
  FROM delivery_assignments
  WHERE status = 'DELIVERED'
  GROUP BY rider_id
) earned
WHERE earned.rider_id = r.id;

UPDATE riders r
SET earnings_minor = 0,
    availability = CASE WHEN r.availability = 'BUSY' THEN 'ONLINE'::rider_availability ELSE r.availability END,
    updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM delivery_assignments da
  WHERE da.rider_id = r.id AND da.status = 'DELIVERED'
);

-- Recover historic admin-driven order changes in the audit trail. New changes
-- are recorded transactionally by the operations service.
INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
SELECT oe.actor_user_id,
       'order.status_changed',
       'order',
       oe.order_id::text,
       jsonb_build_object(
         'orderNumber', o.order_number,
         'fromStatus', oe.from_status::text,
         'toStatus', oe.to_status::text,
         'note', oe.note,
         'backfilled', true
       ),
       oe.created_at
FROM order_events oe
JOIN orders o ON o.id = oe.order_id
WHERE oe.source = 'admin'
  AND oe.actor_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM admin_activity_logs log
    WHERE log.actor_user_id = oe.actor_user_id
      AND log.action = 'order.status_changed'
      AND log.entity_type = 'order'
      AND log.entity_id = oe.order_id::text
      AND log.metadata ->> 'toStatus' = oe.to_status::text
  );
