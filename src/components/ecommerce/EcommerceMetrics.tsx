import { ShoppingCart01Icon, Truck01Icon, Users01Icon, Wallet02Icon } from "@untitledui/icons-react/outline";
import type { ComponentType, SVGProps } from "react";

type Metrics = {
  revenue: string;
  orders: string;
  customers: string;
  activeRiders: string;
};

function MetricCard({ Icon, label, value, note }: { Icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; value: string; note: string }) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p><h3 className="mt-2 text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">{value}</h3></div>
        <span className="relative size-10 shrink-0 rounded-xl bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-200"><Icon className="absolute left-1/2 top-1/2 block size-5 -translate-x-1/2 -translate-y-1/2" strokeWidth={2} /></span>
      </div>
      <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">{note}</p>
    </article>
  );
}

export function EcommerceMetrics({ metrics }: { metrics: Metrics }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard Icon={Wallet02Icon} label="Paid revenue" value={metrics.revenue} note="Successful M-Pesa payments" />
      <MetricCard Icon={ShoppingCart01Icon} label="Orders" value={metrics.orders} note="All recorded orders" />
      <MetricCard Icon={Users01Icon} label="Customers" value={metrics.customers} note="Registered customer accounts" />
      <MetricCard Icon={Truck01Icon} label="Riders online" value={metrics.activeRiders} note="Online or completing a delivery" />
    </div>
  );
}
