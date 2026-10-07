"use client";

import {
  ChevronLeftIcon,
  PackagePlusIcon,
  SearchLgIcon,
  XCloseIcon,
} from "@untitledui/icons-react/outline";
import { useMemo, useState, useTransition } from "react";
import { addInventoryItem } from "@/app/[locale]/(admin)/admin/actions";
import { useAdminToast } from "@/components/admin/AdminToast";

type Product = {
  id: string;
  name: string;
  variants: { id: string; label: string; sku: string; inInventory: boolean }[];
};

export default function InventoryIntakeDialog({
  products,
}: {
  products: Product[];
}) {
  const { showToast } = useAdminToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [pending, startTransition] = useTransition();
  const matches = useMemo(
    () =>
      products
        .filter((product) =>
          `${product.name} ${product.variants.map((variant) => `${variant.label} ${variant.sku}`).join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 12),
    [products, query],
  );
  const product = products.find((item) => item.id === productId);
  const selectableVariants = product?.variants.filter(
    (variant) => !variant.inInventory,
  );
  const close = () => {
    setOpen(false);
    setQuery("");
    setProductId("");
    setVariantId("");
  };
  const submit = (form: HTMLFormElement) =>
    startTransition(async () => {
      try {
        await addInventoryItem(new FormData(form));
        showToast({ title: "Stock added to inventory", tone: "success" });
        close();
      } catch (error) {
        showToast({
          title: "Could not add stock",
          description:
            error instanceof Error
              ? error.message
              : "Check the quantity and try again.",
          tone: "error",
        });
      }
    });

  return (
    <>
      <button
        disabled={!products.length}
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
      >
        <PackagePlusIcon className="size-4" />
        Add stock
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-product-stock-title"
          className="fixed inset-0 z-[140] flex items-end bg-gray-950/40 sm:items-center sm:justify-center sm:p-6"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit(event.currentTarget);
            }}
            className="w-full max-w-lg rounded-t-2xl bg-white shadow-theme-xl sm:rounded-2xl dark:bg-gray-900"
          >
            <div className="flex items-start justify-between border-b border-gray-100 p-5 dark:border-gray-800">
              <div>
                <h2
                  id="add-product-stock-title"
                  className="text-lg font-semibold text-gray-800 dark:text-white"
                >
                  Add stock
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Select a catalogue product, then choose the physical variant
                  you have.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
                aria-label="Close"
              >
                <XCloseIcon className="size-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {!product ? (
                <>
                  <label className="relative block">
                    <SearchLgIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search products, variants or SKU"
                      className="h-11 w-full rounded-lg border border-gray-300 py-2 pr-3 pl-9 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                    />
                  </label>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    {matches.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          setProductId(item.id);
                          setVariantId("");
                        }}
                        className="flex w-full items-center justify-between gap-4 border-b border-gray-100 p-3 text-left transition last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/5"
                      >
                        <span>
                          <span className="block text-sm font-semibold text-gray-800 dark:text-white">
                            {item.name}
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {item.variants.length} variant
                            {item.variants.length === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="text-xs font-semibold text-brand-600">
                          Select
                        </span>
                      </button>
                    ))}
                    {!matches.length ? (
                      <p className="p-5 text-center text-sm text-gray-500">
                        No catalogue products found.
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setProductId("");
                      setVariantId("");
                    }}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-brand-600 dark:text-gray-300"
                  >
                    <ChevronLeftIcon className="size-4" />
                    Change product
                  </button>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
                    <p className="text-xs font-medium text-gray-500">
                      Selected product
                    </p>
                    <p className="mt-1 font-semibold text-gray-800 dark:text-white">
                      {product.name}
                    </p>
                  </div>
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Choose variant
                    </legend>
                    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                      {product.variants.map((variant) => (
                        <label
                          key={variant.id}
                          className={`flex items-center justify-between gap-3 border-b border-gray-100 p-3 last:border-0 dark:border-gray-800 ${
                            variant.inInventory
                              ? "cursor-not-allowed bg-gray-50/70 opacity-60 dark:bg-white/[0.02]"
                              : "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="variantId"
                              value={variant.id}
                              checked={variantId === variant.id}
                              disabled={variant.inInventory}
                              onChange={() => setVariantId(variant.id)}
                            />
                            <span>
                              <span className="block text-sm font-semibold text-gray-800 dark:text-white">
                                {variant.label}
                              </span>
                              <span className="font-mono text-xs text-gray-500">
                                {variant.sku}
                              </span>
                            </span>
                          </span>
                          {variant.inInventory ? (
                            <span className="text-xs font-medium text-gray-500">
                              Already in inventory
                            </span>
                          ) : null}
                        </label>
                      ))}
                    </div>
                    {selectableVariants?.length === 0 ? (
                      <p className="mt-2 text-xs leading-5 text-gray-500">
                        Every variant is already in inventory. Use Edit stock
                        from the table to adjust quantities.
                      </p>
                    ) : null}
                  </fieldset>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    In stock
                    <input
                      required
                      min="0"
                      name="onHand"
                      type="number"
                      className="field mt-1.5 h-11"
                      placeholder="0"
                    />
                  </label>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 p-5 dark:border-gray-800">
              <button
                type="button"
                onClick={close}
                className="h-10 px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                disabled={!variantId || pending}
                className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Adding…" : "Add to inventory"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
