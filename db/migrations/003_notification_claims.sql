ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS locked_at timestamptz;

