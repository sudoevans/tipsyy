CREATE TABLE platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (key, value, description)
VALUES ('inventory.low_stock_threshold', '{"quantity":3}'::jsonb, 'Global available-stock level that triggers a low-stock alert.')
ON CONFLICT (key) DO NOTHING;
