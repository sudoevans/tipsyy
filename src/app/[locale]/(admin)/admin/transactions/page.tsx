import Input from "@/components/form/input/InputField";
import BasicTableOne from "@/components/tables/BasicTableOne";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { sql } from "@/server/db";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" });

type TransactionRow = {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  amount_minor: number;
  provider_receipt: string | null;
  payment_status: string;
  attempt_status: string | null;
  result_description: string | null;
  initiated_at: Date | null;
  completed_at: Date | null;
};

function badgeColor(status: string) {
  if (status === "SUCCEEDED") return "success" as const;
  if (["CANCELLED", "FAILED", "TIMED_OUT"].includes(status)) return "error" as const;
  return "warning" as const;
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "all" } = await searchParams;
  const transactions = await sql<TransactionRow[]>`
    SELECT o.order_number, o.customer_name, o.customer_phone, p.amount_minor, p.provider_receipt, p.status::text AS payment_status,
           pa.status::text AS attempt_status, pa.result_description, pa.initiated_at, pa.completed_at
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    LEFT JOIN payment_attempts pa ON pa.payment_id = p.id
    WHERE (
      ${q} = '' OR o.order_number ILIKE ${`%${q}%`} OR o.customer_name ILIKE ${`%${q}%`} OR o.customer_phone ILIKE ${`%${q}%`}
    ) AND (
      ${status} = 'all' OR COALESCE(pa.status::text, p.status::text) = ${status}
    )
    ORDER BY COALESCE(pa.initiated_at, p.created_at) DESC
    LIMIT 200
  `;

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Transactions</h1>
      <p className="mt-1 text-sm text-gray-500">Every M-Pesa attempt is tied to its order, including cancellations, retries, timeouts, and successful payments.</p>
    </div>
    <BasicTableOne
      title="Payment activity"
      description="Use this ledger to investigate customer payment behaviour and payment outcomes."
      actions={<form className="flex flex-wrap gap-2"><Input name="q" defaultValue={q} placeholder="Order, customer or phone" /><select className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900" defaultValue={status} name="status"><option value="all">All outcomes</option><option value="PENDING">Pending</option><option value="SUCCEEDED">Successful</option><option value="CANCELLED">Cancelled</option><option value="TIMED_OUT">Timed out</option><option value="FAILED">Failed</option></select><Button size="sm" type="submit" variant="outline">Search & filter</Button></form>}
      columns={["Order", "Transaction code", "Customer", "Amount", "Payment", "Attempt", "Initiated", "Completed", "Provider message"]}
      empty="No payment transactions match this search."
      rows={transactions.map((transaction) => {
        const attemptStatus = transaction.attempt_status ?? transaction.payment_status;
        return [
          <span className="font-semibold text-gray-800 dark:text-white/90" key="order">{transaction.order_number}</span>,
          transaction.provider_receipt ?? "N/A",
          <span key="customer"><span className="block font-medium text-gray-800 dark:text-white/90">{transaction.customer_name}</span><span className="text-xs text-gray-500">{transaction.customer_phone}</span></span>,
          money.format(transaction.amount_minor),
          <Badge color={badgeColor(transaction.payment_status)} key="payment" size="sm">{transaction.payment_status.replaceAll("_", " ")}</Badge>,
          <Badge color={badgeColor(attemptStatus)} key="attempt" size="sm">{attemptStatus.replaceAll("_", " ")}</Badge>,
          transaction.initiated_at ? dateTime.format(transaction.initiated_at) : "—",
          transaction.completed_at ? dateTime.format(transaction.completed_at) : "—",
          <span className="line-clamp-2 max-w-xs text-sm text-gray-500" key="message">{transaction.result_description ?? "—"}</span>,
        ];
      })}
    />
  </div>;
}
