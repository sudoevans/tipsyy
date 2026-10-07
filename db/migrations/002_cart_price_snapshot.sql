ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS unit_price_snapshot_minor integer CHECK (unit_price_snapshot_minor IS NULL OR unit_price_snapshot_minor >= 0);

UPDATE cart_items ci
SET unit_price_snapshot_minor = pv.price_minor
FROM product_variants pv
WHERE pv.id = ci.variant_id AND ci.unit_price_snapshot_minor IS NULL;

