-- Preserve payout history while allowing several partial payments per delivery.
ALTER TABLE driver_payout_items DROP CONSTRAINT IF EXISTS driver_payout_items_assignment_id_key;
CREATE INDEX IF NOT EXISTS driver_payout_items_assignment_idx ON driver_payout_items(assignment_id);
