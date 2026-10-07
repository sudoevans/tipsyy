import DriverOperations from "@/components/admin/DriverOperations";
import { sql } from "@/server/db";

export const dynamic = "force-dynamic";

type DriverRow = {
  id: string;
  display_name: string | null;
  phone: string | null;
  user_status: string;
  availability: string;
  vehicle_type: string | null;
  vehicle_registration: string | null;
  active_deliveries: number;
  assignments: number;
  delivered: number;
  cancelled: number;
  earned_minor: number;
  paid_minor: number;
  current_week_unpaid_minor: number;
};

type PayoutRow = {
  id: string;
  rider_id: string;
  rider_name: string | null;
  period_start: Date;
  period_end: Date;
  amount_minor: number;
  status: string;
  reference: string;
  paid_at: Date | null;
  delivery_count: number;
};

type PayoutSummaryRow = {
  earned_minor: number;
  paid_minor: number;
  pending_minor: number;
  current_week_due_minor: number;
  period_start: Date;
  period_end: Date;
};

type DeliveryRow = {
  id: string;
  rider_id: string;
  rider_name: string | null;
  assignment_status: string;
  payout_minor: number;
  payout_status: string;
  order_number: string;
  customer_name: string;
  total_minor: number;
  assigned_at: Date;
  accepted_at: Date | null;
  picked_up_at: Date | null;
  delivered_at: Date | null;
};

export default async function RidersPage() {
  const [drivers, deliveries, payouts, [payoutSummary]] = await Promise.all([
    sql<DriverRow[]>`
      SELECT r.id,u.display_name,u.phone,u.status::text AS user_status,r.availability::text,
             r.vehicle_type,r.vehicle_registration,
             COUNT(da.id) FILTER (WHERE da.status IN ('ASSIGNED','ACCEPTED','PICKED_UP'))::int AS active_deliveries,
             COUNT(da.id)::int AS assignments,
             COUNT(da.id) FILTER (WHERE da.status = 'DELIVERED')::int AS delivered,
             COUNT(da.id) FILTER (WHERE da.status IN ('DECLINED','CANCELLED'))::int AS cancelled,
             COALESCE(SUM(da.payout_minor) FILTER (WHERE da.status = 'DELIVERED'),0)::int AS earned_minor,
             COALESCE(SUM(da.payout_minor) FILTER (WHERE da.status = 'DELIVERED' AND da.payout_status = 'PAID'),0)::int AS paid_minor,
             COALESCE(SUM(da.payout_minor) FILTER (
               WHERE da.status = 'DELIVERED'
                 AND da.payout_status = 'UNPAID'
                 AND da.delivered_at >= date_trunc('week', CURRENT_DATE)
                 AND da.delivered_at < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'
             ),0)::int AS current_week_unpaid_minor
      FROM riders r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN delivery_assignments da ON da.rider_id = r.id
      GROUP BY r.id,u.id
      ORDER BY delivered DESC,u.display_name NULLS LAST
    `,
    sql<DeliveryRow[]>`
      SELECT da.id,da.rider_id,u.display_name AS rider_name,da.status::text AS assignment_status,
             da.payout_minor,da.payout_status,o.order_number,o.customer_name,o.total_minor,
             da.assigned_at,da.accepted_at,da.picked_up_at,da.delivered_at
      FROM delivery_assignments da
      JOIN orders o ON o.id = da.order_id
      JOIN riders r ON r.id = da.rider_id
      JOIN users u ON u.id = r.user_id
      ORDER BY da.assigned_at DESC
      LIMIT 250
    `,
    sql<PayoutRow[]>`
      SELECT dp.id,dp.rider_id,u.display_name AS rider_name,dp.period_start,dp.period_end,
             dp.amount_minor,dp.status,dp.reference,dp.paid_at,
             COUNT(dpi.assignment_id)::int AS delivery_count
      FROM driver_payouts dp
      JOIN riders r ON r.id = dp.rider_id
      JOIN users u ON u.id = r.user_id
      LEFT JOIN driver_payout_items dpi ON dpi.payout_id = dp.id
      GROUP BY dp.id,u.display_name
      ORDER BY COALESCE(dp.paid_at,dp.created_at) DESC
      LIMIT 100
    `,
    sql<PayoutSummaryRow[]>`
      SELECT
        COALESCE(SUM(payout_minor) FILTER (WHERE status = 'DELIVERED'),0)::int AS earned_minor,
        COALESCE(SUM(payout_minor) FILTER (WHERE status = 'DELIVERED' AND payout_status = 'PAID'),0)::int AS paid_minor,
        COALESCE(SUM(payout_minor) FILTER (WHERE status = 'DELIVERED' AND payout_status = 'UNPAID'),0)::int AS pending_minor,
        COALESCE(SUM(payout_minor) FILTER (
          WHERE status = 'DELIVERED'
            AND payout_status = 'UNPAID'
            AND delivered_at >= date_trunc('week', CURRENT_DATE)
            AND delivered_at < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'
        ),0)::int AS current_week_due_minor,
        date_trunc('week', CURRENT_DATE)::date AS period_start,
        (date_trunc('week', CURRENT_DATE)::date + 6) AS period_end
      FROM delivery_assignments
    `,
  ]);

  return (
    <DriverOperations
      drivers={drivers.map((driver) => ({
        id: driver.id,
        name: driver.display_name ?? "Unnamed driver",
        phone: driver.phone ?? "",
        userStatus: driver.user_status,
        availability: driver.availability,
        vehicle: [driver.vehicle_type, driver.vehicle_registration]
          .filter(Boolean)
          .join(" · "),
        activeDeliveries: driver.active_deliveries,
        assignments: driver.assignments,
        delivered: driver.delivered,
        cancelled: driver.cancelled,
        earned: driver.earned_minor,
        paid: driver.paid_minor,
        currentWeekUnpaid: driver.current_week_unpaid_minor,
      }))}
      deliveries={deliveries.map((delivery) => ({
        id: delivery.id,
        riderId: delivery.rider_id,
        riderName: delivery.rider_name ?? "Unnamed driver",
        status: delivery.assignment_status,
        payout: delivery.payout_minor,
        payoutStatus: delivery.payout_status,
        orderNumber: delivery.order_number,
        customerName: delivery.customer_name,
        orderTotal: delivery.total_minor,
        assignedAt: delivery.assigned_at.toISOString(),
        acceptedAt: delivery.accepted_at?.toISOString() ?? null,
        pickedUpAt: delivery.picked_up_at?.toISOString() ?? null,
        deliveredAt: delivery.delivered_at?.toISOString() ?? null,
      }))}
      payouts={payouts.map((payout) => ({
        id: payout.id,
        riderId: payout.rider_id,
        riderName: payout.rider_name ?? "Unnamed driver",
        periodStart: payout.period_start.toISOString(),
        periodEnd: payout.period_end.toISOString(),
        amount: payout.amount_minor,
        status: payout.status,
        reference: payout.reference,
        paidAt: payout.paid_at?.toISOString() ?? null,
        deliveryCount: payout.delivery_count,
      }))}
      payoutSummary={{
        earned: payoutSummary.earned_minor,
        paid: payoutSummary.paid_minor,
        pending: payoutSummary.pending_minor,
        currentWeekDue: payoutSummary.current_week_due_minor,
        periodStart: payoutSummary.period_start.toISOString(),
        periodEnd: payoutSummary.period_end.toISOString(),
      }}
    />
  );
}
