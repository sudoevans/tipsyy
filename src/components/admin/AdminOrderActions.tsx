"use client";

import Button from "@/components/ui/button/Button";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";

const nextStatus: Record<string, { status: string; label: string } | undefined> = {
  PAID: { status: "CONFIRMED", label: "Confirm order" },
  CONFIRMED: { status: "PREPARING", label: "Start preparing" },
  PREPARING: { status: "READY_FOR_PICKUP", label: "Ready for pickup" },
  RIDER_ASSIGNED: { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  OUT_FOR_DELIVERY: { status: "DELIVERED", label: "Mark delivered" },
  DELIVERED: { status: "REFUNDED", label: "Mark refunded" },
};

export default function AdminOrderActions({ orderNumber, status, riders }: { orderNumber: string; status: string; riders: { id: string; name: string }[] }) {
  const [busy, setBusy] = useState(false);
  const [riderId, setRiderId] = useState(riders[0]?.id ?? "");
  const [error, setError] = useState("");
  const router = useRouter();
  const request = async (url: string, method: "POST" | "PATCH", body: object) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "The order could not be updated.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The order could not be updated."); }
    finally { setBusy(false); }
  };

  if (status === "READY_FOR_PICKUP") return (
    <div className="min-w-64">
      <div className="flex gap-2"><select aria-label="Select rider" className="h-11 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300" disabled={busy || !riders.length} onChange={(event) => setRiderId(event.target.value)} value={riderId}>{riders.length ? riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name}</option>) : <option value="">No riders online</option>}</select><Button disabled={busy || !riderId} onClick={() => request(`/api/v1/admin/orders/${encodeURIComponent(orderNumber)}/assign`, "POST", { riderId })} size="sm">{busy ? "Assigning…" : "Assign"}</Button></div>
      {error ? <p className="mt-1 max-w-64 whitespace-normal text-xs text-error-600">{error}</p> : null}
    </div>
  );

  const next = nextStatus[status];
  const canCancel = ["CONFIRMED", "PREPARING", "RIDER_ASSIGNED"].includes(status);
  if (!next && !canCancel) return <span className="text-xs text-gray-400">No action required</span>;
  return (
    <div className="min-w-48">
      <div className="flex flex-wrap gap-2">{next ? <Button disabled={busy} onClick={() => request(`/api/v1/admin/orders/${encodeURIComponent(orderNumber)}/status`, "PATCH", { status: next.status })} size="sm">{busy ? "Updating…" : next.label}</Button> : null}{canCancel ? <Button disabled={busy} onClick={() => request(`/api/v1/admin/orders/${encodeURIComponent(orderNumber)}/status`, "PATCH", { status: "CANCELLED" })} size="sm" variant="outline">Cancel</Button> : null}</div>
      {error ? <p className="mt-1 max-w-64 whitespace-normal text-xs text-error-600">{error}</p> : null}
    </div>
  );
}
