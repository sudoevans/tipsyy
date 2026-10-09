INSERT INTO platform_settings (key, value, description)
VALUES (
  'delivery.price_per_km',
  '{"amount_ksh_per_km":50}'::jsonb,
  'Delivery charge in KSh per started kilometre from the nearest active store.'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();
