import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/server/db";
import { formatPrice } from "@/components/storefront/currency";
import AdminOrderActions from "@/components/admin/AdminOrderActions";
import Badge from "@/components/ui/badge/Badge";

export const dynamic = "force-dynamic";
const date = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("en-KE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Nairobi",
      }).format(value)
    : "—";

export default async function OrderDetails({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const [order] = await sql<
    {
      id: string;
      order_number: string;
      status: string;
      customer_name: string;
      customer_phone: string;
      delivery_address: Record<string, unknown>;
      delivery_instructions: string | null;
      subtotal_minor: number;
      discount_minor: number;
      delivery_fee_minor: number;
      total_minor: number;
      created_at: Date;
      delivered_at: Date | null;
    }[]
  >`SELECT id,order_number,status::text,customer_name,customer_phone,delivery_address,delivery_instructions,
    subtotal_minor,discount_minor,delivery_fee_minor,total_minor,created_at,delivered_at
    FROM orders WHERE order_number=${orderNumber}`;
  if (!order) notFound();
  const [items, payments, driver, events, riders] = await Promise.all([
    sql<
      {
        product_name: string;
        sku: string;
        size_label: string | null;
        quantity: number;
        unit_price_minor: number;
        line_total_minor: number;
      }[]
    >`
      SELECT product_name,sku,size_label,quantity,unit_price_minor,line_total_minor FROM order_items WHERE order_id=${order.id} ORDER BY created_at,id`,
    sql<
      {
        status: string;
        provider_receipt: string | null;
        amount_minor: number;
        refunded_minor: number;
        paid_at: Date | null;
      }[]
    >`
      SELECT status::text,provider_receipt,amount_minor,refunded_minor,paid_at FROM payments WHERE order_id=${order.id} ORDER BY created_at DESC`,
    sql<
      {
        display_name: string | null;
        phone: string | null;
        status: string;
        assigned_at: Date;
        picked_up_at: Date | null;
        delivered_at: Date | null;
      }[]
    >`
      SELECT u.display_name,u.phone,da.status::text,da.assigned_at,da.picked_up_at,da.delivered_at
      FROM delivery_assignments da JOIN riders r ON r.id=da.rider_id JOIN users u ON u.id=r.user_id WHERE da.order_id=${order.id}`,
    sql<{ to_status: string; note: string | null; created_at: Date }[]>`
      SELECT to_status::text,note,created_at FROM order_events WHERE order_id=${order.id} ORDER BY created_at`,
    sql<
      {
        id: string;
        display_name: string | null;
        phone: string | null;
        busy: boolean;
      }[]
    >`
      SELECT r.id,u.display_name,u.phone,EXISTS (
        SELECT 1 FROM delivery_assignments da WHERE da.rider_id=r.id AND da.status IN ('ASSIGNED','ACCEPTED','PICKED_UP')
      ) AS busy FROM riders r JOIN users u ON u.id=r.user_id WHERE u.status='ACTIVE' ORDER BY busy,u.display_name`,
  ]);
  const address = order.delivery_address;
  const latitude = Number(address.latitude),
    longitude = Number(address.longitude);
  const coordinates =
    address.latitude != null &&
    address.longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  const card = "rounded-2xl border border-gray-200 bg-white p-5 sm:p-6";
  const heading = "text-lg font-semibold text-gray-800";
  const details =
    "grid grid-cols-[5rem_minmax(0,1fr)] gap-4 border-b border-gray-100 py-3 text-sm last:border-0";
  const statusColor =
    order.status === "DELIVERED"
      ? "success"
      : ["CANCELLED", "PAYMENT_FAILED"].includes(order.status)
        ? "error"
        : "warning";
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">Order details</h1>
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-gray-500"
        >
          <Link href="/admin/orders" className="hover:text-brand-500">
            Orders
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-gray-800">{order.order_number}</span>
        </nav>
      </header>
      <section
        className={
          card +
          " flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h2 className="text-sm font-semibold text-gray-800">
            Order ID: {order.order_number}
          </h2>
          <Badge color={statusColor} size="sm">
            {order.status.replaceAll("_", " ")}
          </Badge>
          <span
            className="hidden h-6 border-l border-gray-200 sm:block"
            aria-hidden="true"
          />
          <p className="text-sm text-gray-500">
            Placed: {date(order.created_at)}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <a
            href="#payment-details"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View payment
          </a>
          <AdminOrderActions
            key={`${order.order_number}:${order.status}`}
            orderNumber={order.order_number}
            status={order.status}
            riders={riders.map((rider) => ({
              id: rider.id,
              name: rider.display_name ?? rider.phone ?? "Driver",
              phone: rider.phone ?? "",
              busy: rider.busy,
            }))}
            paymentStatus={payments[0]?.status ?? null}
            paymentAmountMinor={payments[0]?.amount_minor ?? 0}
            refundedMinor={payments[0]?.refunded_minor ?? 0}
          />
        </div>
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section className={card}>
            <h2 className={heading}>Order items</h2>
            <div className="mt-5 hidden overflow-hidden rounded-2xl border border-gray-100 md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    {[
                      "S. No.",
                      "Products",
                      "Quantity",
                      "Unit cost",
                      "Total",
                    ].map((label) => (
                      <th
                        key={label}
                        className="px-4 py-4 font-medium last:text-right"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item, index) => (
                    <tr key={index}>
                      <td className="px-4 py-4 text-gray-500">{index + 1}</td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-gray-800">
                          {item.product_name}
                        </p>
                        <p className="mt-1 text-xs break-all text-gray-500">
                          {[item.size_label, item.sku]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-gray-600">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-gray-600">
                        {formatPrice(item.unit_price_minor)}
                      </td>
                      <td className="px-4 py-4 text-right font-medium whitespace-nowrap text-gray-800">
                        {formatPrice(item.line_total_minor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 divide-y divide-gray-100 rounded-xl border border-gray-100 px-4 md:hidden">
              {items.map((item, index) => (
                <article key={index} className="py-4">
                  <p className="font-medium text-gray-800">
                    {item.product_name}
                  </p>
                  <p className="mt-1 text-xs break-all text-gray-500">
                    {[item.size_label, item.sku].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
                    <span className="text-gray-500">
                      {item.quantity} × {formatPrice(item.unit_price_minor)}
                    </span>
                    <strong className="font-semibold text-gray-800">
                      {formatPrice(item.line_total_minor)}
                    </strong>
                  </div>
                </article>
              ))}
            </div>
            {!items.length ? (
              <p className="mt-5 text-sm text-gray-500">
                No items recorded for this order.
              </p>
            ) : null}
            <div className="mt-6 ml-auto w-full max-w-xs">
              <h3 className="mb-4 text-sm font-semibold text-gray-800">
                Order summary
              </h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Subtotal</dt>
                  <dd className="font-medium text-gray-800">
                    {formatPrice(order.subtotal_minor)}
                  </dd>
                </div>
                {order.discount_minor > 0 ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Discount</dt>
                    <dd className="font-medium text-gray-800">
                      −{formatPrice(order.discount_minor)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Delivery fee</dt>
                  <dd className="font-medium text-gray-800">
                    {formatPrice(order.delivery_fee_minor)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
                  <dt className="font-medium text-gray-800">Total</dt>
                  <dd className="text-xl font-semibold text-gray-800">
                    {formatPrice(order.total_minor)}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
          <section className={card + " scroll-mt-24"} id="payment-details">
            <h2 className={heading}>Payment details</h2>
            {payments.map((payment, index) => (
              <dl key={index} className="mt-4 grid gap-x-8 sm:grid-cols-2">
                <div className={details}>
                  <dt className="text-gray-500">Status</dt>
                  <dd className="font-medium text-gray-800">
                    {payment.status.replaceAll("_", " ")}
                  </dd>
                </div>
                <div className={details}>
                  <dt className="text-gray-500">Amount</dt>
                  <dd className="font-medium text-gray-800">
                    {formatPrice(payment.amount_minor)}
                  </dd>
                </div>
                <div className={details}>
                  <dt className="text-gray-500">Receipt</dt>
                  <dd className="break-all text-gray-800">
                    {payment.provider_receipt ?? "Not received yet"}
                  </dd>
                </div>
                <div className={details}>
                  <dt className="text-gray-500">Paid</dt>
                  <dd className="text-gray-800">{date(payment.paid_at)}</dd>
                </div>
                {payment.refunded_minor > 0 ? (
                  <div className={details}>
                    <dt className="text-gray-500">Refunded</dt>
                    <dd className="text-gray-800">
                      {formatPrice(payment.refunded_minor)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ))}
          </section>
        </div>
        <aside className="min-w-0 space-y-6">
          <section className={card}>
            <h2 className={heading}>Customer details</h2>
            <dl className="mt-4">
              <div className={details}>
                <dt className="text-gray-500">Name</dt>
                <dd className="break-words text-gray-800">
                  {order.customer_name}
                </dd>
              </div>
              <div className={details}>
                <dt className="text-gray-500">Phone</dt>
                <dd>
                  <a
                    className="break-all text-brand-500 hover:underline"
                    href={`tel:${order.customer_phone}`}
                  >
                    {order.customer_phone}
                  </a>
                </dd>
              </div>
              <div className={details}>
                <dt className="text-gray-500">Address</dt>
                <dd className="break-words text-gray-800">
                  {String(
                    address.addressLine ??
                      address.address ??
                      address.area ??
                      "Current location",
                  )}
                  {coordinates ? (
                    <a
                      className="mt-2 block text-brand-500 hover:underline"
                      href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open location ↗
                    </a>
                  ) : null}
                </dd>
              </div>
              {order.delivery_instructions ? (
                <div className={details}>
                  <dt className="text-gray-500">Instructions</dt>
                  <dd className="break-words text-gray-800">
                    {order.delivery_instructions}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
          <section className={card}>
            <h2 className={heading}>Order history</h2>
            <ol className="mt-5">
              {events.map((event, index) => (
                <li key={index} className="relative flex gap-3 pb-6 last:pb-0">
                  {index < events.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-10 bottom-0 left-5 border-l border-dashed border-gray-300"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500"
                  >
                    <svg
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      viewBox="0 0 24 24"
                    >
                      <path d="m6 12 4 4 8-8" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">
                      {event.to_status.replaceAll("_", " ")}
                    </p>
                    <time
                      className="mt-1 block text-xs text-gray-500"
                      dateTime={event.created_at.toISOString()}
                    >
                      {date(event.created_at)}
                    </time>
                    {event.note ? (
                      <p className="mt-1 text-xs leading-5 break-words text-gray-500">
                        {event.note}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
            {!events.length ? (
              <p className="mt-4 text-sm text-gray-500">
                No activity recorded yet.
              </p>
            ) : null}
          </section>
          <section className={card}>
            <h2 className={heading}>Delivery driver</h2>
            {driver.length ? (
              driver.map((d, index) => (
                <div key={index} className="mt-4">
                  <p className="text-sm font-medium text-gray-800">
                    {d.display_name ?? "Driver"}
                  </p>
                  {d.phone ? (
                    <a
                      className="mt-1 inline-block text-sm text-brand-500 hover:underline"
                      href={`tel:${d.phone}`}
                    >
                      {d.phone}
                    </a>
                  ) : null}
                  <dl className="mt-2">
                    <div className={details}>
                      <dt className="text-gray-500">Status</dt>
                      <dd className="text-gray-800">
                        {d.status.replaceAll("_", " ")}
                      </dd>
                    </div>
                    <div className={details}>
                      <dt className="text-gray-500">Assigned</dt>
                      <dd className="text-gray-800">{date(d.assigned_at)}</dd>
                    </div>
                    {d.picked_up_at ? (
                      <div className={details}>
                        <dt className="text-gray-500">Picked up</dt>
                        <dd className="text-gray-800">
                          {date(d.picked_up_at)}
                        </dd>
                      </div>
                    ) : null}
                    {d.delivered_at ? (
                      <div className={details}>
                        <dt className="text-gray-500">Delivered</dt>
                        <dd className="text-gray-800">
                          {date(d.delivered_at)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              ))
            ) : (
              <p className="mt-4 text-sm text-gray-500">Not assigned yet</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
