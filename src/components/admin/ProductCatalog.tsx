"use client";
import {
  ArchiveIcon,
  Copy01Icon,
  DotsVerticalIcon,
  Edit01Icon,
  ImagePlusIcon,
  PlusIcon,
  SearchLgIcon,
  Sliders04Icon,
  UploadCloud01Icon,
  XCloseIcon,
} from "@untitledui/icons-react/outline";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import {
  createProduct,
  duplicateProduct,
  setProductActive,
  setProductsActive,
} from "@/app/[locale]/(admin)/admin/actions";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminSelect from "@/components/admin/AdminSelect";
type Product = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  variantCount: number;
  active: boolean;
  imageUrl: string | null;
  createdAt: string;
};
type Option = { id: string; name: string; slug?: string };
type Variant = { label: string; price: string; costPrice: string };
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export default function ProductCatalog({
  products,
  categories,
  brands,
  page,
  pageCount,
  total,
  pageSize,
}: {
  products: Product[];
  categories: Option[];
  brands: Option[];
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { showToast } = useAdminToast();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(values).forEach(([key, value]) => {
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
    });
    if (!values.page) next.set("page", "1");
    router.replace(`${pathname}?${next}`);
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== (params.get("q") ?? "")) {
        const next = new URLSearchParams(params.toString());
        if (query) next.set("q", query);
        else next.delete("q");
        next.set("page", "1");
        router.replace(`${pathname}?${next}`);
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [query, params, pathname, router]);
  const run = (title: string, action: () => Promise<void>) =>
    startTransition(async () => {
      try {
        await action();
        showToast({ title, tone: "success" });
        router.refresh();
      } catch {
        showToast({
          title: "Action could not be completed",
          description: "Please try again.",
          tone: "error",
        });
      }
    });
  const sort = params.get("sort") ?? "created";
  const direction = params.get("direction") ?? "desc";
  const sortBy = (key: string) =>
    update({
      sort: key,
      direction: sort === key && direction === "asc" ? "desc" : "asc",
    });
  const allSelected =
    products.length > 0 &&
    products.every((product) => selected.has(product.id));
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            Products
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage catalogue details, variants, prices, and visibility.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <PlusIcon className="size-4" />
          Add product
        </button>
      </div>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-gray-800">
          <label className="relative block w-full lg:max-w-sm">
            <SearchLgIcon className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product, variant or brand"
              className="h-10 w-full rounded-lg border border-gray-300 py-2 pr-3 pl-10 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Sliders04Icon className="size-4 text-gray-400" />
            <AdminSelect
              key={`category-${params.get("category") ?? "all"}`}
              className="min-w-38"
              value={params.get("category") ?? "all"}
              onValueChange={(value) => update({ category: value })}
              placeholder="All categories"
              options={[
                { value: "all", label: "All categories" },
                ...categories.map((item) => ({
                  value: item.slug ?? item.id,
                  label: item.name,
                })),
              ]}
            />
            <AdminSelect
              key={`brand-${params.get("brand") ?? "all"}`}
              searchable
              className="min-w-34"
              value={params.get("brand") ?? "all"}
              onValueChange={(value) => update({ brand: value })}
              placeholder="All brands"
              options={[
                { value: "all", label: "All brands" },
                ...brands.map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
            <AdminSelect
              key={`status-${params.get("status") ?? "all"}`}
              className="min-w-32"
              value={params.get("status") ?? "all"}
              onValueChange={(value) => update({ status: value })}
              placeholder="All statuses"
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "hidden", label: "Hidden" },
              ]}
            />
          </div>
        </div>
        {selected.size ? (
          <div className="flex items-center justify-between border-b border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
            <span className="font-medium">{selected.size} selected</span>
            <div className="flex gap-3">
              <button
                disabled={pending}
                onClick={() =>
                  run("Products published", () =>
                    setProductsActive([...selected], true),
                  )
                }
              >
                Publish
              </button>
              <button
                disabled={pending}
                onClick={() =>
                  run("Products archived", () =>
                    setProductsActive([...selected], false),
                  )
                }
              >
                Archive
              </button>
            </div>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/70 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-3">
                  <input
                    checked={allSelected}
                    onChange={() =>
                      setSelected(
                        allSelected
                          ? new Set()
                          : new Set(products.map((item) => item.id)),
                      )
                    }
                    aria-label="Select all products"
                    type="checkbox"
                  />
                </th>
                <Head
                  label="Product"
                  active={sort === "name"}
                  onClick={() => sortBy("name")}
                />
                <Head
                  label="Category"
                  active={sort === "category"}
                  onClick={() => sortBy("category")}
                />
                <Head
                  label="Brand"
                  active={sort === "brand"}
                  onClick={() => sortBy("brand")}
                />
                <th className="px-4 py-3">Variants</th>
                <Head
                  label="Created"
                  active={sort === "created"}
                  onClick={() => sortBy("created")}
                />
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {products.map((product, index) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  openUp={index >= products.length - 2}
                  selected={selected.has(product.id)}
                  onToggle={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(product.id)) next.delete(product.id);
                      else next.add(product.id);
                      return next;
                    })
                  }
                  onRun={run}
                />
              ))}
            </tbody>
          </table>
        </div>
        {!products.length ? (
          <p className="p-14 text-center text-sm text-gray-500">
            No products match these filters.
          </p>
        ) : null}
        <AdminPagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
        />
      </section>
      {adding ? (
        <AddProductDialog
          categories={categories}
          brands={brands}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}
function Head({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3">
      <button onClick={onClick} className={active ? "text-brand-600" : ""}>
        {label} <span className="text-[10px]">↕</span>
      </button>
    </th>
  );
}
function ProductRow({
  product,
  openUp,
  selected,
  onToggle,
  onRun,
}: {
  product: Product;
  openUp: boolean;
  selected: boolean;
  onToggle: () => void;
  onRun: (title: string, action: () => Promise<void>) => void;
}) {
  const router = useRouter();
  const open = () => router.push(`/admin/products/${product.id}`);
  return (
    <tr
      onClick={open}
      className="cursor-pointer hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"
    >
      <td className="px-4 py-3">
        <input
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onChange={onToggle}
          aria-label={`Select ${product.name}`}
          type="checkbox"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Thumb src={product.imageUrl} />
          <span>
            <span className="block max-w-64 truncate font-semibold text-gray-800 dark:text-white">
              {product.name}
            </span>
            <span className="text-xs text-gray-500">
              {product.active ? "Published" : "Hidden"}
            </span>
          </span>
        </div>
      </td>
      <td className="px-4 py-3">{product.category}</td>
      <td className="px-4 py-3">{product.brand ?? "—"}</td>
      <td className="px-4 py-3">
        <span className="font-medium text-brand-600">
          {product.variantCount} variant{product.variantCount === 1 ? "" : "s"}
        </span>
      </td>
      <td className="px-4 py-3">
        {new Intl.DateTimeFormat("en-KE", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(new Date(product.createdAt))}
      </td>
      <td
        onClick={(event) => event.stopPropagation()}
        className="px-4 py-3 text-right"
      >
        <details className="relative inline-block text-left">
          <summary className="inline-flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-gray-200 text-gray-500 [&::-webkit-details-marker]:hidden">
            <DotsVerticalIcon className="size-4" />
          </summary>
          <div
            className={`absolute right-0 z-20 w-36 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-theme-md dark:border-gray-700 dark:bg-gray-900 ${openUp ? "bottom-full mb-1" : "mt-1"}`}
          >
            <Link
              href={`/admin/products/${product.id}`}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
            >
              <Edit01Icon className="size-4" />
              Edit
            </Link>
            <button
              onClick={() =>
                onRun("Product duplicated", () => duplicateProduct(product.id))
              }
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50"
            >
              <Copy01Icon className="size-4" />
              Duplicate
            </button>
            <button
              onClick={() =>
                onRun(
                  product.active ? "Product archived" : "Product published",
                  () => setProductActive(product.id, !product.active),
                )
              }
              className="flex w-full items-center gap-2 px-3 py-2 text-error-600 hover:bg-error-50"
            >
              <ArchiveIcon className="size-4" />
              {product.active ? "Archive" : "Publish"}
            </button>
          </div>
        </details>
      </td>
    </tr>
  );
}
function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="size-10 rounded-lg border border-gray-100 bg-gray-50 object-cover"
    />
  ) : (
    <span className="flex size-10 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
      <ImagePlusIcon className="size-4" />
    </span>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
function AddProductDialog({
  categories,
  brands,
  onClose,
}: {
  categories: Option[];
  brands: Option[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useAdminToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [variants, setVariants] = useState<Variant[]>([
    { label: "Standard", price: "", costPrice: "" },
  ]);
  const sku = (label: string, index: number) =>
    `TT-${(slugify(name).replace(/-/g, "").slice(0, 18) || "PRODUCT").toUpperCase()}-${(slugify(label).replace(/-/g, "").slice(0, 10) || "STANDARD").toUpperCase()}-${index + 1}`;
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/v1/admin/uploads/product-image", {
        method: "POST",
        body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message);
      setImageUrl(payload.data.url);
      showToast({ title: "Image uploaded", tone: "success" });
    } catch (error) {
      showToast({
        title: "Image upload failed",
        description:
          error instanceof Error
            ? error.message
            : "Use JPG, PNG, or WebP under 5 MB.",
        tone: "error",
      });
    } finally {
      setUploading(false);
    }
  };
  const submit = (form: HTMLFormElement) =>
    startTransition(async () => {
      try {
        const data = new FormData(form);
        data.set("slug", slugify(name));
        data.set("imageUrl", imageUrl);
        data.set(
          "variants",
          JSON.stringify(
            variants.map((variant, index) => ({
              ...variant,
              sku: sku(variant.label, index),
            })),
          ),
        );
        await createProduct(data);
        showToast({
          title: "Product created",
          description: "Add physical quantity from Inventory.",
          tone: "success",
        });
        onClose();
        router.refresh();
      } catch (error) {
        showToast({
          title: "Could not create product",
          description:
            error instanceof Error
              ? error.message
              : "Check the fields and try again.",
          tone: "error",
        });
      }
    });
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-end bg-gray-950/40 sm:items-center sm:justify-center sm:p-6"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(event.currentTarget);
        }}
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-theme-xl sm:rounded-2xl dark:bg-gray-900"
      >
        <div className="flex justify-between border-b border-gray-100 p-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
              Add product
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Add stock separately from Inventory.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-gray-500">
            <XCloseIcon className="size-5" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-[170px_1fr]">
            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 text-center">
              <input
                onChange={(event) => upload(event.target.files?.[0])}
                accept="image/jpeg,image/png,image/webp"
                type="file"
                className="sr-only"
              />
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="size-20 rounded-lg object-cover"
                />
              ) : (
                <UploadCloud01Icon className="size-6 text-gray-400" />
              )}
              <span className="mt-2 text-sm font-medium">
                {uploading ? "Uploading…" : "Upload image"}
              </span>
              <span className="mt-1 text-xs text-gray-500">
                JPG, PNG or WebP · 1200×1200 · max 5 MB
              </span>
            </label>
            <div className="grid gap-4">
              <Field label="Product name">
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="field"
                  placeholder="e.g. Glenmorangie Original 10"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <AdminSelect
                    name="categoryId"
                    placeholder="Choose category"
                    options={categories.map((item) => ({
                      value: item.id,
                      label: item.name,
                    }))}
                  />
                </Field>
                <Field label="Brand">
                  <AdminSelect
                    searchable
                    name="brandId"
                    placeholder="No brand"
                    options={[
                      { value: "", label: "No brand" },
                      ...brands.map((item) => ({
                        value: item.id,
                        label: item.name,
                      })),
                    ]}
                  />
                </Field>
              </div>
            </div>
          </div>
          <Field label="Description">
            <textarea
              name="description"
              rows={3}
              className="field resize-none"
              placeholder="Short product description"
            />
          </Field>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-white">
                  Variants & prices
                </h3>
                <p className="text-xs text-gray-500">
                  SKU is generated automatically. Stock is managed in Inventory.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setVariants([
                    ...variants,
                    { label: "", price: "", costPrice: "" },
                  ])
                }
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600"
              >
                <PlusIcon className="size-4" />
                Variant
              </button>
            </div>
            <div className="space-y-3">
              {variants.map((variant, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]"
                >
                  <Field label="Name">
                    <input
                      required
                      value={variant.label}
                      onChange={(event) =>
                        setVariants(
                          variants.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="field"
                      placeholder="750 ml"
                    />
                  </Field>
                  <Field label="Sale price">
                    <input
                      required
                      min="0"
                      type="number"
                      value={variant.price}
                      onChange={(event) =>
                        setVariants(
                          variants.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, price: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="field"
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Purchase price">
                    <input
                      required
                      min="0"
                      type="number"
                      value={variant.costPrice}
                      onChange={(event) =>
                        setVariants(
                          variants.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, costPrice: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="field"
                      placeholder="0"
                    />
                  </Field>
                  <button
                    disabled={variants.length === 1}
                    type="button"
                    onClick={() =>
                      setVariants(
                        variants.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    className="self-end rounded-lg p-2 text-error-600 disabled:opacity-30"
                  >
                    <XCloseIcon className="size-4" />
                  </button>
                  <span className="text-xs text-gray-500 sm:col-span-4">
                    SKU: {sku(variant.label, index)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 p-5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 text-sm font-semibold text-gray-600"
          >
            Cancel
          </button>
          <button
            disabled={pending || uploading}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            <PlusIcon className="size-4" />
            {pending ? "Creating…" : "Create product"}
          </button>
        </div>
      </form>
    </div>
  );
}
