-- Keep completed carts for order history while allowing a guest to start a new
-- active cart after checkout. A token may have many historical carts, but only
-- one current cart.
ALTER TABLE carts DROP CONSTRAINT IF EXISTS carts_guest_token_hash_key;
DROP INDEX IF EXISTS carts_guest_token_hash_key;

CREATE UNIQUE INDEX IF NOT EXISTS carts_active_guest_token_hash_key
  ON carts (guest_token_hash)
  WHERE guest_token_hash IS NOT NULL AND status = 'ACTIVE';
