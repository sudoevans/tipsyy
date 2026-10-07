"use client";

import {
  DotsVerticalIcon,
  Edit01Icon,
  SearchLgIcon,
  Sliders04Icon,
  XCloseIcon,
} from "@untitledui/icons-react/outline";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { updateInventory } from "@/app/[locale]/(admin)/admin/actions";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminPagination from "@/components/admin/AdminPagination";
import InventoryIntakeDialog from "@/components/admin/InventoryIntakeDialog";
import Badge from "@/components/ui/badge/Badge";

type InventoryItem = {
  variantId: string;
  productId: string;
  name: string;
  label: string;
  sku: string;
  inStock: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
};

type CatalogueProduct = {
  id: string;
  name: string;
  variants: { id: string; label: string; sku: string; inInventory: boolean }[];
};

type Props = {
  items: InventoryItem[];
  catalogue: CatalogueProduct[];
  health: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
};

const filters = [
  { value: "all", label: "All inventory" },
  { value: "healthy", label: "Healthy stock" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
];

export default function InventoryCatalog({
  items,
  catalogue,
  health,
  page,
  pageCount,
  total,
  pageSize,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const update = useCallback(
    (values: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(values).forEach(([key, value]) => {
        if (!value || value === "all") next.delete(key);
        else next.set(key, value);
      });
      if (!values.page) next.set("page", "1");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query !== (params.get("q") ?? "")) update({ q: query });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [query, params, update]);

  const activeFilter = filters.find((filter) => filter.value === health);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Add catalogue variants to inventory and manage their physical stock.
          </p>
        </div>
        <InventoryIntakeDialog products={catalogue} />
      </div>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <label className="relative block w-full sm:max-w-sm">
            <SearchLgIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product, variant or SKU"
              className="h-10 w-full rounded-lg border border-gray-300 py-2 pr-3 pl-10 text-sm transition outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <details className="relative shrink-0">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5 [&::-webkit-details-marker]:hidden">
              <Sliders04Icon className="size-4" />
              {activeFilter?.label ?? "Filters"}
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-theme-md dark:border-gray-700 dark:bg-gray-900">
              {filters.map((filter) => (
                <button
                  type="button"
                  key={filter.value}
                  onClick={() => update({ health: filter.value })}
                  className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-white/5 ${
                    health === filter.value
                      ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </details>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/70 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.02]">
              <tr>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Variant / SKU</th>
                <th className="px-5 py-3 text-right">Reserved</th>
                <th className="px-5 py-3 text-right">In stock</th>
                <th className="px-5 py-3 text-right">Available</th>
                <th className="px-5 py-3">Health</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map((item) => (
                <tr
                  key={item.variantId}
                  className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-4 font-semibold text-gray-800 dark:text-white">
                    {item.name}
                  </td>
                  <td className="px-5 py-4">
                    <span className="block font-medium text-gray-700 dark:text-gray-200">
                      {item.label}
                    </span>
                    <span className="font-mono text-xs text-gray-500">
                      {item.sku}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-gray-500">
                    {item.reserved}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-gray-800 dark:text-white">
                    {item.inStock}
                  </td>
                  <td className="px-5 py-4 text-right font-medium text-gray-700 dark:text-gray-200">
                    {item.available}
                  </td>
                  <td className="px-5 py-4">
                    <HealthBadge item={item} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <InventoryActions
                      item={item}
                      onEdit={() => setEditing(item)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length ? (
          <p className="p-14 text-center text-sm text-gray-500">
            No inventory matches this search or filter.
          </p>
        ) : null}
        <AdminPagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
        />
      </section>
      {editing ? (
        <EditStockDialog item={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function HealthBadge({ item }: { item: InventoryItem }) {
  if (item.available <= 0)
    return (
      <Badge color="error" size="sm">
        Out of stock
      </Badge>
    );
  if (item.available <= item.lowStockThreshold) {
    return (
      <Badge color="warning" size="sm">
        Low stock
      </Badge>
    );
  }
  return (
    <Badge color="success" size="sm">
      Healthy
    </Badge>
  );
}

function InventoryActions({
  item,
  onEdit,
}: {
  item: InventoryItem;
  onEdit: () => void;
}) {
  return (
    <details className="relative inline-block text-left">
      <summary className="inline-flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5 [&::-webkit-details-marker]:hidden">
        <DotsVerticalIcon className="size-4" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-theme-md dark:border-gray-700 dark:bg-gray-900">
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
        >
          <Edit01Icon className="size-4" />
          Edit stock
        </button>
        <Link
          href={`/admin/products/${item.productId}`}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
        >
          View product
        </Link>
      </div>
    </details>
  );
}

function EditStockDialog({
  item,
  onClose,
}: {
  item: InventoryItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useAdminToast();
  const [pending, startTransition] = useTransition();
  const [inStock, setInStock] = useState(String(item.inStock));
  const save = () =>
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("onHand", inStock);
        await updateInventory(item.variantId, formData);
        showToast({ title: "Stock updated", tone: "success" });
        onClose();
        router.refresh();
      } catch (error) {
        showToast({
          title: "Could not update stock",
          description:
            error instanceof Error
              ? error.message
              : "Try again with a valid quantity.",
          tone: "error",
        });
      }
    });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-stock-title"
      className="fixed inset-0 z-[140] flex items-end bg-gray-950/40 sm:items-center sm:justify-center sm:p-6"
    >
      <div className="w-full max-w-md rounded-t-2xl bg-white shadow-theme-xl sm:rounded-2xl dark:bg-gray-900">
        <div className="flex items-start justify-between border-b border-gray-100 p-5 dark:border-gray-800">
          <div>
            <h2
              id="edit-stock-title"
              className="text-lg font-semibold text-gray-800 dark:text-white"
            >
              Edit stock
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {item.name} · {item.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <XCloseIcon className="size-5" />
          </button>
        </div>
        <div className="p-5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            In stock
            <input
              autoFocus
              type="number"
              min={item.reserved}
              value={inStock}
              onChange={(event) => setInStock(event.target.value)}
              className="field mt-1.5 h-11"
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            {item.reserved} currently reserved. In stock cannot be lower than
            this amount.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 p-5 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-10 px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || inStock === ""}
            className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save stock"}
          </button>
        </div>
      </div>
    </div>
  );
}
