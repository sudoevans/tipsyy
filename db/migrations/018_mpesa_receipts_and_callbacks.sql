-- Keep an idempotent ledger of every successful M-Pesa credit we learn about,
-- even when it cannot safely be attached to an order yet.
CREATE TABLE IF NOT EXISTS mpesa_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt text NOT NULL,
  source text NOT NULL CHECK (source IN ('STK_CALLBACK', 'C2B_CONFIRMATION')),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  payer_phone varchar(25),
  bill_reference text,
  paid_at timestamptz,
  payment_id uuid REFERENCES payments(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'UNMATCHED' CHECK (status IN ('UNMATCHED', 'MATCHED', 'REVIEW')),
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mpesa_receipts_receipt_unique_ci UNIQUE (receipt)
);
CREATE INDEX IF NOT EXISTS mpesa_receipts_status_received_idx
  ON mpesa_receipts(status, received_at DESC);
CREATE INDEX IF NOT EXISTS mpesa_receipts_bill_reference_idx
  ON mpesa_receipts(bill_reference);

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

-- A retried callback may contain a new/updated payload for the same checkout
-- request. Store each distinct payload idempotently instead of treating that
-- valid delivery as a conflict and acknowledging it as if it were processed.
-- Existing webhook event keys remain untouched; new deliveries use
-- checkoutRequestId:payloadDigest as the idempotency key.
