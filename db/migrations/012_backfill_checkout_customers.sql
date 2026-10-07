-- Preserve checkout and payment leads as pending customer accounts, including
-- orders created before guest checkout began creating customer records.
INSERT INTO users (phone, display_name, role, status)
SELECT DISTINCT ON (o.customer_phone)
       o.customer_phone,
       o.customer_name,
       'CUSTOMER'::user_role,
       'PENDING'::user_status
FROM orders o
WHERE o.user_id IS NULL
ORDER BY o.customer_phone, o.created_at DESC
ON CONFLICT (phone) DO UPDATE
  SET display_name = COALESCE(NULLIF(users.display_name, ''), EXCLUDED.display_name),
      updated_at = now()
  WHERE users.role = 'CUSTOMER';

INSERT INTO customer_profiles (user_id, legal_name)
SELECT u.id, u.display_name
FROM users u
WHERE u.role = 'CUSTOMER'
ON CONFLICT (user_id) DO NOTHING;

UPDATE orders o
SET user_id = u.id,
    updated_at = now()
FROM users u
WHERE o.user_id IS NULL
  AND u.role = 'CUSTOMER'
  AND u.phone = o.customer_phone;
