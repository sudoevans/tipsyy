-- Reconcile expired reservations left behind when no checkout request arrived
-- after the reservation window elapsed.
WITH expired AS (
  UPDATE inventory_reservations
  SET status = 'EXPIRED', released_at = now()
  WHERE status = 'ACTIVE' AND expires_at <= now()
  RETURNING variant_id, quantity
), totals AS (
  SELECT variant_id, SUM(quantity)::int AS quantity
  FROM expired
  GROUP BY variant_id
)
UPDATE inventory i
SET reserved_quantity = GREATEST(0, i.reserved_quantity - totals.quantity),
    updated_at = now()
FROM totals
WHERE i.variant_id = totals.variant_id;

WITH cancelled AS (
  UPDATE orders o
  SET status = 'PAYMENT_CANCELLED', cancelled_at = COALESCE(cancelled_at, now()), updated_at = now()
  WHERE o.status = 'PENDING_PAYMENT'
    AND EXISTS (
      SELECT 1 FROM inventory_reservations ir
      WHERE ir.order_id = o.id AND ir.status = 'EXPIRED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM inventory_reservations ir
      WHERE ir.order_id = o.id AND ir.status = 'ACTIVE'
    )
  RETURNING o.id
)
INSERT INTO order_events (order_id, from_status, to_status, source, note)
SELECT id, 'PENDING_PAYMENT', 'PAYMENT_CANCELLED', 'reservation-reconciliation',
       'Stock reservation expired before payment completed.'
FROM cancelled;

UPDATE payments p
SET status = 'TIMED_OUT', updated_at = now()
FROM orders o
WHERE o.id = p.order_id
  AND o.status = 'PAYMENT_CANCELLED'
  AND p.status = 'PENDING';

UPDATE payment_attempts pa
SET status = 'TIMED_OUT', completed_at = now(),
    result_description = COALESCE(result_description, 'M-Pesa prompt timed out after 30 seconds of inactivity.')
FROM payments p
WHERE p.id = pa.payment_id
  AND p.status = 'TIMED_OUT'
  AND pa.status = 'PENDING';

WITH released AS (
  DELETE FROM coupon_redemptions cr
  USING coupons c, orders o
  WHERE c.id = cr.coupon_id
    AND o.id = cr.order_id
    AND o.status = 'PAYMENT_CANCELLED'
    AND EXISTS (
      SELECT 1 FROM inventory_reservations ir
      WHERE ir.order_id = o.id AND ir.status = 'EXPIRED'
    )
  RETURNING c.promotion_id
), counts AS (
  SELECT promotion_id, COUNT(*)::int AS count
  FROM released
  GROUP BY promotion_id
)
UPDATE promotions p
SET usage_count = GREATEST(0, p.usage_count - counts.count), updated_at = now()
FROM counts
WHERE p.id = counts.promotion_id;
