"use client";

import {
  PlusIcon,
  SearchLgIcon,
  Sliders04Icon,
  XCloseIcon,
} from "@untitledui/icons-react/outline";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { addInventoryStock, setInventoryStorefrontEnabled } from "@/app/[locale]/(admin)/admin/actions";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminTableActionsMenu from "@/components/admin/AdminTableActionsMenu";
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
  storefrontEnabled: boolean;
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
  sort: string;
  direction: string;
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
  sort,
  direction,
  page,
  pageCount,
  total,
  pageSize,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryParam = params.get("q") ?? "";
  const [query, setQuery] = useState(queryParam);
  const [addingStock, setAddingStock] = useState<InventoryItem | null>(null);
  const { showToast } = useAdminToast();
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRoot = useRef<HTMLDivElement>(null);
  const update = useCallback(
    (values: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(values).forEach(([key, value]) => {
        if (!value || value === "all") next.delete(key);
        else next.set(key, value);
      });
      next.set("page", "1");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    if (query === queryParam) return;
    const timer = window.setTimeout(() => {
      update({ q: query.trim() });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, queryParam, update]);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!filterRoot.current?.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const changeSort = (key: string) => {
    const nextDirection = sort === key && direction === "asc" ? "desc" : "asc";
    update({ sort: key, direction: nextDirection });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
              className="h-10 w-full rounded-lg border border-gray-300 py-2 pr-3 pl-10 text-sm text-gray-900 transition outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </label>
          <div ref={filterRoot} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setFilterOpen((open) => !open)}
              aria-expanded={filterOpen}
              aria-haspopup="menu"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
            >
              <Sliders04Icon className="size-4" />
              Filters
              {health !== "all" ? (
                <span
                  className="size-1.5 rounded-full bg-brand-500"
                  aria-label="One filter active"
                />
              ) : null}
            </button>
            {filterOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-theme-md dark:border-gray-700 dark:bg-gray-900"
              >
                {filters.map((filter) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={filter.value}
                    onClick={() => {
                      update({ health: filter.value });
                      setFilterOpen(false);
                    }}
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
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-left text-sm text-gray-700 dark:text-gray-300">
            <thead className="border-b border-gray-100 bg-gray-50/70 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
              <tr>
                <SortHeader label="Product" sortKey="product" sort={sort} direction={direction} onSort={changeSort} />
                <SortHeader label="Variant" sortKey="variant" sort={sort} direction={direction} onSort={changeSort} />
                <SortHeader label="SKU" sortKey="sku" sort={sort} direction={direction} onSort={changeSort} />
                <SortHeader label="Reserved" sortKey="reserved" sort={sort} direction={direction} align="right" onSort={changeSort} />
                <SortHeader label="In stock" sortKey="inStock" sort={sort} direction={direction} align="right" onSort={changeSort} />
                <SortHeader label="Available" sortKey="available" sort={sort} direction={direction} align="right" onSort={changeSort} />
                <SortHeader label="Health" sortKey="health" sort={sort} direction={direction} onSort={changeSort} />
                <th className="px-5 py-3">Storefront</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map((item) => (
                <tr
                  key={item.variantId}
                  className="text-gray-700 hover:bg-gray-50/70 dark:text-gray-300 dark:hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-4 font-semibold text-gray-800 dark:text-white">
                    {item.name}
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {item.sku}
                  </td>
                  <td className="px-5 py-4 text-right text-gray-500 dark:text-gray-400">
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
                  <td className="px-5 py-4">
                    <Badge color={item.storefrontEnabled ? "success" : "light"} size="sm">
                      {item.storefrontEnabled ? "Visible" : "Hidden"}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <InventoryActions
                      item={item}
                      onAddStock={() => setAddingStock(item)}
                      onToggleStorefront={async () => {
                        try {
                          await setInventoryStorefrontEnabled(item.variantId, !item.storefrontEnabled);
                          showToast({ title: item.storefrontEnabled ? "Item hidden from storefront" : "Item visible on storefront", tone: "success" });
                          router.refresh();
                        } catch (error) {
                          showToast({ title: "Could not update storefront visibility", description: error instanceof Error ? error.message : "Please try again.", tone: "error" });
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length ? (
          <p className="p-14 text-center text-sm text-gray-500 dark:text-gray-400">
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
      {addingStock ? (
        <AddStockDialog item={addingStock} onClose={() => setAddingStock(null)} />
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

function SortHeader({
  label,
  sortKey,
  sort,
  direction,
  align = "left",
  onSort,
}: {
  label: string;
  sortKey: string;
  sort: string;
  direction: string;
  align?: "left" | "right";
  onSort: (key: string) => void;
}) {
  const active = sort === sortKey;
  return (
    <th className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        aria-label={`Sort by ${label}${active ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
        className={`inline-flex items-center gap-1 ${active ? "text-brand-600" : "text-gray-500"}`}
        onClick={() => onSort(sortKey)}
        type="button"
      >
        {label}<span aria-hidden="true">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

function InventoryActions({
  item,
  onAddStock,
  onToggleStorefront,
}: {
  item: InventoryItem;
  onAddStock: () => void;
  onToggleStorefront: () => void;
}) {
  return (
    <AdminTableActionsMenu
      label={`Inventory actions for ${item.name} ${item.label}`}
      width={200}
      items={[
        {
          label: "Add stock",
          icon: <PlusIcon className="size-4" />,
          onSelect: onAddStock,
        },
        { label: item.storefrontEnabled ? "Hide from storefront" : "Show on storefront", onSelect: onToggleStorefront },
        { label: "View product", href: `/admin/products/${item.productId}` },
      ]}
    />
  );
}

function AddStockDialog({
  item,
  onClose,
}: {
  item: InventoryItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useAdminToast();
  const [pending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState("");
  const save = () =>
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("quantity", quantity);
        await addInventoryStock(item.variantId, formData);
        showToast({ title: "Stock added", description: `${quantity} added to ${item.name} · ${item.label}.`, tone: "success" });
        onClose();
        router.refresh();
      } catch (error) {
        showToast({
          title: "Could not add stock",
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
              id="add-stock-title"
              className="text-lg font-semibold text-gray-800 dark:text-white"
            >
              Add stock
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
              min={1}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="field mt-1.5 h-11"
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Current in stock: {item.inStock}. After this restock: {item.inStock + (Number(quantity) || 0)}.
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
            disabled={pending || !Number.isInteger(Number(quantity)) || Number(quantity) < 1}
            className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add stock"}
          </button>
        </div>
      </div>
    </div>
  );
}
