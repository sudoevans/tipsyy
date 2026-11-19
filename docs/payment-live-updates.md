# Checkout payment updates

Checkout authorizes a WebSocket with its existing order bearer token over HTTPS.
The authorization response sets a two-minute HttpOnly, SameSite cookie scoped to
that order's WebSocket path. The Worker validates its signature, order and Origin
before opening a connection to the order's Durable Object. No credentials are
placed in a WebSocket URL or message.

After each payment status change, a PostgreSQL trigger inserts an outbox event in
the same transaction. The Worker drains the outbox after mutation responses;
minute maintenance drains retryable events if a request dies or publication fails.
The Durable Object broadcasts a status-change signal. Checkout reads the current
authoritative order once on that signal and once on each connection/reconnection.
The ready signal is sent after socket registration to close the subscribe/read race.
There is no two-second database polling or 30-second connection cutoff.

The one-time M-Pesa status query after 30 seconds remains a fallback for a missing
provider callback. It does not close the WebSocket. Heartbeats check connection
health without querying PostgreSQL or M-Pesa. Payment retries still use the same
order and the existing idempotency safeguards.

## Verification

- `npm test`: the existing application policy tests plus the realtime suite.
- `npm run test:realtime`: actual Workers WebSocket/auth/order-isolation tests,
  client reconnection/race tests, and an isolated PostgreSQL WASM test of the
  migration, atomic outbox writes, publication failures and concurrent leases.
- `npm run typecheck` and `npm run build:cloudflare`.

## Rollout

1. Apply `025_payment_live_outbox.sql` before deploying the application. Do not
   change the Supabase database engine; this is an additive PostgreSQL migration.
2. Deploy with Wrangler so the `ORDER_PAYMENT_UPDATES` binding and
   `payment-updates-v1` Durable Object migration are installed with the Worker.
3. Verify `SESSION_SECRET`, Hyperdrive and the minute cron exist in that environment.
4. Verify M-Pesa's configured callback URL reaches this application without a
   maintenance page, challenge, or redirect. A checkout on workers.dev still uses
   the configured callback destination.
5. With a controlled order, cancel a real STK prompt and confirm that the callback
   is processed, `payment.push_delivered` is logged, and checkout changes to
   cancelled. Repeat for a paid prompt and reconnect the browser while pending.

Local Next dev alone cannot serve Worker WebSocket upgrades. Use the Cloudflare
preview (`npm run preview`) for a manual checkout walkthrough. Tests use their
own isolated Durable Object namespace and in-memory PostgreSQL, never live orders
or live STK requests. No SMS, real payment or production migration is needed to
run automated verification.
