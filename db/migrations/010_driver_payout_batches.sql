CREATE TABLE IF NOT EXISTS driver_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL DEFAULT 'PAID' CHECK (status IN ('PENDING', 'PAID', 'FAILED')),
  reference text NOT NULL UNIQUE,
  paid_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end = period_start + 6)
);

CREATE TABLE IF NOT EXISTS driver_payout_items (
  payout_id uuid NOT NULL REFERENCES driver_payouts(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL UNIQUE REFERENCES delivery_assignments(id),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  PRIMARY KEY (payout_id, assignment_id)
);

CREATE INDEX IF NOT EXISTS driver_payouts_rider_paid_idx
  ON driver_payouts(rider_id, paid_at DESC);
