CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM ('CUSTOMER', 'RIDER', 'ADMIN', 'SUPPORT');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
CREATE TYPE cart_status AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED');
CREATE TYPE order_status AS ENUM (
  'PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP',
  'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PAYMENT_FAILED',
  'PAYMENT_CANCELLED', 'CANCELLED', 'REFUNDED'
);
CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'REFUNDED');
CREATE TYPE reservation_status AS ENUM ('ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED');
CREATE TYPE rider_availability AS ENUM ('OFFLINE', 'ONLINE', 'BUSY');
CREATE TYPE assignment_status AS ENUM ('ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'DECLINED', 'CANCELLED');
CREATE TYPE promotion_kind AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FEATURED', 'BANNER');
CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(20) UNIQUE,
  email citext UNIQUE,
  google_subject text UNIQUE,
  display_name text,
  role user_role NOT NULL DEFAULT 'CUSTOMER',
  status user_status NOT NULL DEFAULT 'ACTIVE',
  phone_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_identity_present CHECK (phone IS NOT NULL OR email IS NOT NULL OR google_subject IS NOT NULL)
);

CREATE TABLE customer_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  legal_name text,
  date_of_birth date,
  stronger_age_verification_status text,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE phone_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(20) NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 5,
  consumed_at timestamptz,
  request_ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_attempts_valid CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 10)
);
CREATE INDEX phone_otps_lookup_idx ON phone_otps(phone, purpose, created_at DESC);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id, expires_at DESC);

CREATE TABLE delivery_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  secondary_name text,
  fee_minor integer NOT NULL CHECK (fee_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'KES',
  latitude numeric(9,6),
  longitude numeric(9,6),
  service_radius_km numeric(7,2),
  estimated_min_minutes integer,
  estimated_max_minutes integer,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_areas_active_idx ON delivery_areas(active, sort_order);

CREATE TABLE addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivery_area_id uuid REFERENCES delivery_areas(id),
  label text,
  recipient_name text,
  phone varchar(20),
  address_line text NOT NULL,
  landmark text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user_idx ON addresses(user_id, created_at DESC);
CREATE UNIQUE INDEX addresses_one_default_idx ON addresses(user_id) WHERE is_default;

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category_id uuid NOT NULL REFERENCES categories(id),
  brand_id uuid REFERENCES brands(id),
  image_url text,
  alcohol_by_volume numeric(5,2),
  age_restricted boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products(category_id, active);
CREATE INDEX products_brand_idx ON products(brand_id, active);
CREATE INDEX products_search_idx ON products USING gin (to_tsvector('simple', name || ' ' || coalesce(description, '')));

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE,
  label text NOT NULL,
  size_label text,
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  compare_at_price_minor integer CHECK (compare_at_price_minor IS NULL OR compare_at_price_minor >= price_minor),
  currency char(3) NOT NULL DEFAULT 'KES',
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_variants_product_idx ON product_variants(product_id, active);
CREATE UNIQUE INDEX product_variants_default_idx ON product_variants(product_id) WHERE is_default;

CREATE TABLE inventory (
  variant_id uuid PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
  on_hand_quantity integer NOT NULL DEFAULT 0,
  reserved_quantity integer NOT NULL DEFAULT 0,
  sold_quantity bigint NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_nonnegative CHECK (on_hand_quantity >= 0 AND reserved_quantity >= 0 AND sold_quantity >= 0),
  CONSTRAINT inventory_reservation_within_stock CHECK (reserved_quantity <= on_hand_quantity)
);

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  guest_token_hash text UNIQUE,
  delivery_area_id uuid REFERENCES delivery_areas(id),
  coupon_code text,
  status cart_status NOT NULL DEFAULT 'ACTIVE',
  currency char(3) NOT NULL DEFAULT 'KES',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX carts_user_active_idx ON carts(user_id, status, updated_at DESC);

CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cart_id, variant_id)
);

CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind promotion_kind NOT NULL,
  percentage_basis_points integer,
  amount_minor integer,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  usage_limit integer,
  usage_count integer NOT NULL DEFAULT 0,
  minimum_order_minor integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_value_valid CHECK (
    (kind = 'PERCENTAGE' AND percentage_basis_points BETWEEN 1 AND 10000 AND amount_minor IS NULL)
    OR (kind = 'FIXED_AMOUNT' AND amount_minor > 0 AND percentage_basis_points IS NULL)
    OR kind IN ('FEATURED', 'BANNER')
  )
);

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  code citext NOT NULL UNIQUE,
  customer_usage_limit integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE promotion_products (
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, product_id)
);

CREATE TABLE promotion_categories (
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, category_id)
);

CREATE TABLE coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id),
  user_id uuid REFERENCES users(id),
  customer_phone varchar(20),
  order_id uuid,
  discount_minor integer NOT NULL CHECK (discount_minor >= 0),
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE order_number_seq START 2048;

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('TT-' || nextval('order_number_seq')),
  access_token_hash text NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  cart_id uuid REFERENCES carts(id) ON DELETE SET NULL,
  delivery_area_id uuid REFERENCES delivery_areas(id),
  status order_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  customer_name text NOT NULL,
  customer_phone varchar(20) NOT NULL,
  delivery_address jsonb NOT NULL,
  delivery_instructions text,
  currency char(3) NOT NULL DEFAULT 'KES',
  subtotal_minor integer NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor integer NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  delivery_fee_minor integer NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0),
  tax_minor integer NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor integer NOT NULL CHECK (total_minor >= 0),
  coupon_code citext,
  reservation_expires_at timestamptz,
  paid_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_idx ON orders(user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders(status, created_at DESC);
CREATE INDEX orders_phone_idx ON orders(customer_phone, created_at DESC);

ALTER TABLE coupon_redemptions ADD CONSTRAINT coupon_redemptions_order_fk FOREIGN KEY (order_id) REFERENCES orders(id);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text NOT NULL,
  size_label text,
  image_url text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_minor integer NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor integer NOT NULL CHECK (line_total_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON order_items(order_id);

CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  status reservation_status NOT NULL DEFAULT 'ACTIVE',
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, variant_id)
);
CREATE INDEX inventory_reservations_expiry_idx ON inventory_reservations(status, expires_at);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'MPESA',
  status payment_status NOT NULL DEFAULT 'PENDING',
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'KES',
  provider_receipt text UNIQUE,
  payer_phone varchar(20),
  paid_at timestamptz,
  refunded_minor integer NOT NULL DEFAULT 0,
  raw_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments(order_id, created_at DESC);
CREATE INDEX payments_status_idx ON payments(status, created_at DESC);

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  merchant_request_id text,
  checkout_request_id text UNIQUE,
  status payment_status NOT NULL DEFAULT 'PENDING',
  result_code text,
  result_description text,
  request_payload jsonb,
  response_payload jsonb,
  callback_payload jsonb,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX payment_attempts_payment_idx ON payment_attempts(payment_id, initiated_at DESC);
CREATE UNIQUE INDEX payment_attempts_one_pending_idx ON payment_attempts(payment_id) WHERE status = 'PENDING';

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_key text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, event_key)
);

CREATE TABLE order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status order_status NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  source text NOT NULL,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events(order_id, created_at);

CREATE TABLE riders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  availability rider_availability NOT NULL DEFAULT 'OFFLINE',
  vehicle_type text,
  vehicle_registration text,
  current_latitude numeric(9,6),
  current_longitude numeric(9,6),
  earnings_minor bigint NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES riders(id),
  status assignment_status NOT NULL DEFAULT 'ASSIGNED',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  payout_minor integer NOT NULL DEFAULT 0,
  UNIQUE(order_id)
);
CREATE INDEX delivery_assignments_rider_idx ON delivery_assignments(rider_id, status, assigned_at DESC);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  channel text NOT NULL,
  event_type text NOT NULL,
  destination text NOT NULL,
  subject text,
  body text NOT NULL,
  status notification_status NOT NULL DEFAULT 'PENDING',
  provider_message_id text,
  attempts integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_dispatch_idx ON notifications(status, scheduled_at);

CREATE TABLE favourites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, product_id)
);

CREATE TABLE content_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  kind text NOT NULL,
  title text,
  body text,
  image_url text,
  link_url text,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX rate_limits_expiry_idx ON rate_limits(expires_at);
