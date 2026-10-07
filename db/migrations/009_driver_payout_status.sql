ALTER TABLE delivery_assignments
  ADD COLUMN IF NOT EXISTS payout_status text NOT NULL DEFAULT 'UNPAID' CHECK (payout_status IN ('UNPAID', 'PAID')),
  ADD COLUMN IF NOT EXISTS payout_paid_at timestamptz;
