"use client";

import {
  DotsVerticalIcon,
  Edit01Icon,
  PauseCircleIcon,
  PlayCircleIcon,
  XCloseIcon,
} from "@untitledui/icons-react/outline";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  saveDeliveryArea,
  setDeliveryAreaActive,
} from "@/app/[locale]/(admin)/admin/actions";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminSelect from "@/components/admin/AdminSelect";
import Badge from "@/components/ui/badge/Badge";

export type DeliveryZone = {
  id: string;
  slug: string;
  name: string;
  secondaryName: string | null;
  feeMode: "STATIC" | "PER_KM";
  fee: number;
  perKm: number;
  minimumFee: number;
  active: boolean;
};

const money = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

export default function DeliveryZonesTable({
  zones,
}: {
  zones: DeliveryZone[];
}) {
  const [editing, setEditing] = useState<DeliveryZone | null>(null);

  return (
    <section className="overflow-visible rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
          Delivery zones & fees
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Customer location suggestions and the pricing rule applied at
          checkout.
        </p>
      </div>
      {zones.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/70 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.02]">
              <tr>
                <th className="px-5 py-3 font-medium">Zone</th>
                <th className="px-5 py-3 font-medium">Area</th>
                <th className="px-5 py-3 font-medium">Fee model</th>
                <th className="px-5 py-3 text-right font-medium">Rate</th>
                <th className="px-5 py-3 text-right font-medium">Minimum</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {zones.map((zone, index) => (
                <tr
                  key={zone.id}
                  className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-4 font-semibold text-gray-800 dark:text-white">
                    {zone.name}
                  </td>
                  <td className="px-5 py-4 text-gray-500">
                    {zone.secondaryName ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {zone.feeMode === "STATIC" ? "Static" : "Per kilometre"}
                  </td>
                  <td className="px-5 py-4 text-right font-medium text-gray-800 dark:text-white">
                    {zone.feeMode === "STATIC"
                      ? money.format(zone.fee)
                      : `${money.format(zone.perKm)} / km`}
                  </td>
                  <td className="px-5 py-4 text-right text-gray-600 dark:text-gray-300">
                    {money.format(zone.minimumFee)}
                  </td>
                  <td className="px-5 py-4">
                    <Badge color={zone.active ? "success" : "light"} size="sm">
                      {zone.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <ZoneActions
                      zone={zone}
                      openUp={index >= zones.length - 2}
                      onEdit={() => setEditing(zone)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-14 text-center text-sm text-gray-500">
          Add a delivery zone to begin serving customers.
        </p>
      )}
      {editing ? (
        <EditDeliveryZoneDialog
          key={editing.id}
          zone={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

function ZoneActions({
  zone,
  openUp,
  onEdit,
}: {
  zone: DeliveryZone;
  openUp: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const { showToast } = useAdminToast();
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      try {
        await setDeliveryAreaActive(zone.id, !zone.active);
        showToast({
          title: zone.active
            ? "Delivery zone paused"
            : "Delivery zone activated",
          tone: "success",
        });
        router.refresh();
      } catch (error) {
        showToast({
          title: "Could not update delivery zone",
          description:
            error instanceof Error ? error.message : "Please try again.",
          tone: "error",
        });
      }
    });

  return (
    <details className="relative inline-block text-left">
      <summary className="inline-flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5 [&::-webkit-details-marker]:hidden">
        <DotsVerticalIcon className="size-4" />
      </summary>
      <div
        className={`absolute right-0 z-30 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-theme-md dark:border-gray-700 dark:bg-gray-900 ${openUp ? "right-0 bottom-full mb-1" : "mt-1"}`}
      >
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            onEdit();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
        >
          <Edit01Icon className="size-4" />
          Edit zone
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={(event) => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            toggle();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:text-gray-200 dark:hover:bg-white/5"
        >
          {zone.active ? (
            <PauseCircleIcon className="size-4" />
          ) : (
            <PlayCircleIcon className="size-4" />
          )}
          {zone.active ? "Pause zone" : "Activate zone"}
        </button>
      </div>
    </details>
  );
}

function EditDeliveryZoneDialog({
  zone,
  onClose,
}: {
  zone: DeliveryZone;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useAdminToast();
  const [pending, startTransition] = useTransition();
  const [feeMode, setFeeMode] = useState(zone.feeMode);
  const [name, setName] = useState(zone.name);
  const [secondaryName, setSecondaryName] = useState(zone.secondaryName ?? "");
  const [fee, setFee] = useState(String(zone.fee));
  const [perKm, setPerKm] = useState(String(zone.perKm));
  const [minimumFee, setMinimumFee] = useState(String(zone.minimumFee));

  const save = () =>
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("name", name);
        formData.set("slug", zone.slug);
        formData.set("secondaryName", secondaryName);
        formData.set("feeMode", feeMode);
        formData.set("fee", fee);
        formData.set("perKm", perKm);
        formData.set("minimumFee", minimumFee);
        await saveDeliveryArea(formData);
        showToast({ title: "Delivery zone updated", tone: "success" });
        onClose();
        router.refresh();
      } catch (error) {
        showToast({
          title: "Could not update delivery zone",
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
      aria-labelledby="edit-delivery-zone-title"
      className="fixed inset-0 z-[140] flex items-end bg-gray-950/40 sm:items-center sm:justify-center sm:p-6"
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-theme-xl sm:rounded-2xl dark:bg-gray-900">
        <div className="flex items-start justify-between border-b border-gray-100 p-5 dark:border-gray-800">
          <div>
            <h2
              id="edit-delivery-zone-title"
              className="text-lg font-semibold text-gray-800 dark:text-white"
            >
              Edit delivery zone
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Update the delivery availability and pricing rule.
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
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Zone name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field mt-1.5 h-11"
              required
            />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Area
            <input
              value={secondaryName}
              onChange={(event) => setSecondaryName(event.target.value)}
              placeholder="County / area"
              className="field mt-1.5 h-11"
            />
          </label>
          <div className="sm:col-span-2">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Fee model
            </span>
            <AdminSelect
              key={zone.id}
              value={feeMode}
              onValueChange={(value) =>
                setFeeMode(value as "STATIC" | "PER_KM")
              }
              placeholder="Choose a fee model"
              className="mt-1.5"
              options={[
                { value: "STATIC", label: "Static fee" },
                { value: "PER_KM", label: "Per kilometre" },
              ]}
            />
          </div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Static fee (KSh)
            <input
              type="number"
              min="0"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
              className="field mt-1.5 h-11"
              disabled={feeMode !== "STATIC"}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Per kilometre (KSh)
            <input
              type="number"
              min="0"
              value={perKm}
              onChange={(event) => setPerKm(event.target.value)}
              className="field mt-1.5 h-11"
              disabled={feeMode !== "PER_KM"}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Minimum fee (KSh)
            <input
              type="number"
              min="0"
              value={minimumFee}
              onChange={(event) => setMinimumFee(event.target.value)}
              className="field mt-1.5 h-11"
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || !name.trim()}
            className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
