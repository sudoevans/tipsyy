import { EcommerceMetrics } from "@/components/ecommerce/EcommerceMetrics";
import RecentOrders from "@/components/ecommerce/RecentOrders";
import MonthlySalesChart from "@/components/ecommerce/MonthlySalesChart";
import OperationsAttention from "@/components/admin/OperationsAttention";
import { sql } from "@/server/db";
import { ArrowUpRightIcon, CoinsStacked03Icon, LineChartUp01Icon, ReceiptIcon, User01Icon } from "@untitledui/icons-react/outline";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Operations overview | Tipsy Theoryy", description: "Tipsy Theoryy store operations" };
export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function AdminOverviewPage() {
  const [[summary], recent, monthly, [finance]] = await Promise.all([
    sql<{ revenue_minor: number; order_count: number; customer_count: number; rider_count: number }[]>`
    SELECT
      COALESCE((SELECT SUM(amount_minor) FROM payments WHERE status = 'SUCCEEDED'), 0)::int AS revenue_minor,
      (SELECT COUNT(*) FROM orders)::int AS order_count,
      (SELECT COUNT(*) FROM users WHERE role = 'CUSTOMER')::int AS customer_count,
      (SELECT COUNT(*) FROM riders WHERE availability IN ('ONLINE', 'BUSY'))::int AS rider_count
    `,
    sql<{ id: string; order_number: string; customer_name: string; status: string; total_minor: number; created_at: Date }[]>`
    SELECT id, order_number, customer_name, status::text, total_minor, created_at FROM orders ORDER BY created_at DESC LIMIT 7
    `,
    sql<{ month_number: number; orders: number }[]>`
    SELECT EXTRACT(MONTH FROM created_at)::int AS month_number, COUNT(*)::int AS orders
    FROM orders WHERE created_at >= date_trunc('year', now()) GROUP BY 1 ORDER BY 1
    `,
    sql<{ revenue_minor: number; profit_minor: number; expenses_minor: number; rider_payouts_minor: number }[]>`
      WITH paid AS (SELECT id,total_minor FROM orders WHERE paid_at IS NOT NULL),
      costs AS (SELECT COALESCE(SUM(oi.quantity * pv.cost_price_minor), 0)::bigint value FROM order_items oi JOIN paid o ON o.id=oi.order_id LEFT JOIN product_variants pv ON pv.id=oi.variant_id),
      expenses AS (SELECT COALESCE(SUM(amount_minor), 0)::bigint value FROM expenses),
      riders AS (SELECT COALESCE(SUM(da.payout_minor), 0)::bigint value FROM delivery_assignments da JOIN paid o ON o.id=da.order_id WHERE da.status='DELIVERED'),
      sales AS (SELECT COALESCE(SUM(total_minor), 0)::bigint value FROM paid)
      SELECT sales.value::int revenue_minor,(sales.value-costs.value-expenses.value-riders.value)::int profit_minor,expenses.value::int expenses_minor,riders.value::int rider_payouts_minor FROM sales,costs,expenses,riders
    `,
  ]);
  const monthlyOrders = Array.from({ length: 12 }, (_, index) => monthly.find((row) => row.month_number === index + 1)?.orders ?? 0);
  const financeSnapshot = [
    { label: "Revenue", value: finance?.revenue_minor ?? 0, Icon: CoinsStacked03Icon, tone: "bg-brand-50 text-brand-600" },
    { label: "Net profit", value: finance?.profit_minor ?? 0, Icon: LineChartUp01Icon, tone: Number(finance?.profit_minor ?? 0) < 0 ? "bg-red-50 text-red-600" : "bg-success-50 text-success-600" },
    { label: "Expenses", value: finance?.expenses_minor ?? 0, Icon: ReceiptIcon, tone: "bg-warning-50 text-warning-600" },
    { label: "Rider payouts", value: finance?.rider_payouts_minor ?? 0, Icon: User01Icon, tone: "bg-gray-100 text-gray-600" },
  ];
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12"><p className="text-sm font-medium text-gray-500 dark:text-gray-400">Tipsy Theoryy operations</p><h1 className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">Dashboard</h1></div>
      <div className="col-span-12">
      <EcommerceMetrics metrics={{ revenue: money.format(summary.revenue_minor), orders: summary.order_count.toLocaleString(), customers: summary.customer_count.toLocaleString(), activeRiders: summary.rider_count.toLocaleString() }} />
      </div>
      <div className="col-span-12"><OperationsAttention /></div>
      <div className="col-span-12 space-y-4 xl:col-span-7">
        <MonthlySalesChart data={monthlyOrders} />
        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Finance snapshot</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Current business performance at a glance.</p></div>
            <Link className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-600 transition hover:text-brand-700" href="/admin/finance">View full finance <ArrowUpRightIcon className="size-4" strokeWidth={2} /></Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {financeSnapshot.map(({ label, value, Icon, tone }) => <article className="rounded-lg bg-gray-50 p-3.5 dark:bg-white/[0.04]" key={label}><div className="flex items-center gap-2.5"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-4" strokeWidth={2} /></span><p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p></div><p className={`mt-3 text-xl font-semibold tracking-tight ${label === "Net profit" && Number(value) < 0 ? "text-red-600" : "text-gray-800 dark:text-white/90"}`}>{money.format(Number(value))}</p></article>)}
          </div>
        </section>
      </div>
      <div className="col-span-12 xl:col-span-5">
      <RecentOrders orders={recent.map((order) => ({ id: order.id, orderNumber: order.order_number, customerName: order.customer_name, status: order.status, total: money.format(order.total_minor), createdAt: date.format(order.created_at) }))} />
      </div>
    </div>
  );
}
