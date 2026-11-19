-- A status change and its push-delivery record commit atomically.
CREATE TABLE payment_update_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);
CREATE INDEX payment_update_outbox_pending_idx
  ON payment_update_outbox (available_at, created_at) WHERE delivered_at IS NULL;

CREATE FUNCTION enqueue_payment_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO payment_update_outbox (order_id) VALUES (NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_status_updated
  AFTER UPDATE OF status ON payments
  FOR EACH ROW EXECUTE FUNCTION enqueue_payment_update();
