CREATE TABLE otp_sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  otp_id uuid NOT NULL REFERENCES phone_otps(id),
  request_id uuid NOT NULL UNIQUE,
  phone_masked varchar(20) NOT NULL,
  purpose text NOT NULL,
  encrypted_body text,
  status text NOT NULL DEFAULT 'PENDING',
  provider_message_id text,
  provider_status_code varchar(10),
  failure_category varchar(40),
  attempts smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_sms_status_valid CHECK (status IN ('PENDING','PROCESSING','UNKNOWN','SENT','FAILED','SUPERSEDED','EXPIRED'))
);
CREATE INDEX otp_sms_dispatch_idx ON otp_sms_messages(status,next_attempt_at);
CREATE INDEX otp_sms_otp_idx ON otp_sms_messages(otp_id);

CREATE TABLE otp_sms_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES otp_sms_messages(id),
  attempt_number smallint NOT NULL,
  status text NOT NULL DEFAULT 'PROCESSING',
  http_status smallint,
  provider_status_code varchar(10),
  provider_message_id text,
  failure_category varchar(40),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(message_id,attempt_number),
  CONSTRAINT otp_sms_attempt_status_valid CHECK (status IN ('PROCESSING','SENT','UNKNOWN','FAILED'))
);
