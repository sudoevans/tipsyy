"use client";
import {
  Edit01Icon,
  PlusIcon,
  Trash01Icon,
  XCloseIcon,
} from "@untitledui/icons-react/outline";
import { useState, useTransition } from "react";
import {
  createVariant,
  setVariantActive,
  updateVariant,
} from "@/app/[locale]/(admin)/admin/actions";
import { useAdminToast } from "@/components/admin/AdminToast";
import { useRouter } from "next/navigation";
type Variant = {
  id: string;
  label: string;
  sku: string;
  priceMinor: number;
  costPriceMinor: number;
  active: boolean;
  stock: number | null;
};
type Draft = { label: string; price: string; costPrice: string };
const empty: Draft = { label: "", price: "", costPrice: "" };
export default function VariantManager({
  productId,
  variants,
}: {
  productId: string;
  variants: Variant[];
}) {
  const router = useRouter();
  const { showToast } = useAdminToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (
    title: string,
    action: () => Promise<void>,
    after?: () => void,
  ) =>
    startTransition(async () => {
      try {
        await action();
        after?.();
        showToast({ title, tone: "success" });
        router.refresh();
      } catch (error) {
        showToast({
          title: "Could not save variant",
          description:
            error instanceof Error
              ? error.message
              : "Please check the fields and try again.",
          tone: "error",
        });
      }
    });
  const add = () => {
    const form = new FormData();
    form.set("label", draft.label);
    form.set("price", draft.price);
    form.set("costPrice", draft.costPrice);
    run(
      "Variant added",
      () => createVariant(productId, form),
      () => {
        setDraft(empty);
        setAdding(false);
      },
    );
  };
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 dark:border-gray-800">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            Variants
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Each variant is tracked separately in Inventory.
          </p>
        </div>
        <button
          disabled={adding}
          onClick={() => {
            setAdding(true);
            setDraft(empty);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <PlusIcon className="size-4" />
          Add variant
        </button>
      </div>
      <div className="overflow-x-auto">
        <table
          data-variant-table
          className="w-full min-w-[860px] text-left text-sm"
        >
          <thead className="border-b border-gray-100 bg-gray-50/70 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.02]">
            <tr>
              <th className="px-5 py-3">Variant</th>
              <th className="px-5 py-3">Variant SKU</th>
              <th className="px-5 py-3">Sale price</th>
              <th className="px-5 py-3">Purchase price</th>
              <th className="px-5 py-3">Stock</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {adding ? (
              <tr>
                <td className="px-5 py-3">
                  <input
                    aria-label="Variant label"
                    value={draft.label}
                    onChange={(event) =>
                      setDraft({ ...draft, label: event.target.value })
                    }
                    placeholder="e.g. 750 ml"
                    className="field h-10"
                  />
                </td>
                <td className="px-5 py-3">
                  <input
                    aria-label="Generated variant SKU"
                    value="Generated on save"
                    readOnly
                    className="field h-10 text-gray-500"
                  />
                </td>
                <td className="px-5 py-3">
                  <input
                    aria-label="Sale price"
                    value={draft.price}
                    onChange={(event) =>
                      setDraft({ ...draft, price: event.target.value })
                    }
                    type="number"
                    min="0"
                    placeholder="0"
                    className="field h-10"
                  />
                </td>
                <td className="px-5 py-3">
                  <input
                    aria-label="Purchase price"
                    value={draft.costPrice}
                    onChange={(event) =>
                      setDraft({ ...draft, costPrice: event.target.value })
                    }
                    type="number"
                    min="0"
                    placeholder="0"
                    className="field h-10"
                  />
                </td>
                <td className="px-5 py-3 text-gray-500">—</td>
                <td className="px-5 py-3 text-gray-500">—</td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <button
                      disabled={
                        pending ||
                        !draft.label ||
                        draft.price === "" ||
                        draft.costPrice === ""
                      }
                      onClick={add}
                      className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setAdding(false);
                        setDraft(empty);
                      }}
                      className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                      aria-label="Cancel new variant"
                    >
                      <XCloseIcon className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ) : null}
            {variants.map((variant) => (
              <VariantRow
                key={variant.id}
                variant={variant}
                editing={editing === variant.id}
                pending={pending}
                onEdit={() => setEditing(variant.id)}
                onCancel={() => setEditing(null)}
                onRun={run}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function VariantRow({
  variant,
  editing,
  pending,
  onEdit,
  onCancel,
  onRun,
}: {
  variant: Variant;
  editing: boolean;
  pending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onRun: (
    title: string,
    action: () => Promise<void>,
    after?: () => void,
  ) => void;
}) {
  const [draft, setDraft] = useState({
    label: variant.label,
    sku: variant.sku,
    price: String(variant.priceMinor),
    costPrice: String(variant.costPriceMinor),
  });
  const save = () => {
    const form = new FormData();
    Object.entries(draft).forEach(([key, value]) => form.set(key, value));
    onRun("Variant updated", () => updateVariant(variant.id, form), onCancel);
  };
  return editing ? (
    <tr>
      <td className="px-5 py-3">
        <input
          aria-label="Variant label"
          value={draft.label}
          onChange={(event) =>
            setDraft({ ...draft, label: event.target.value })
          }
          className="field h-10"
        />
      </td>
      <td className="px-5 py-3">
        <input
          aria-label="Variant SKU"
          value={draft.sku}
          onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
          className="field h-10"
        />
      </td>
      <td className="px-5 py-3">
        <input
          aria-label="Sale price"
          value={draft.price}
          onChange={(event) =>
            setDraft({ ...draft, price: event.target.value })
          }
          type="number"
          min="0"
          className="field h-10"
        />
      </td>
      <td className="px-5 py-3">
        <input
          aria-label="Purchase price"
          value={draft.costPrice}
          onChange={(event) =>
            setDraft({ ...draft, costPrice: event.target.value })
          }
          type="number"
          min="0"
          className="field h-10"
        />
      </td>
      <td className="px-5 py-3 text-gray-500">{variant.stock ?? "—"}</td>
      <td className="px-5 py-3">
        <span className={variant.active ? "text-success-600" : "text-gray-500"}>
          {variant.active ? "Active" : "Removed"}
        </span>
      </td>
      <td className="px-5 py-3 text-right">
        <div className="inline-flex gap-2">
          <button
            disabled={pending}
            onClick={save}
            className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <XCloseIcon className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  ) : (
    <tr>
      <td className="px-5 py-4 font-semibold text-gray-800 dark:text-white">
        {variant.label}
      </td>
      <td className="font-mono px-5 py-4 text-xs text-gray-500">
        {variant.sku}
      </td>
      <td className="px-5 py-4">KSh {variant.priceMinor.toLocaleString()}</td>
      <td className="px-5 py-4">
        KSh {variant.costPriceMinor.toLocaleString()}
      </td>
      <td className="px-5 py-4 font-medium text-gray-700 dark:text-gray-300">
        {variant.stock ?? "—"}
      </td>
      <td className="px-5 py-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ${variant.active ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"}`}
        >
          <span
            className={`size-1.5 rounded-full ${variant.active ? "bg-success-500" : "bg-gray-400"}`}
          />
          {variant.active ? "Active" : "Removed"}
        </span>
      </td>
      <td className="px-5 py-4 text-right">
        <div className="inline-flex gap-2">
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Edit01Icon className="size-4" />
            Edit
          </button>
          {variant.active ? (
            <button
              disabled={pending}
              onClick={() =>
                onRun("Variant removed", () =>
                  setVariantActive(variant.id, false),
                )
              }
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-error-600 hover:bg-error-50"
            >
              <Trash01Icon className="size-4" />
              Remove
            </button>
          ) : (
            <button
              disabled={pending}
              onClick={() =>
                onRun("Variant restored", () =>
                  setVariantActive(variant.id, true),
                )
              }
              className="rounded-lg px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50"
            >
              Restore
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
