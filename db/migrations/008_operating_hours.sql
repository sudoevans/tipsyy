INSERT INTO platform_settings (key, value, description)
VALUES (
  'store.operating_hours',
  '{"weekday":{"open":"09:00","close":"22:00"},"weekend":{"open":"10:00","close":"20:00"},"closingSoonMinutes":30}'::jsonb,
  'Store opening hours for weekdays and weekends in Africa/Nairobi.'
)
ON CONFLICT (key) DO NOTHING;
