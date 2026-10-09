ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS storefront_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('INITIAL_STOCK', 'RESTOCK')),
  quantity integer NOT NULL CHECK (quantity > 0),
  on_hand_before integer NOT NULL CHECK (on_hand_before >= 0),
  on_hand_after integer NOT NULL CHECK (on_hand_after >= on_hand_before),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_variant_idx
  ON inventory_movements(variant_id, created_at DESC);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedup_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_key_idx
  ON notifications(dedup_key) WHERE dedup_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  points_balance bigint NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  entry_type text NOT NULL CHECK (entry_type IN ('EARN', 'ADJUSTMENT')),
  points_delta bigint NOT NULL CHECK (points_delta <> 0),
  eligible_spend_minor integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_order_earn_idx
  ON loyalty_ledger(order_id) WHERE order_id IS NOT NULL AND entry_type = 'EARN';
CREATE INDEX IF NOT EXISTS loyalty_ledger_user_idx
  ON loyalty_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS loyalty_pending_claims (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
  phone varchar(20) NOT NULL,
  points bigint NOT NULL CHECK (points > 0),
  claimed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  provider_reference text,
  note text,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_refunds_payment_idx
  ON payment_refunds(payment_id, created_at DESC);
