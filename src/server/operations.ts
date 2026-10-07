import { z } from "zod";

import { sql, type Transaction, withTransaction } from "./db";
import { ApiError } from "./http";

const transitions: Record<string, string[]> = {
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["RIDER_ASSIGNED", "CANCELLED"],
  RIDER_ASSIGNED: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  PAID: ["CONFIRMED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
};

export const transitionOrderSchema = z.object({
  status: z.enum([
    "CONFIRMED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "RIDER_ASSIGNED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
    "REFUNDED",
  ]),
  note: z.string().trim().max(500).optional(),
});

async function syncRiderEarnings(tx: Transaction, riderId: string) {
  await tx`
    UPDATE riders
    SET earnings_minor = COALESCE((
      SELECT SUM(payout_minor) FROM delivery_assignments
      WHERE rider_id = ${riderId} AND status = 'DELIVERED'
    ), 0), updated_at = now()
    WHERE id = ${riderId}
  `;
}

async function recordAdminActivity(
  tx: Transaction,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  await tx`
    INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (${actorUserId}, ${action}, ${entityType}, ${entityId}, ${tx.json(metadata)})
  `;
}

export async function transitionOrder(
  orderNumber: string,
  toStatus: string,
  actorUserId: string,
  source: string,
  note?: string,
) {
  return withTransaction(async (tx) => {
    const [order] = await tx<
      {
        id: string;
        status: string;
        user_id: string | null;
        customer_phone: string;
        delivery_fee_minor: number;
      }[]
    >`
      SELECT id, status, user_id, customer_phone, delivery_fee_minor
      FROM orders WHERE order_number = ${orderNumber} FOR UPDATE
    `;
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (!(transitions[order.status] ?? []).includes(toStatus)) {
      throw new ApiError(
        409,
        "INVALID_ORDER_TRANSITION",
        `An order cannot move from ${order.status} to ${toStatus}.`,
      );
    }
    const deliveredAt = toStatus === "DELIVERED" ? new Date() : null;
    const cancelledAt = toStatus === "CANCELLED" ? new Date() : null;

    if (["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(toStatus)) {
      const [assignment] = await tx<
        { id: string; rider_id: string; status: string }[]
      >`
        SELECT id, rider_id, status
        FROM delivery_assignments
        WHERE order_id = ${order.id}
        FOR UPDATE
      `;

      if (!assignment && ["OUT_FOR_DELIVERY", "DELIVERED"].includes(toStatus)) {
        throw new ApiError(
          409,
          "DELIVERY_ASSIGNMENT_REQUIRED",
          "Assign a rider before moving this order into delivery.",
        );
      }

      if (
        assignment &&
        toStatus === "DELIVERED" &&
        !["ASSIGNED", "ACCEPTED", "PICKED_UP"].includes(assignment.status)
      ) {
        throw new ApiError(
          409,
          "INVALID_DELIVERY_TRANSITION",
          "This delivery cannot be marked delivered from its current assignment state.",
        );
      }

      if (assignment && toStatus === "OUT_FOR_DELIVERY") {
        await tx`
          UPDATE delivery_assignments
          SET status = 'PICKED_UP', accepted_at = COALESCE(accepted_at, now()), picked_up_at = COALESCE(picked_up_at, now())
          WHERE id = ${assignment.id} AND status IN ('ASSIGNED', 'ACCEPTED')
        `;
      }

      if (assignment && toStatus === "DELIVERED") {
        await tx`
          UPDATE delivery_assignments
          SET status = 'DELIVERED', payout_minor = CASE WHEN payout_minor = 0 THEN ${order.delivery_fee_minor} ELSE payout_minor END,
              accepted_at = COALESCE(accepted_at, now()), picked_up_at = COALESCE(picked_up_at, now()), delivered_at = COALESCE(delivered_at, now())
          WHERE id = ${assignment.id} AND status IN ('ASSIGNED', 'ACCEPTED', 'PICKED_UP')
        `;
        await syncRiderEarnings(tx, assignment.rider_id);
        await tx`UPDATE riders SET availability = 'ONLINE', updated_at = now() WHERE id = ${assignment.rider_id}`;
      }

      if (
        assignment &&
        toStatus === "CANCELLED" &&
        !["DELIVERED", "CANCELLED", "DECLINED"].includes(assignment.status)
      ) {
        await tx`UPDATE delivery_assignments SET status = 'CANCELLED' WHERE id = ${assignment.id}`;
        await tx`UPDATE riders SET availability = 'ONLINE', updated_at = now() WHERE id = ${assignment.rider_id}`;
      }
    }

    await tx`
      UPDATE orders SET status = ${toStatus}, delivered_at = COALESCE(${deliveredAt}, delivered_at),
        cancelled_at = COALESCE(${cancelledAt}, cancelled_at), updated_at = now() WHERE id = ${order.id}
    `;
    await tx`
      INSERT INTO order_events (order_id, from_status, to_status, actor_user_id, source, note)
      VALUES (${order.id}, ${order.status}, ${toStatus}, ${actorUserId}, ${source}, ${note ?? null})
    `;
    await tx`
      INSERT INTO notifications (user_id, order_id, channel, event_type, destination, subject, body)
      VALUES (${order.user_id}, ${order.id}, 'IN_APP', ${`ORDER_${toStatus}`}, ${order.customer_phone}, ${toStatus.replaceAll("_", " ")},
        ${`Order ${orderNumber} is now ${toStatus.replaceAll("_", " ").toLowerCase()}.`})
    `;
    if (source === "admin") {
      await recordAdminActivity(
        tx,
        actorUserId,
        "order.status_changed",
        "order",
        order.id,
        {
          orderNumber,
          fromStatus: order.status,
          toStatus,
          note: note ?? null,
        },
      );
    }
    return { orderNumber, previousStatus: order.status, status: toStatus };
  });
}

export async function listOperationalOrders(status?: string) {
  return sql`
    SELECT o.order_number, o.status, o.customer_name, o.customer_phone, o.delivery_address,
           o.subtotal_minor, o.discount_minor, o.delivery_fee_minor, o.total_minor, o.created_at,
           p.status AS payment_status, p.provider_receipt,
           da.id AS assignment_id, da.status AS assignment_status,
           r.id AS rider_id, u.display_name AS rider_name
    FROM orders o
    LEFT JOIN payments p ON p.order_id = o.id
    LEFT JOIN delivery_assignments da ON da.order_id = o.id
    LEFT JOIN riders r ON r.id = da.rider_id
    LEFT JOIN users u ON u.id = r.user_id
    WHERE (${status ?? null}::text IS NULL OR o.status::text = ${status ?? null})
    ORDER BY o.created_at DESC LIMIT 200
  `;
}

export async function assignRider(
  orderNumber: string,
  riderId: string,
  actorUserId: string,
) {
  return withTransaction(async (tx) => {
    const [order] = await tx<
      { id: string; status: string; delivery_fee_minor: number }[]
    >`
      SELECT id, status, delivery_fee_minor FROM orders WHERE order_number = ${orderNumber} FOR UPDATE
    `;
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (order.status !== "READY_FOR_PICKUP")
      throw new ApiError(
        409,
        "ORDER_NOT_READY",
        "Only ready orders can be assigned.",
      );
    const [rider] = await tx<{ id: string }[]>`
      SELECT id FROM riders WHERE id = ${riderId} AND availability = 'ONLINE' FOR UPDATE
    `;
    if (!rider)
      throw new ApiError(
        409,
        "RIDER_NOT_AVAILABLE",
        "That rider is not currently available.",
      );
    const [assignment] = await tx<{ id: string }[]>`
      INSERT INTO delivery_assignments (order_id, rider_id, payout_minor)
      VALUES (${order.id}, ${rider.id}, ${order.delivery_fee_minor})
      RETURNING id
    `;
    await tx`UPDATE riders SET availability = 'BUSY', updated_at = now() WHERE id = ${rider.id}`;
    await tx`UPDATE orders SET status = 'RIDER_ASSIGNED', updated_at = now() WHERE id = ${order.id}`;
    await tx`
      INSERT INTO order_events (order_id, from_status, to_status, actor_user_id, source, note, metadata)
      VALUES (${order.id}, 'READY_FOR_PICKUP', 'RIDER_ASSIGNED', ${actorUserId}, 'admin', 'Rider assigned.', ${tx.json({ riderId })})
    `;
    await recordAdminActivity(
      tx,
      actorUserId,
      "delivery.assigned",
      "delivery_assignment",
      assignment.id,
      {
        orderNumber,
        riderId,
        payoutMinor: order.delivery_fee_minor,
      },
    );
    return {
      assignmentId: assignment.id,
      orderNumber,
      riderId,
      status: "ASSIGNED",
    };
  });
}

export async function getRiderForUser(userId: string) {
  const [rider] = await sql<
    { id: string; availability: string }[]
  >`SELECT id, availability FROM riders WHERE user_id = ${userId}`;
  if (!rider)
    throw new ApiError(
      403,
      "RIDER_PROFILE_REQUIRED",
      "No rider profile is linked to this account.",
    );
  return rider;
}

export async function listRiderDeliveries(riderId: string) {
  return sql`
    SELECT da.id AS assignment_id, da.status AS assignment_status, da.assigned_at, da.accepted_at,
           da.picked_up_at, da.delivered_at, da.payout_minor, o.order_number, o.status AS order_status,
           o.customer_name, o.customer_phone, o.delivery_address, o.delivery_instructions, o.total_minor
    FROM delivery_assignments da JOIN orders o ON o.id = da.order_id
    WHERE da.rider_id = ${riderId} ORDER BY da.assigned_at DESC LIMIT 100
  `;
}

export async function setRiderAvailability(
  riderId: string,
  availability: "ONLINE" | "OFFLINE",
) {
  const [rider] = await sql<{ availability: string }[]>`
    UPDATE riders SET availability = ${availability}, last_seen_at = now(), updated_at = now()
    WHERE id = ${riderId} AND availability <> 'BUSY' RETURNING availability
  `;
  if (!rider)
    throw new ApiError(
      409,
      "RIDER_BUSY",
      "Finish the active delivery before going offline.",
    );
  return rider;
}

export async function updateRiderAssignment(
  riderId: string,
  assignmentId: string,
  action: "ACCEPT" | "PICKED_UP" | "DELIVERED",
) {
  return withTransaction(async (tx) => {
    const [assignment] = await tx<
      {
        id: string;
        status: string;
        order_id: string;
        order_number: string;
        order_status: string;
        delivery_fee_minor: number;
      }[]
    >`
      SELECT da.id, da.status, da.order_id, o.order_number, o.status AS order_status, o.delivery_fee_minor
      FROM delivery_assignments da JOIN orders o ON o.id = da.order_id
      WHERE da.id = ${assignmentId} AND da.rider_id = ${riderId} FOR UPDATE OF da, o
    `;
    if (!assignment)
      throw new ApiError(
        404,
        "ASSIGNMENT_NOT_FOUND",
        "Delivery assignment not found.",
      );
    const expected =
      action === "ACCEPT"
        ? "ASSIGNED"
        : action === "PICKED_UP"
          ? "ACCEPTED"
          : "PICKED_UP";
    if (assignment.status !== expected)
      throw new ApiError(
        409,
        "INVALID_ASSIGNMENT_TRANSITION",
        `This delivery cannot be marked ${action.toLowerCase()} now.`,
      );
    const assignmentStatus =
      action === "ACCEPT"
        ? "ACCEPTED"
        : action === "PICKED_UP"
          ? "PICKED_UP"
          : "DELIVERED";
    const orderStatus =
      action === "PICKED_UP"
        ? "OUT_FOR_DELIVERY"
        : action === "DELIVERED"
          ? "DELIVERED"
          : assignment.order_status;
    await tx`
      UPDATE delivery_assignments SET status = ${assignmentStatus},
        accepted_at = CASE WHEN ${action} = 'ACCEPT' THEN now() ELSE accepted_at END,
        picked_up_at = CASE WHEN ${action} = 'PICKED_UP' THEN now() ELSE picked_up_at END,
        delivered_at = CASE WHEN ${action} = 'DELIVERED' THEN now() ELSE delivered_at END,
        payout_minor = CASE WHEN ${action} = 'DELIVERED' AND payout_minor = 0 THEN ${assignment.delivery_fee_minor} ELSE payout_minor END
      WHERE id = ${assignment.id}
    `;
    if (orderStatus !== assignment.order_status) {
      await tx`UPDATE orders SET status = ${orderStatus}, delivered_at = CASE WHEN ${action} = 'DELIVERED' THEN now() ELSE delivered_at END, updated_at = now() WHERE id = ${assignment.order_id}`;
      await tx`
        INSERT INTO order_events (order_id, from_status, to_status, source, note)
        VALUES (${assignment.order_id}, ${assignment.order_status}, ${orderStatus}, 'rider', ${action === "PICKED_UP" ? "Rider picked up the order." : "Rider completed the delivery."})
      `;
    }
    if (action === "DELIVERED") {
      await syncRiderEarnings(tx, riderId);
      await tx`UPDATE riders SET availability = 'ONLINE', updated_at = now() WHERE id = ${riderId}`;
    }
    return { assignmentId, status: assignmentStatus, orderStatus };
  });
}
