"use client";

import { SearchLgIcon } from "@untitledui/icons-react/outline";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminSelect from "@/components/admin/AdminSelect";

const defaultStatusOptions = [
  { value: "all", label: "All statuses" },
  ...[
    "PENDING_PAYMENT",
    "PAID",
    "CONFIRMED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "RIDER_ASSIGNED",
    "PICKED_UP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "PAYMENT_FAILED",
    "CANCELLED",
    "REFUNDED",
  ].map((value) => ({ value, label: value.replaceAll("_", " ") })),
];

type StatusOption = { value: string; label: string };

export default function OrderFilters({
  searchPlaceholder = "Order, customer or phone",
  statusOptions = defaultStatusOptions,
}: {
  searchPlaceholder?: string;
  statusOptions?: StatusOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  const update = useCallback(
    (values: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(values).forEach(([key, value]) => {
        if (value && value !== "all") next.set(key, value);
        else next.delete(key);
      });
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <OrderFiltersForm
      key={params.toString()}
      initialQuery={params.get("q") ?? ""}
      status={params.get("status") ?? "all"}
      searchPlaceholder={searchPlaceholder}
      statusOptions={statusOptions}
      onUpdate={update}
    />
  );
}

function OrderFiltersForm({
  initialQuery,
  status,
  searchPlaceholder,
  statusOptions,
  onUpdate,
}: {
  initialQuery: string;
  status: string;
  searchPlaceholder: string;
  statusOptions: StatusOption[];
  onUpdate: (values: Record<string, string>) => void;
}) {
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    if (query === initialQuery) return;
    const timeout = window.setTimeout(() => onUpdate({ q: query }), 260);
    return () => window.clearTimeout(timeout);
  }, [initialQuery, onUpdate, query]);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      <label className="relative block w-full sm:w-72">
        <SearchLgIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-9 text-sm text-gray-800 transition outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
        />
      </label>
      <AdminSelect
        key={`order-status-${status}`}
        className="w-full sm:w-52"
        value={status}
        onValueChange={(nextStatus) => onUpdate({ status: nextStatus })}
        placeholder="All statuses"
        options={statusOptions}
      />
    </div>
  );
}
