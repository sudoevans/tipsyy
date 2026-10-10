-- Pull Transaction results are a separate source of provider-confirmed money-in.
-- They are deduplicated into the same receipt ledger as callbacks.
ALTER TABLE mpesa_receipts
  DROP CONSTRAINT IF EXISTS mpesa_receipts_source_check;

ALTER TABLE mpesa_receipts
  ADD CONSTRAINT mpesa_receipts_source_check
  CHECK (source IN ('STK_CALLBACK', 'C2B_CONFIRMATION', 'PULL_QUERY'));

CREATE INDEX IF NOT EXISTS mpesa_receipts_order_status_idx
  ON mpesa_receipts(order_id, status, paid_at DESC);
