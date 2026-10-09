"use client";

import Button from "@/components/ui/button/Button";
import { useRouter } from "@/i18n/navigation";
import { type FormEvent, useState } from "react";
import { useAdminToast } from "@/components/admin/AdminToast";

const nextStatus: Record<string, { status: string; label: string } | undefined> = {
  PAID: { status: "CONFIRMED", label: "Confirm order" },
  CONFIRMED: { status: "PREPARING", label: "Start preparing" },
  PREPARING: { status: "READY_FOR_PICKUP", label: "Ready for pickup" },
  RIDER_ASSIGNED: { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  OUT_FOR_DELIVERY: { status: "DELIVERED", label: "Mark delivered" },
};

export default function AdminOrderActions({ orderNumber, status, riders, paymentStatus, paymentAmountMinor, refundedMinor }: { orderNumber: string; status: string; riders: { id: string; name: string }[]; paymentStatus: string | null; paymentAmountMinor: number; refundedMinor: number }) {
  const [busy, setBusy] = useState(false);
  const [riderId, setRiderId] = useState(riders[0]?.id ?? "");
  const [error, setError] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const { showToast } = useAdminToast();
  const router = useRouter();
  const request = async (url: string, method: "POST" | "PATCH", body: object): Promise<boolean> => {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "The order could not be updated.");
      router.refresh();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The order could not be updated."); }
    finally { setBusy(false); }
    return false;
  };

  if (status === "READY_FOR_PICKUP") return (
    <div className="min-w-64">
      <div className="flex gap-2"><select aria-label="Select rider" className="h-11 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300" disabled={busy || !riders.length} onChange={(event) => setRiderId(event.target.value)} value={riderId}>{riders.length ? riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name}</option>) : <option value="">No riders online</option>}</select><Button disabled={busy || !riderId} onClick={() => request(`/api/v1/admin/orders/${encodeURIComponent(orderNumber)}/assign`, "POST", { riderId })} size="sm">{busy ? "Assigning…" : "Assign"}</Button></div>
      {error ? <p className="mt-1 max-w-64 whitespace-normal text-xs text-error-600">{error}</p> : null}
    </div>
  );

  const next = nextStatus[status];
  const canCancel = ["CONFIRMED", "PREPARING", "RIDER_ASSIGNED"].includes(status);
  const refundable = paymentStatus === "SUCCEEDED" && paymentAmountMinor > refundedMinor;
  if (!next && !canCancel && !refundable) return <span className="text-xs text-gray-400">No action required</span>;
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
      <div className="flex flex-wrap gap-2">{next ? <Button disabled={busy} onClick={() => request(`/api/v1/admin/orders/${encodeURIComponent(orderNumber)}/status`, "PATCH", { status: next.status })} size="sm">{busy ? "Updating…" : next.label}</Button> : null}{canCancel ? <Button disabled={busy} onClick={() => request(`/api/v1/admin/orders/${encodeURIComponent(orderNumber)}/status`, "PATCH", { status: "CANCELLED" })} size="sm" variant="outline">Cancel</Button> : null}{refundable ? <Button disabled={busy} onClick={() => setRefundOpen(true)} size="sm" variant="outline">Record refund</Button> : null}</div>
      {error ? <p className="mt-1 max-w-64 whitespace-normal text-xs text-error-600">{error}</p> : null}
      {refundOpen ? <div className="fixed inset-0 z-[150] grid place-items-center bg-gray-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRefundOpen(false); }}><form aria-label={`Record refund for ${orderNumber}`} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl" onSubmit={recordRefund} role="dialog" aria-modal="true"><div><h2 className="text-lg font-semibold text-gray-900">Record manual refund</h2><p className="mt-1 text-sm text-gray-500">{orderNumber} · Remaining refundable: KSh {((paymentAmountMinor-refundedMinor)/100).toLocaleString("en-KE")}</p></div><label className="block text-sm font-medium text-gray-700">Refund amount (KSh)<input autoFocus className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 px-3" type="number" name="amount" min="0.01" max={(paymentAmountMinor-refundedMinor)/100} step="0.01" required /></label><label className="block text-sm font-medium text-gray-700">M-Pesa refund reference<input className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 px-3" name="reference" maxLength={80} placeholder="Optional" /></label><label className="block text-sm font-medium text-gray-700">Note<textarea className="mt-1.5 w-full rounded-lg border border-gray-300 p-3" name="note" maxLength={500} rows={3} placeholder="Optional note" /></label><div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setRefundOpen(false)} size="sm" variant="outline">Cancel</Button><Button disabled={busy} size="sm" type="submit">{busy ? "Recording…" : "Record refund"}</Button></div></form></div> : null}
    </div>
  );
}
