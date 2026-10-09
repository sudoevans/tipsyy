CREATE TABLE store_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  latitude numeric(10,7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(10,7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX store_locations_active_idx ON store_locations(active) WHERE active = true;

INSERT INTO store_locations (name, address, latitude, longitude)
SELECT 'Main store', 'J44J+HW Gathehu', -0.3935871, 37.1322716
WHERE NOT EXISTS (SELECT 1 FROM store_locations);

INSERT INTO platform_settings (key, value, description)
VALUES ('delivery.price_per_km', '{"amount_minor":5000}'::jsonb, 'Delivery charge in KSh per started kilometre from the nearest active store.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE orders
  ADD COLUMN fulfillment_store_id uuid REFERENCES store_locations(id) ON DELETE SET NULL,
  ADD COLUMN delivery_distance_km numeric(8,2) CHECK (delivery_distance_km IS NULL OR delivery_distance_km >= 0);
