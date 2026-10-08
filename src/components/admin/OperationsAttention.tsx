"use client";

import { useAdminNotifications } from "./AdminNotificationsProvider";
import { AlertTriangleIcon, CreditCardRefreshIcon, ShoppingBag01Icon } from "@untitledui/icons-react/outline";
import { Link } from "@/i18n/navigation";

const cards = [
  { key: "newOrders", label: "New paid orders", href: "/admin/orders", Icon: ShoppingBag01Icon, tone: "text-brand-600 bg-brand-50" },
  { key: "openInvestigations", label: "Payment reports", href: "/admin/transactions", Icon: CreditCardRefreshIcon, tone: "text-red-600 bg-red-50" },
  { key: "lowStock", label: "Low stock items", href: "/admin/inventory", Icon: AlertTriangleIcon, tone: "text-warning-600 bg-warning-50" },
] as const;

export default function OperationsAttention() {
  const { summary } = useAdminNotifications();
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Needs attention</h2><p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Live operations signals for your team.</p></div>{summary.unread ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">{summary.unread} unread</span> : null}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {cards.map(({ key, label, href, Icon, tone }) => {
          const value = summary[key];
          return <Link className="group flex items-center gap-3 rounded-lg border border-gray-100 p-3 transition hover:border-brand-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.04]" href={href} key={key}><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-4.5" strokeWidth={2} /></span><span className="min-w-0"><span className="block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span><span className={`mt-0.5 block text-lg font-semibold ${value ? "text-gray-900 dark:text-white" : "text-gray-500"}`}>{value}</span></span>{value ? <span className="ml-auto size-2 shrink-0 rounded-full bg-red-500" /> : null}</Link>;
        })}
      </div>
    </section>
  );
}
