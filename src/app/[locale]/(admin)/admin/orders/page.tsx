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
      }[]
    >`SELECT order_number,customer_name,customer_phone,status::text,total_minor,created_at FROM orders WHERE (${q}='' OR order_number ILIKE ${`%${q}%`} OR customer_name ILIKE ${`%${q}%`} OR customer_phone ILIKE ${`%${q}%`}) AND (${status}='all' OR status::text=${status}) ORDER BY created_at DESC LIMIT 100`,
    sql<
      { id: string; display_name: string | null; phone: string | null }[]
    >`SELECT r.id,u.display_name,u.phone FROM riders r JOIN users u ON u.id=r.user_id WHERE u.status='ACTIVE' AND r.availability IN('ONLINE','BUSY') ORDER BY u.display_name NULLS LAST`,
  ]);
  const availableRiders = riders.map((r) => ({
    id: r.id,
    name: r.display_name ?? r.phone ?? "Driver",
  }));
  return (
    <BasicTableOne
      title="Orders"
      description="Search and manage payment, preparation, assignment, and delivery from one queue."
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
          key="a"
          orderNumber={o.order_number}
          status={o.status}
          riders={availableRiders}
        />,
      ])}
    />
  );
}
