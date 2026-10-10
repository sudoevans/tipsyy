"use client";

import Button from "@/components/ui/button/Button";
import { useRouter } from "@/i18n/navigation";
import { ChevronDownIcon, SearchLgIcon } from "@untitledui/icons-react/outline";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAdminToast } from "@/components/admin/AdminToast";

const nextStatus: Record<string, { status: string; label: string } | undefined> = {
  PAID: { status: "CONFIRMED", label: "Confirm order" },
  CONFIRMED: { status: "PREPARING", label: "Start preparing" },
  PREPARING: { status: "READY_FOR_PICKUP", label: "Ready for pickup" },
  PICKED_UP: { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  OUT_FOR_DELIVERY: { status: "DELIVERED", label: "Mark delivered" },
};

type RiderOption = { id: string; name: string; phone: string; busy: boolean };

export default function AdminOrderActions({ orderNumber, status, riders, paymentStatus, paymentAmountMinor, refundedMinor }: { orderNumber: string; status: string; riders: RiderOption[]; paymentStatus: string | null; paymentAmountMinor: number; refundedMinor: number }) {
  const [busy, setBusy] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<{ status: string; baseStatus: string } | null>(null);
  const currentStatus = optimisticStatus?.baseStatus === status ? optimisticStatus.status : status;
  const requestInFlight = useRef(false);
  const [riderId, setRiderId] = useState(riders.find((rider) => !rider.busy)?.id ?? "");
  const [assignOpen, setAssignOpen] = useState(false);
  const [riderQuery, setRiderQuery] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const [error, setError] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const { showToast } = useAdminToast();
  const router = useRouter();
  const filteredRiders = useMemo(() => {
    const query = riderQuery.trim().toLowerCase();
    return riders.filter((rider) => !query || `${rider.name} ${rider.phone}`.toLowerCase().includes(query));
  }, [riders, riderQuery]);
  const selectedRider = riders.find((rider) => rider.id === riderId);
  useEffect(() => {
    if (!assignOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setAssignOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [assignOpen, busy]);
  const request = async (url: string, method: "POST" | "PATCH", body: object): Promise<boolean> => {
    if (requestInFlight.current) return false;
    requestInFlight.current = true;
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
      if (!response.ok) {
        // Another actor (for example, the assigned rider) may have advanced
        // the order while this screen was open. Refresh even on conflict so
        // the stale action is replaced by the committed server state.
        router.refresh();
        throw new Error(payload?.error?.message ?? "The order could not be updated.");
      }
      router.refresh();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The order could not be updated."); }
    finally { requestInFlight.current = false; setBusy(false); }
    return false;
  };

  if (currentStatus === "READY_FOR_PICKUP") return (
    <div className="w-full min-w-0 sm:min-w-48">
      <Button className="w-full justify-center sm:w-auto" disabled={busy || !riders.length} onClick={() => { setRiderQuery(""); setAssignOpen(true); }} size="sm" variant="outline">
        {selectedRider && !selectedRider.busy ? `Assign · ${selectedRider.name}` : "Choose rider"}
        <ChevronDownIcon className="ml-2 size-4" />
      </Button>
      {!riders.length ? <p className="mt-1 max-w-56 whitespace-normal text-xs text-gray-500">No active rider accounts are available.</p> : null}
      {assignOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[160] grid place-items-center bg-gray-950/45 p-4"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) setAssignOpen(false);
              }}
            >
              <section
                aria-labelledby={`assign-rider-title-${orderNumber}`}
                aria-modal="true"
                className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
                ref={dialogRef}
                role="dialog"
              >
                <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white" id={`assign-rider-title-${orderNumber}`}>
                    Assign rider to {orderNumber}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Riders with an active delivery can’t take another order.
                  </p>
                  <label className="relative mt-4 block">
                    <span className="sr-only">Search riders by name or phone</span>
                    <SearchLgIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                    <input
                      autoFocus
                      className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                      onChange={(event) => setRiderQuery(event.target.value)}
                      placeholder="Search name or phone"
                      value={riderQuery}
                    />
                  </label>
                  {error ? <p className="mt-3 text-sm text-error-600" role="alert">{error}</p> : null}
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {filteredRiders.length ? filteredRiders.map((rider) => {
                    const selected = rider.id === riderId;
                    return (
                      <button
                        aria-pressed={selected}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition ${rider.busy ? "cursor-not-allowed opacity-55" : selected ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "hover:bg-gray-50 dark:hover:bg-white/5"}`}
                        disabled={rider.busy || busy}
                        key={rider.id}
                        onClick={() => setRiderId(rider.id)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{rider.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{rider.phone || "No phone number"}</span>
                        </span>
                        <span className={`shrink-0 text-xs font-medium ${rider.busy ? "text-gray-500" : "text-success-700 dark:text-success-400"}`}>
                          {rider.busy ? "On an active delivery" : selected ? "Selected" : "Available"}
                        </span>
                      </button>
                    );
                  }) : <p className="px-3 py-8 text-center text-sm text-gray-500">No riders match that search.</p>}
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-gray-100 p-4 sm:flex-row sm:justify-end dark:border-gray-800">
                  <Button disabled={busy} onClick={() => setAssignOpen(false)} size="sm" variant="outline">Cancel</Button>
                  <Button
                    disabled={busy || !selectedRider || selectedRider.busy}
                    onClick={async () => {
                      const assigned = await request(`/api/v1/admin/orders/${encodeURIComponent(orderNumber)}/assign`, "POST", { riderId });
                      if (assigned) {
                        setOptimisticStatus({ status: "RIDER_ASSIGNED", baseStatus: status });
                        setAssignOpen(false);
                        showToast({ title: "Rider assigned", description: `${selectedRider?.name} assigned to ${orderNumber}.`, tone: "success" });
                      }
                    }}
                    size="sm"
                  >
                    {busy ? "Assigning…" : "Assign order"}
                  </Button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </div>
  );

  const next = currentStatus === "RIDER_ASSIGNED"
    ? { status: "PICKED_UP", label: "Mark picked up" }
    : nextStatus[currentStatus];
  if (currentStatus === "DELIVERED") {
    return <span className="inline-flex items-center rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-400">Delivered</span>;
  }
  const canCancel = ["CONFIRMED", "PREPARING", "RIDER_ASSIGNED"].includes(currentStatus);
  const refundable = paymentStatus === "SUCCEEDED" && paymentAmountMinor > refundedMinor;
  if (!next && !canCancel && !refundable) return <span className="text-xs text-gray-400">No action required</span>;
  const changeStatus = async (nextStatusValue: string) => {
    if (nextStatusValue === "PICKED_UP") {
      const pickedUp = await request(`/api/v1/admin/orders/${encodeURIComponent(orderNumber)}/pickup`, "POST", {});
      if (pickedUp) setOptimisticStatus({ status: "PICKED_UP", baseStatus: status });
      return;
    }
    const saved = await request(`/api/v1/admin/orders/${encodeURIComponent(orderNumber)}/status`, "PATCH", { status: nextStatusValue });
    if (saved) setOptimisticStatus({ status: nextStatusValue, baseStatus: status });
  };
  const recordRefund = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await request(`/api/v1/admin/orders/${encodeURIComponent(orderNumber)}/refund`, "POST", {
      amountMinor: Math.round(Number(form.get("amount")) * 100),
      providerReference: String(form.get("reference") ?? "").trim() || undefined,
      note: String(form.get("note") ?? "").trim() || undefined,
    });
    if (saved) {
      setRefundOpen(false);
      showToast({ title: "Refund recorded", tone: "success" });
    }
  };
  return (
    <div className="min-w-48">
      <div className="flex flex-wrap gap-2">
        {next ? <Button disabled={busy} onClick={() => changeStatus(next.status)} size="sm">{busy ? next.label === "Start preparing" ? "Starting…" : "Updating…" : next.label}</Button> : null}
        {canCancel ? <Button disabled={busy} onClick={() => changeStatus("CANCELLED")} size="sm" variant="outline">Cancel</Button> : null}
        {refundable ? <Button disabled={busy} onClick={() => setRefundOpen(true)} size="sm" variant="outline">Record refund</Button> : null}
      </div>
      {error ? <p className="mt-1 max-w-64 whitespace-normal text-xs text-error-600">{error}</p> : null}
      {refundOpen ? <div className="fixed inset-0 z-[150] grid place-items-center bg-gray-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRefundOpen(false); }}><form aria-label={`Record refund for ${orderNumber}`} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl" onSubmit={recordRefund} role="dialog" aria-modal="true"><div><h2 className="text-lg font-semibold text-gray-900">Record manual refund</h2><p className="mt-1 text-sm text-gray-500">{orderNumber} · Remaining refundable: KSh {((paymentAmountMinor-refundedMinor)/100).toLocaleString("en-KE")}</p></div><label className="block text-sm font-medium text-gray-700">Refund amount (KSh)<input autoFocus className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 px-3" type="number" name="amount" min="0.01" max={(paymentAmountMinor-refundedMinor)/100} step="0.01" required /></label><label className="block text-sm font-medium text-gray-700">M-Pesa refund reference<input className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 px-3" name="reference" maxLength={80} placeholder="Optional" /></label><label className="block text-sm font-medium text-gray-700">Note<textarea className="mt-1.5 w-full rounded-lg border border-gray-300 p-3" name="note" maxLength={500} rows={3} placeholder="Optional note" /></label><div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setRefundOpen(false)} size="sm" variant="outline">Cancel</Button><Button disabled={busy} size="sm" type="submit">{busy ? "Recording…" : "Record refund"}</Button></div></form></div> : null}
    </div>
  );
}
