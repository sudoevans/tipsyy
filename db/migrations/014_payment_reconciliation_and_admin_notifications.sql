ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'PAID_REQUIRES_REVIEW';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'RECONCILING';

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS settlement_source text,
  ADD COLUMN IF NOT EXISTS manually_confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manually_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_confirmation_note text;

UPDATE payments
SET settlement_source = 'MPESA_CALLBACK'
WHERE status = 'SUCCEEDED' AND settlement_source IS NULL;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_receipt_key;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_receipt_unique_ci
  ON payments (lower(provider_receipt)) WHERE provider_receipt IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_per_order_idx ON payments(order_id);

ALTER TABLE payment_attempts
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS callback_received_at timestamptz;

CREATE TYPE payment_investigation_status AS ENUM (
  'OPEN', 'RECONCILING', 'MATCHED', 'REJECTED', 'CONFIRMED', 'CLOSED'
);

CREATE TABLE payment_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  customer_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  claimed_receipt text NOT NULL,
  status payment_investigation_status NOT NULL DEFAULT 'OPEN',
  provider_reference text,
  provider_result jsonb,
  provider_checked_at timestamptz,
  provider_error text,
  reported_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  manual_paid_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_investigations_status_idx ON payment_investigations(status, reported_at DESC);
CREATE INDEX payment_investigations_receipt_idx ON payment_investigations(lower(claimed_receipt));
CREATE UNIQUE INDEX payment_investigations_one_active_payment_idx
  ON payment_investigations(payment_id)
  WHERE status IN ('OPEN', 'RECONCILING', 'MATCHED');

CREATE TYPE admin_notification_severity AS ENUM ('INFO', 'WARNING', 'CRITICAL');

CREATE TABLE admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  severity admin_notification_severity NOT NULL DEFAULT 'INFO',
  title text NOT NULL,
  body text NOT NULL,
  href text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_notifications_recent_idx ON admin_notifications(created_at DESC);
CREATE INDEX admin_notifications_entity_idx ON admin_notifications(entity_type, entity_id, created_at DESC);
CREATE UNIQUE INDEX admin_notifications_one_open_entity_event_idx
  ON admin_notifications(event_type, entity_type, entity_id)
  WHERE resolved_at IS NULL;

CREATE TABLE admin_notification_recipients (
  notification_id uuid NOT NULL REFERENCES admin_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz,
  PRIMARY KEY(notification_id, user_id)
);
CREATE INDEX admin_notification_recipients_unread_idx
  ON admin_notification_recipients(user_id, read_at, notification_id);
