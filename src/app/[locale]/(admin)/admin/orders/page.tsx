import AdminOrderActions from "@/components/admin/AdminOrderActions";
import OrderFilters from "@/components/admin/OrderFilters";
import BasicTableOne from "@/components/tables/BasicTableOne";
import Badge from "@/components/ui/badge/Badge";
import { sql } from "@/server/db";

export const dynamic = "force-dynamic";
const money = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});
const date = new Intl.DateTimeFormat("en-KE", {
  dateStyle: "medium",
  timeStyle: "short",
});
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q = "", status = "all" } = await searchParams;
  const [orders, riders] = await Promise.all([
    sql<
      {
        order_number: string;
        customer_name: string;
        customer_phone: string;
        status: string;
        total_minor: number;
        created_at: Date;
        payment_status: string | null;
        payment_amount_minor: number;
        refunded_minor: number;
      }[]
    >`SELECT o.order_number,o.customer_name,o.customer_phone,o.status::text,o.total_minor,o.created_at,p.status::text AS payment_status,COALESCE(p.amount_minor,0)::int AS payment_amount_minor,COALESCE(p.refunded_minor,0)::int AS refunded_minor
       FROM orders o
       LEFT JOIN payments p ON p.order_id=o.id
       WHERE (${q}='' OR o.order_number ILIKE ${`%${q}%`} OR o.customer_name ILIKE ${`%${q}%`} OR o.customer_phone ILIKE ${`%${q}%`})
         AND (${status}='all' OR o.status::text=${status})
       ORDER BY o.created_at DESC LIMIT 100`,
    sql<
      { id: string; display_name: string | null; phone: string | null; busy: boolean }[]
    >`SELECT r.id,u.display_name,u.phone,
         EXISTS (
           SELECT 1 FROM delivery_assignments da
           WHERE da.rider_id = r.id AND da.status IN ('ASSIGNED','ACCEPTED','PICKED_UP')
         ) AS busy
       FROM riders r JOIN users u ON u.id=r.user_id
       WHERE u.status='ACTIVE'
       ORDER BY busy ASC,u.display_name NULLS LAST`,
  ]);
  const riderOptions = riders.map((r) => ({
    id: r.id,
    name: r.display_name ?? r.phone ?? "Driver",
    phone: r.phone ?? "",
    busy: r.busy,
  }));
  return (
    <BasicTableOne
      title="Orders"
      actions={<OrderFilters />}
      columns={[
        "Order",
        "Customer",
        "Phone",
        "Placed",
        "Total",
        "Status",
        "Action",
      ]}
      empty="No orders match this search."
      rows={orders.map((o) => [
        <span
          key="n"
          className="font-semibold text-gray-800 dark:text-white/90"
        >
          {o.order_number}
        </span>,
        o.customer_name,
        o.customer_phone,
        date.format(o.created_at),
        <span
          key="t"
          className="font-semibold text-gray-800 dark:text-white/90"
        >
          {money.format(o.total_minor)}
        </span>,
        <Badge
          key="s"
          size="sm"
          color={
            ["DELIVERED", "CONFIRMED"].includes(o.status)
              ? "success"
              : ["CANCELLED", "PAYMENT_FAILED"].includes(o.status)
                ? "error"
                : "warning"
          }
        >
          {o.status.replaceAll("_", " ")}
        </Badge>,
        <AdminOrderActions
          key={`${o.order_number}:${o.status}`}
          orderNumber={o.order_number}
          status={o.status}
          riders={riderOptions}
          paymentStatus={o.payment_status}
          paymentAmountMinor={o.payment_amount_minor}
          refundedMinor={o.refunded_minor}
        />,
      ])}
    />
  );
}
