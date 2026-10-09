import type { Transaction } from "./db";

const POINTS_PER_KSH_100 = 1;
const KSH_100_MINOR = 10_000;

export function estimateLoyaltyPoints(subtotalMinor: number, discountMinor: number) {
  return Math.floor(Math.max(0, subtotalMinor - discountMinor) / KSH_100_MINOR) * POINTS_PER_KSH_100;
}

export async function awardDeliveredOrderPoints(
  tx: Transaction,
  order: {
    id: string;
    user_id: string | null;
    customer_phone: string;
    subtotal_minor: number;
    discount_minor: number;
  },
) {
  const eligibleSpend = Math.max(0, order.subtotal_minor - order.discount_minor);
  const points = estimateLoyaltyPoints(order.subtotal_minor, order.discount_minor);
  if (!points) return 0;

  if (!order.user_id) {
    await tx`
      INSERT INTO loyalty_pending_claims(order_id,phone,points)
      VALUES(${order.id},${order.customer_phone},${points})
      ON CONFLICT(order_id) DO NOTHING
    `;
    return points;
  }

  const [entry] = await tx<{ id: string }[]>`
    INSERT INTO loyalty_ledger(user_id,order_id,entry_type,points_delta,eligible_spend_minor,note)
    VALUES(${order.user_id},${order.id},'EARN',${points},${eligibleSpend},'Order delivered')
    ON CONFLICT(order_id) WHERE order_id IS NOT NULL AND entry_type='EARN' DO NOTHING
    RETURNING id
  `;
  if (!entry) return 0;
  await tx`
    INSERT INTO loyalty_accounts(user_id,points_balance) VALUES(${order.user_id},${points})
    ON CONFLICT(user_id) DO UPDATE SET points_balance=loyalty_accounts.points_balance+EXCLUDED.points_balance,updated_at=now()
  `;
  return points;
}

export async function claimPendingLoyaltyPoints(tx: Transaction, userId: string, phone: string) {
  const claims = await tx<{ order_id: string; points: number }[]>`
    UPDATE loyalty_pending_claims SET claimed_by=${userId},claimed_at=now()
    WHERE phone=${phone} AND claimed_at IS NULL
    RETURNING order_id,points
  `;
  let added = 0;
  for (const claim of claims) {
    const [entry] = await tx<{ id: string }[]>`
      INSERT INTO loyalty_ledger(user_id,order_id,entry_type,points_delta,note)
      VALUES(${userId},${claim.order_id},'EARN',${claim.points},'Linked delivered guest order')
      ON CONFLICT(order_id) WHERE order_id IS NOT NULL AND entry_type='EARN' DO NOTHING
      RETURNING id
    `;
    if (!entry) continue;
    await tx`
      INSERT INTO loyalty_accounts(user_id,points_balance) VALUES(${userId},${claim.points})
      ON CONFLICT(user_id) DO UPDATE SET points_balance=loyalty_accounts.points_balance+EXCLUDED.points_balance,updated_at=now()
    `;
    added += claim.points;
  }
  return added;
}
