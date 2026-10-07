# Tipsy Theory platform backend

## Local setup

1. Copy `.env.example` to `.env.local` and replace every `replace-with-...` value.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Apply schema and seed data with `npm run db:setup`.
4. Start the application with `npm run dev`.

Migrations are append-only SQL files under `db/migrations`. Seed data is idempotent and deliberately keeps products without verified prices inactive.

## External credentials

- Safaricom Daraja: consumer key, consumer secret, shortcode, passkey, a public HTTPS callback URL, and a random callback token are required before an STK push can be sent.
- OTP: configure an SMS HTTP provider URL/token. Authentication fails closed when it is absent; development never exposes an OTP in an API response.
- Google: configure an OAuth web client whose callback is `${APP_URL}/api/v1/auth/google/callback`.
- Maintenance worker: configure `INTERNAL_JOB_SECRET`, then call `POST /api/v1/internal/maintenance` periodically with `Authorization: Bearer <secret>`. It expires abandoned reservations and dispatches queued notifications.

## Sources of truth

- Prices, availability, delivery fees, coupon validity, discounts, and totals are recalculated on the server.
- Checkout reserves inventory in a PostgreSQL transaction using row locks.
- Only a verified M-Pesa callback can move a payment to `SUCCEEDED` and an order to `CONFIRMED`.
- Payment callbacks are deduplicated by provider event key and checkout request ID.
- Customer order tracking is generated from persisted `order_events`.
- Admin and rider transitions are authorized and validated against allowed state transitions.

## Main API groups

- `/api/v1/catalog`, `/api/v1/content`, `/api/v1/delivery-areas`
- `/api/v1/cart`, `/api/v1/checkout`, `/api/v1/payments`, `/api/v1/orders`
- `/api/v1/auth`, `/api/v1/account`
- `/api/v1/admin/orders`, `/api/v1/rider`
- `/api/v1/internal/maintenance`

All API errors use `{ error: { code, message, details?, requestId } }` and sensitive endpoints are rate-limited or role protected.

