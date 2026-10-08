import AdminPagination from "@/components/admin/AdminPagination";
import OrderFilters from "@/components/admin/OrderFilters";
import PaymentInvestigationActions from "@/components/admin/PaymentInvestigationActions";
import BasicTableOne from "@/components/tables/BasicTableOne";
import Badge from "@/components/ui/badge/Badge";
import { getAdminFromSession } from "@/server/admin-auth";
import { ADMIN_SESSION_COOKIE } from "@/server/admin-session-cookie";
import { sql } from "@/server/db";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat("en-KE", {
  dateStyle: "medium",
  timeStyle: "short",
});
const pageSize = 12;

type TransactionRow = {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  amount_minor: number;
  provider_receipt: string | null;
  payment_status: string;
  settlement_source: string | null;
  attempt_status: string | null;
  result_description: string | null;
  initiated_at: Date | null;
  completed_at: Date | null;
  attempt_count: number;
  investigation_id: string | null;
  investigation_status: string | null;
  claimed_receipt: string | null;
};

function badgeColor(status: string) {
  if (status === "SUCCEEDED") return "success" as const;
  if (["CANCELLED", "FAILED", "TIMED_OUT"].includes(status))
    return "error" as const;
  return "warning" as const;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const input = await searchParams;
  const cookieStore = await cookies();
  const admin = await getAdminFromSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  const q = (input.q ?? "").trim();
  const status = [
    "all",
    "PENDING",
    "SUCCEEDED",
    "CANCELLED",
    "TIMED_OUT",
    "FAILED",
    "RECONCILING",
  ].includes(input.status ?? "")
    ? (input.status ?? "all")
    : "all";
  const requestedPage = Math.max(
    1,
    Number.parseInt(input.page ?? "1", 10) || 1,
  );
  const countRows = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE (
      ${q} = '' OR o.order_number ILIKE ${`%${q}%`} OR o.customer_name ILIKE ${`%${q}%`} OR o.customer_phone ILIKE ${`%${q}%`}
    ) AND (
      ${status} = 'all' OR COALESCE((
        SELECT pa.status::text FROM payment_attempts pa
        WHERE pa.payment_id = p.id
        ORDER BY pa.initiated_at DESC, pa.id DESC LIMIT 1
      ), p.status::text) = ${status}
    )
  `;
  const total = countRows[0]?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const transactions = await sql<TransactionRow[]>`
    SELECT o.order_number, o.customer_name, o.customer_phone, p.amount_minor, p.provider_receipt, p.status::text AS payment_status, p.settlement_source,
           pa.status::text AS attempt_status, pa.result_description, pa.initiated_at, pa.completed_at,
           COALESCE(pa.attempt_count, 0)::int AS attempt_count,
           investigation.id AS investigation_id, investigation.status::text AS investigation_status,
           investigation.claimed_receipt
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    LEFT JOIN LATERAL (
      SELECT latest.status, latest.result_description, latest.initiated_at, latest.completed_at,
             (SELECT COUNT(*) FROM payment_attempts WHERE payment_id = p.id)::int AS attempt_count
      FROM payment_attempts latest
      WHERE latest.payment_id = p.id
      ORDER BY latest.initiated_at DESC, latest.id DESC
      LIMIT 1
    ) pa ON true
    LEFT JOIN LATERAL (
      SELECT id, status, claimed_receipt FROM payment_investigations
      WHERE payment_id = p.id ORDER BY created_at DESC LIMIT 1
    ) investigation ON true
    WHERE (
      ${q} = '' OR o.order_number ILIKE ${`%${q}%`} OR o.customer_name ILIKE ${`%${q}%`} OR o.customer_phone ILIKE ${`%${q}%`}
    ) AND (
      ${status} = 'all' OR COALESCE(pa.status::text, p.status::text) = ${status}
    )
    ORDER BY COALESCE(pa.initiated_at, p.created_at) DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          Transactions
        </h1>
      </div>
      <BasicTableOne
        actions={
          <OrderFilters
            searchPlaceholder="Order, customer or phone"
            statusOptions={[
              { value: "all", label: "All outcomes" },
              { value: "PENDING", label: "Pending" },
              { value: "SUCCEEDED", label: "Successful" },
              { value: "CANCELLED", label: "Cancelled" },
              { value: "TIMED_OUT", label: "Timed out" },
              { value: "FAILED", label: "Failed" },
              { value: "RECONCILING", label: "Under review" },
            ]}
          />
        }
        columns={[
          "Order",
          "Transaction code",
          "Customer",
          "Amount",
          "Outcome",
          "Retries",
          "Activity",
          "Provider message",
          "Review",
        ]}
        empty="No payment transactions match this search."
        pagination={false}
        noHorizontalScroll
        footer={
          <AdminPagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
          />
        }
        rows={transactions.map((transaction) => {
          const attemptStatus =
            transaction.attempt_status ?? transaction.payment_status;
          return [
            <span
              className="font-semibold text-gray-800 dark:text-white/90"
              key="order"
            >
              {transaction.order_number}
            </span>,
            <span className="break-all" key="receipt">
              {transaction.provider_receipt ?? "N/A"}
            </span>,
            <span key="customer">
              <span className="block font-medium text-gray-800 dark:text-white/90">
                {transaction.customer_name}
              </span>
              <span className="text-xs text-gray-500">
                {transaction.customer_phone}
              </span>
            </span>,
            money.format(transaction.amount_minor),
            <div className="flex flex-wrap gap-1.5" key="outcome">
              <Badge color={badgeColor(transaction.payment_status)} size="sm">
                {transaction.payment_status.replaceAll("_", " ")}
              </Badge>
              {attemptStatus !== transaction.payment_status ? (
                <Badge color={badgeColor(attemptStatus)} size="sm">
                  {attemptStatus.replaceAll("_", " ")}
                </Badge>
              ) : null}
              {transaction.settlement_source === "ADMIN_CONFIRMATION" ? <Badge color="warning" size="sm">Manual confirmation</Badge> : null}
            </div>,
            <span className="text-sm text-gray-600" key="retries">
              {transaction.attempt_count > 1
                ? `${transaction.attempt_count - 1} ${transaction.attempt_count === 2 ? "retry" : "retries"}`
                : "—"}
            </span>,
            <div className="space-y-1 text-xs leading-4" key="activity">
              <p>
                <span className="text-gray-400">Started: </span>
                {transaction.initiated_at
                  ? dateTime.format(transaction.initiated_at)
                  : "—"}
              </p>
              <p>
                <span className="text-gray-400">Completed: </span>
                {transaction.completed_at
                  ? dateTime.format(transaction.completed_at)
                  : "—"}
              </p>
            </div>,
            <span className="line-clamp-3 text-sm text-gray-500" key="message">
              {transaction.result_description ?? "—"}
            </span>,
            <div className="space-y-1" key="review">
              {transaction.investigation_status ? <Badge color={transaction.investigation_status === "CONFIRMED" ? "success" : transaction.investigation_status === "REJECTED" ? "error" : "warning"} size="sm">{transaction.investigation_status.replaceAll("_", " ")}</Badge> : null}
              {transaction.claimed_receipt ? <p className="font-mono text-xs text-gray-500">Claimed: {transaction.claimed_receipt}</p> : null}
              <PaymentInvestigationActions canConfirm={admin?.role === "ADMIN"} investigationId={transaction.investigation_id} status={transaction.investigation_status} receipt={transaction.claimed_receipt} payerPhone={transaction.customer_phone} amountMinor={transaction.amount_minor} />
            </div>,
          ];
        })}
      />
    </div>
  );
}
