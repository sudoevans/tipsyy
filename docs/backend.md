# Tipsy Theoryy platform backend

## Local setup

1. Copy `.env.example` to `.env.local` and replace every `replace-with-...` value.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Apply schema and seed data with `npm run db:setup`.
4. Start the application with `npm run dev`.

Migrations are append-only SQL files under `db/migrations`. Seed data is idempotent and deliberately keeps products without verified prices inactive.

## External credentials

- Safaricom Daraja: consumer key, consumer secret, shortcode, passkey, a public HTTPS callback URL, and a random callback token are required before an STK push can be sent.
- OTP: apply migration `024_blessedtexts_otp.sql` before deploying the BlessedTexts adapter. Set `BLESSEDTEXTS_API_KEY` as a Cloudflare secret and confirm `BLESSEDTEXTS_SENDER_ID=NETWIX_GRID` is approved. The key and OTP code are never returned to the browser or written to logs. The legacy SMS provider settings remain separate for non-OTP messages.
- Google: configure an OAuth web client whose callback is `${APP_URL}/api/v1/auth/google/callback`.
- Maintenance worker: configure `INTERNAL_JOB_SECRET`, then call `POST /api/v1/internal/maintenance` periodically with `Authorization: Bearer <secret>`. It expires abandoned reservations and dispatches queued notifications.

OTP SMS uses separate `otp_sms_messages` and `otp_sms_attempts` tables. The former records one request and its current state; the latter records every provider attempt. `SENT` means BlessedTexts accepted the message and returned a message ID, not that a handset delivery receipt was received. `UNKNOWN` means a request may have reached the provider; retries use the same encrypted code while it remains valid and may produce a duplicate SMS. The encrypted message body is cleared once sending is terminal. Search Cloudflare logs for `service=blessedtexts_otp`, `smsId`, or `requestId`; neither phone numbers nor codes are logged. Definitive provider rejections and expired attempts remain in the database for later Super Admin review.
Keep `SESSION_SECRET` stable while OTPs are queued: it also encrypts the short-lived retry payload.
Set `TEST_DATABASE_URL` to a disposable local PostgreSQL database when running `npm test` to exercise the OTP claim query. That test rolls back its schema and rows.

## Sources of truth

- Prices, availability, delivery fees, coupon validity, discounts, and totals are recalculated on the server.
- Checkout reserves inventory in a PostgreSQL transaction using row locks.
- Only a verified M-Pesa callback can move a payment to `SUCCEEDED` and an order to `CONFIRMED`.
- Payment callbacks are deduplicated by provider event key and checkout request ID.
- Customer order tracking is generated from persisted `order_events`.
- Admin and rider transitions are authorized and validated against allowed state transitions.

## V2 roadmap

- Replace straight-line delivery distance estimates with OSRM driving-route distances using OpenStreetMap road data. Use a self-hosted or managed OSRM instance for production; do not depend on the public demo server. Keep the per-kilometre rate configurable by admins.

## Main API groups

- `/api/v1/catalog`, `/api/v1/content`, `/api/v1/delivery-areas`
- `/api/v1/cart`, `/api/v1/checkout`, `/api/v1/payments`, `/api/v1/orders`
- `/api/v1/auth`, `/api/v1/account`
- `/api/v1/admin/orders`, `/api/v1/rider`
- `/api/v1/internal/maintenance`

All API errors use `{ error: { code, message, details?, requestId } }` and sensitive endpoints are rate-limited or role protected.
