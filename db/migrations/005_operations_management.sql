ALTER TABLE product_variants
  ADD COLUMN cost_price_minor integer NOT NULL DEFAULT 0 CHECK (cost_price_minor >= 0);

ALTER TABLE delivery_areas
  ADD COLUMN fee_mode text NOT NULL DEFAULT 'STATIC' CHECK (fee_mode IN ('STATIC', 'PER_KM')),
  ADD COLUMN per_km_minor integer NOT NULL DEFAULT 0 CHECK (per_km_minor >= 0),
  ADD COLUMN minimum_fee_minor integer NOT NULL DEFAULT 0 CHECK (minimum_fee_minor >= 0);

ALTER TABLE admin_credentials
  ADD COLUMN permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  contact_name text,
  phone varchar(20),
  email citext,
  payment_terms text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ON_HOLD', 'OFFBOARDED')),
  balance_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vendor_products (
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  vendor_sku text,
  last_cost_minor integer NOT NULL DEFAULT 0 CHECK (last_cost_minor >= 0),
  preferred boolean NOT NULL DEFAULT false,
  PRIMARY KEY (vendor_id, variant_id)
);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
  total_minor integer NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  ordered_at timestamptz,
  expected_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  received_quantity integer NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_cost_minor integer NOT NULL CHECK (unit_cost_minor >= 0)
);

CREATE TABLE vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  purchase_order_id uuid REFERENCES purchase_orders(id),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  reference text,
  status text NOT NULL DEFAULT 'PAID' CHECK (status IN ('PENDING', 'PAID', 'FAILED')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  description text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fleet_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration text NOT NULL UNIQUE,
  vehicle_type text NOT NULL,
  make_model text,
  rider_id uuid UNIQUE REFERENCES riders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED')),
  insurance_expires_at date,
  service_due_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_activity_logs_created_idx ON admin_activity_logs(created_at DESC);
