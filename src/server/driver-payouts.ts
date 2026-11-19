import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "./db";
import { ApiError } from "./http";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function recordDriverPayout(adminId: string, formData: FormData) {
  const input = z
    .object({
      riderId: z.string().uuid(),
      periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reference: z.string().max(80),
      amount: z.coerce.number().positive().finite(),
      requestId: z.string().uuid(),
    })
    .parse({
      riderId: formData.get("riderId"),
      periodStart: text(formData, "periodStart"),
      periodEnd: text(formData, "periodEnd"),
      reference: text(formData, "reference"),
      amount: formData.get("amount"),
      requestId: formData.get("requestId"),
    });
  const periodStart = new Date(`${input.periodStart}T00:00:00.000Z`);
  const periodEnd = new Date(`${input.periodEnd}T00:00:00.000Z`);
  const currentWeekStart = new Date();
  currentWeekStart.setUTCHours(0, 0, 0, 0);
  currentWeekStart.setUTCDate(
    currentWeekStart.getUTCDate() - ((currentWeekStart.getUTCDay() + 6) % 7),
  );
  const durationDays = Math.round(
    (periodEnd.getTime() - periodStart.getTime()) / 86_400_000,
  );
  if (
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime()) ||
    periodStart.getUTCDay() !== 1 ||
    durationDays !== 6
  ) {
    throw new ApiError(409, "PAYOUT_NOT_RECORDED", "A driver payout must cover one Monday–Sunday week.");
  }
  if (periodStart > currentWeekStart) {
    throw new ApiError(409, "PAYOUT_NOT_RECORDED", 
      "Payments cannot be recorded for a future week.",
    );
  }

  const result = await sql.begin(async (tx) => {
    const [rider] = await tx`SELECT id FROM riders WHERE id=${input.riderId} FOR UPDATE`;
    if (!rider) throw new ApiError(404, "DRIVER_NOT_FOUND", "This driver no longer exists. Refresh the payment list.");
    const [previous] = await tx<{ id: string; rider_id: string; amount_minor: number; reference: string }[]>`SELECT id,rider_id,amount_minor,reference FROM driver_payouts WHERE id=${input.requestId}`;
    if (previous) {
      if (previous.rider_id !== input.riderId || previous.amount_minor !== input.amount) throw new ApiError(409, "PAYOUT_NOT_RECORDED", "This payment request has already been used.");
      return { amount: previous.amount_minor, count: 0, payoutId: previous.id, reference: previous.reference };
    }
    const assignments = await tx<{ id: string; payout_minor: number }[]>`
      SELECT id,(payout_minor - COALESCE((SELECT SUM(dpi.amount_minor) FROM driver_payout_items dpi JOIN driver_payouts dp ON dp.id=dpi.payout_id WHERE dpi.assignment_id=delivery_assignments.id AND dp.status='PAID'),0))::int AS payout_minor
      FROM delivery_assignments
      WHERE rider_id = ${input.riderId}
        AND status = 'DELIVERED'
        AND payout_status = 'UNPAID'
        AND delivered_at >= (${input.periodStart}::date::timestamp AT TIME ZONE 'Africa/Nairobi')
        AND delivered_at < ((${input.periodEnd}::date + INTERVAL '1 day') AT TIME ZONE 'Africa/Nairobi')
      ORDER BY delivered_at,id
      FOR UPDATE
    `;
    if (!assignments.length) {
      throw new ApiError(409, "PAYOUT_NOT_RECORDED", 
        "This payment has already been settled. Refresh the payment queue and try again.",
      );
    }
    const balance = assignments.reduce(
      (total, assignment) => total + assignment.payout_minor,
      0,
    );
    const amount = input.amount;
    if (!Number.isInteger(amount) || amount > balance) throw new ApiError(409, "PAYOUT_NOT_RECORDED", "Enter a whole-shilling payment no greater than the pending balance.");
    const reference =
      input.reference ||
      `DRV-${input.requestId}`;
    const [payout] = await tx<{ id: string }[]>`
      INSERT INTO driver_payouts (
        id,rider_id,period_start,period_end,amount_minor,status,reference,paid_at,created_by
      ) VALUES (
        ${input.requestId},${input.riderId},${input.periodStart}::date,${input.periodEnd}::date,
        ${amount},'PAID',${reference},now(),${adminId}
      )
      RETURNING id
    `;
    let remaining = amount;
    const settled: string[] = [];
    const allocations: { assignment_id: string; amount_minor: number }[] = [];
    for (const assignment of assignments) {
      const allocated = Math.min(remaining, assignment.payout_minor);
      if (allocated <= 0) continue;
      allocations.push({ assignment_id: assignment.id, amount_minor: allocated });
      remaining -= allocated;
      if (allocated === assignment.payout_minor) settled.push(assignment.id);
    }
    await tx`
      INSERT INTO driver_payout_items (payout_id,assignment_id,amount_minor)
      SELECT ${payout.id},allocation.assignment_id,allocation.amount_minor
      FROM jsonb_to_recordset(${tx.json(allocations)}::jsonb)
        AS allocation(assignment_id uuid,amount_minor integer)
    `;
    const count = allocations.length;
    await tx`
      UPDATE delivery_assignments
      SET payout_status = 'PAID', payout_paid_at = now()
      WHERE id = ANY(${settled})
    `;
    await tx`
      INSERT INTO admin_activity_logs(actor_user_id,action,entity_type,entity_id,metadata)
      VALUES(${adminId},'driver_payout.recorded','driver_payout',${payout.id},
        ${tx.json({ riderId: input.riderId, periodStart: input.periodStart, periodEnd: input.periodEnd,
          amount, deliveries: count, reference })})
    `;
    return {
      amount,
      count,
      payoutId: payout.id,
      reference,
    };
  });
  revalidatePath("/admin/riders");
  revalidatePath("/admin/delivery");
  revalidatePath("/admin/finance");
  return {
    amount: result.amount,
    count: result.count,
    reference: result.reference,
  };
}

