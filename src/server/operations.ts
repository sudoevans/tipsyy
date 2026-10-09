import { z } from "zod";

import { sql, type Transaction, withTransaction } from "./db";
import { ApiError } from "./http";
import { awardDeliveredOrderPoints } from "./loyalty";
import { enqueueTelegramAlert } from "./notifications";

const transitions: Record<string, string[]> = {
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["RIDER_ASSIGNED", "CANCELLED"],
  RIDER_ASSIGNED: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  PAID: ["CONFIRMED"],
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
    VALUES (${actorUserId}, ${action}, ${entityType}, ${entityId}, ${tx.json(JSON.parse(JSON.stringify(metadata)))})
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
        subtotal_minor: number;
        discount_minor: number;
      }[]
    >`
      SELECT id, status, user_id, customer_phone, delivery_fee_minor, subtotal_minor, discount_minor
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
        await enqueueTelegramAlert(tx, {
          eventType: "DRIVER_CANCELLED",
          entityType: "delivery_assignment",
          entityId: assignment.id,
          title: `Delivery cancelled · ${orderNumber}`,
          body: `The delivery assignment for ${orderNumber} was cancelled.`,
        });
      }
    }

    await tx`
      UPDATE orders SET status = ${toStatus}::order_status, delivered_at = COALESCE(${deliveredAt}, delivered_at),
        cancelled_at = COALESCE(${cancelledAt}, cancelled_at), updated_at = now() WHERE id = ${order.id}
    `;
    await tx`
      INSERT INTO order_events (order_id, from_status, to_status, actor_user_id, source, note)
      VALUES (${order.id}, ${order.status}::order_status, ${toStatus}::order_status, ${actorUserId}, ${source}, ${note ?? null})
    `;
    await tx`
      INSERT INTO notifications (user_id, order_id, channel, event_type, destination, subject, body)
      VALUES (${order.user_id}, ${order.id}, 'IN_APP', ${`ORDER_${toStatus}`}, ${order.customer_phone}, ${toStatus.replaceAll("_", " ")},
        ${`Order ${orderNumber} is now ${toStatus.replaceAll("_", " ").toLowerCase()}.`})
    `;
    if (toStatus === "DELIVERED") await awardDeliveredOrderPoints(tx, order);
    await enqueueTelegramAlert(tx, {
      eventType: toStatus === "CANCELLED" ? "ORDER_CANCELLED" : toStatus === "DELIVERED" ? "DRIVER_DROPPED" : `ORDER_${toStatus}`,
      entityType: "order",
      entityId: order.id,
      title: `Order ${orderNumber}`,
      body: `Order ${orderNumber} changed from ${order.status.replaceAll("_", " ")} to ${toStatus.replaceAll("_", " ")}.`,
    });
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
      VALUES (${order.id}, 'READY_FOR_PICKUP'::order_status, 'RIDER_ASSIGNED'::order_status, ${actorUserId}, 'admin', 'Rider assigned.', ${tx.json({ riderId })})
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
    await enqueueTelegramAlert(tx, {
      eventType: "DRIVER_ASSIGNED",
      entityType: "delivery_assignment",
      entityId: assignment.id,
      title: `Driver assigned · ${orderNumber}`,
      body: `A driver was assigned to ${orderNumber}.`,
    });
    return {
      assignmentId: assignment.id,
      orderNumber,
      riderId,
      status: "ASSIGNED",
    };
  });
}

export const manualRefundSchema = z.object({
  amountMinor: z.number().int().positive(),
  providerReference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function recordManualRefund(
  orderNumber: string,
  actorUserId: string,
  input: z.infer<typeof manualRefundSchema>,
) {
  return withTransaction(async (tx) => {
    const [payment] = await tx<{
      payment_id: string;
      order_id: string;
      status: string;
      amount_minor: number;
      refunded_minor: number;
      order_status: string;
    }[]>`
      SELECT p.id AS payment_id,p.order_id,p.status::text,p.amount_minor,p.refunded_minor,o.status::text AS order_status
      FROM payments p JOIN orders o ON o.id=p.order_id
      WHERE o.order_number=${orderNumber}
      FOR UPDATE OF p,o
    `;
    if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "No payment is recorded for this order.");
    if (payment.status !== "SUCCEEDED" && payment.status !== "REFUNDED") {
      throw new ApiError(409, "PAYMENT_NOT_REFUNDABLE", "Only a successful payment can be refunded.");
    }
    const remaining = payment.amount_minor - payment.refunded_minor;
    if (input.amountMinor > remaining) {
      throw new ApiError(422, "REFUND_EXCEEDS_PAYMENT", `Only KSh ${(remaining / 100).toLocaleString("en-KE")} remains refundable.`);
    }
    const [refund] = await tx<{ id: string }[]>`
      INSERT INTO payment_refunds(payment_id,amount_minor,provider_reference,note,recorded_by)
      VALUES(${payment.payment_id},${input.amountMinor},${input.providerReference || null},${input.note || null},${actorUserId})
      RETURNING id
    `;
    const refunded = payment.refunded_minor + input.amountMinor;
    const fullyRefunded = refunded >= payment.amount_minor;
    await tx`UPDATE payments SET refunded_minor=${refunded},status=${fullyRefunded ? "REFUNDED" : "SUCCEEDED"},updated_at=now() WHERE id=${payment.payment_id}`;
    await recordAdminActivity(tx, actorUserId, "payment.refund_recorded", "payment_refund", refund.id, {
      orderNumber,
      amountMinor: input.amountMinor,
      refundedMinor: refunded,
      paymentStatus: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
      providerReference: input.providerReference ?? null,
      note: input.note ?? null,
    });
    await enqueueTelegramAlert(tx, {
      eventType: "ORDER_REFUNDED",
      entityType: "payment_refund",
      entityId: refund.id,
      title: `Refund recorded · ${orderNumber}`,
      body: `A KSh ${(input.amountMinor / 100).toLocaleString("en-KE")} refund was recorded for ${orderNumber}.`,
    });
    return { refundId: refund.id, orderNumber, refundedMinor: refunded, remainingMinor: payment.amount_minor - refunded, orderStatus: payment.order_status };
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
        user_id: string | null;
        customer_phone: string;
        subtotal_minor: number;
        discount_minor: number;
      }[]
    >`
      SELECT da.id, da.status, da.order_id, o.order_number, o.status AS order_status, o.delivery_fee_minor,
             o.user_id,o.customer_phone,o.subtotal_minor,o.discount_minor
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
      UPDATE delivery_assignments SET status = ${assignmentStatus}::assignment_status,
        accepted_at = CASE WHEN ${action} = 'ACCEPT' THEN now() ELSE accepted_at END,
        picked_up_at = CASE WHEN ${action} = 'PICKED_UP' THEN now() ELSE picked_up_at END,
        delivered_at = CASE WHEN ${action} = 'DELIVERED' THEN now() ELSE delivered_at END,
        payout_minor = CASE WHEN ${action} = 'DELIVERED' AND payout_minor = 0 THEN ${assignment.delivery_fee_minor} ELSE payout_minor END
      WHERE id = ${assignment.id}
    `;
    if (orderStatus !== assignment.order_status) {
      await tx`UPDATE orders SET status = ${orderStatus}::order_status, delivered_at = CASE WHEN ${action} = 'DELIVERED' THEN now() ELSE delivered_at END, updated_at = now() WHERE id = ${assignment.order_id}`;
      await tx`
        INSERT INTO order_events (order_id, from_status, to_status, source, note)
        VALUES (${assignment.order_id}, ${assignment.order_status}::order_status, ${orderStatus}::order_status, 'rider', ${action === "PICKED_UP" ? "Rider picked up the order." : "Rider completed the delivery."})
      `;
    }
    if (action === "PICKED_UP" || action === "DELIVERED") {
      await enqueueTelegramAlert(tx, {
        eventType: action === "PICKED_UP" ? "DRIVER_PICKED_UP" : "DRIVER_DROPPED",
        entityType: "delivery_assignment",
        entityId: assignment.id,
        title: `Delivery ${assignment.order_number}`,
        body: `${assignment.order_number} was ${action === "PICKED_UP" ? "picked up" : "delivered"}.`,
      });
    }
    if (action === "DELIVERED") {
      await awardDeliveredOrderPoints(tx, assignment);
      await syncRiderEarnings(tx, riderId);
      await tx`UPDATE riders SET availability = 'ONLINE', updated_at = now() WHERE id = ${riderId}`;
    }
    return { assignmentId, status: assignmentStatus, orderStatus };
  });
}
