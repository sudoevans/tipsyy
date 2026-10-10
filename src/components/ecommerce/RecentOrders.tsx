import { Link } from "@/i18n/navigation";
import Badge from "../ui/badge/Badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../ui/table";

export type RecentOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  total: string;
  createdAt: string;
};

const statusColor = (status: string): "success" | "warning" | "error" | "info" | "light" => {
  if (["DELIVERED", "CONFIRMED"].includes(status)) return "success";
  if (["CANCELLED", "PAYMENT_FAILED"].includes(status)) return "error";
  if (["PICKED_UP", "OUT_FOR_DELIVERY", "PREPARING"].includes(status)) return "info";
  if (["PENDING_PAYMENT", "PAID"].includes(status)) return "warning";
  return "light";
};

export default function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pt-4 pb-3 sm:px-6 dark:border-gray-800 dark:bg-white/3">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Recent orders</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Latest checkout activity</p></div>
        <Link href="/admin/orders" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800">View all</Link>
      </div>
      {orders.length ? (
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-y border-gray-100 dark:border-gray-800"><TableRow>
              {['Order', 'Customer', 'Placed', 'Total', 'Status'].map((label) => <TableCell key={label} isHeader className="px-2 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">{label}</TableCell>)}
            </TableRow></TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
              {orders.map((order) => <TableRow key={order.id}>
                <TableCell className="px-2 py-3 text-sm font-semibold text-gray-800 dark:text-white/90">{order.orderNumber}</TableCell>
                <TableCell className="px-2 py-3 text-sm text-gray-600 dark:text-gray-300">{order.customerName}</TableCell>
                <TableCell className="whitespace-nowrap px-2 py-3 text-sm text-gray-500 dark:text-gray-400">{order.createdAt}</TableCell>
                <TableCell className="whitespace-nowrap px-2 py-3 text-sm font-semibold text-gray-800 dark:text-white/90">{order.total}</TableCell>
                <TableCell className="px-2 py-3"><Badge size="sm" color={statusColor(order.status)}>{order.status.replaceAll('_', ' ')}</Badge></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
      ) : <div className="rounded-xl bg-gray-50 px-4 py-10 text-center text-sm text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">Orders will appear here as customers complete checkout.</div>}
    </div>
  );
}
