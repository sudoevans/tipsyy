"use client";

import { useState } from "react";
import { RefreshCw01Icon } from "@untitledui/icons-react/outline";
import { useRouter } from "@/i18n/navigation";
import { useAdminToast } from "./AdminToast";

export default function CheckStkStatusButton({ orderNumber, status, amountMinor, payerPhone, providerReceipt }: { orderNumber: string; status: string; amountMinor: number; payerPhone: string; providerReceipt: string | null }) {
  const [pending, setPending] = useState(false);
  const [pullPending, setPullPending] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [phone, setPhone] = useState(payerPhone);
  const [amount, setAmount] = useState(String(amountMinor));
  const [paidAt, setPaidAt] = useState("");
  const [note, setNote] = useState("");
  const router = useRouter();
  const { showToast } = useAdminToast();
  const canCheckStk = ["PENDING", "RECONCILING", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status);
  const canPull = !providerReceipt && ["PENDING", "RECONCILING", "FAILED", "CANCELLED", "TIMED_OUT", "SUCCEEDED"].includes(status);
  if (!canCheckStk && !canPull) return null;

  const check = async () => {
    setPending(true);
    try {
      const response = await fetch(`/api/v1/admin/transactions/${encodeURIComponent(orderNumber)}/check-stk`, { method: "POST" });
      const payload = await response.json() as { data?: { paymentStatus: string; resultCode: number | null; resultDescription: string; fulfilmentReview?: boolean }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Safaricom status could not be checked.");
      const data = payload.data;
      showToast({
        title: data.paymentStatus === "SUCCEEDED" ? "Payment confirmed" : "Status check completed",
        description: data.paymentStatus === "SUCCEEDED" ? (data.fulfilmentReview ? "Payment is confirmed, but stock needs an operations review." : "Safaricom confirmed the STK payment and inventory has been updated. Pull M-Pesa can attach its receipt when available.") : data.resultDescription,
        tone: data.paymentStatus === "SUCCEEDED" ? "success" : "info",
      });
      router.refresh();
    } catch (error) {
      showToast({ title: "Status check failed", description: error instanceof Error ? error.message : "Please try again.", tone: "error" });
    } finally { setPending(false); }
  };

  const pull = async () => {
    setPullPending(true);
    try {
      const response = await fetch(`/api/v1/admin/transactions/${encodeURIComponent(orderNumber)}/pull`, { method: "POST" });
      const payload = await response.json() as { data?: { status: string; receipt?: string; checkedCount?: number; candidateCount?: number; fulfilmentReview?: boolean }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "M-Pesa transactions could not be pulled.");
      const data = payload.data;
      const messages: Record<string, { title: string; description: string; tone: "success" | "info" }> = {
        RECONCILED: { title: "Payment reconciled", description: data.fulfilmentReview ? `Receipt ${data.receipt} matched. Stock needs an operations review.` : `Receipt ${data.receipt} matched this order and inventory was updated.`, tone: data.fulfilmentReview ? "info" : "success" },
        RECEIPT_ATTACHED: { title: "Receipt attached", description: `Safaricom receipt ${data.receipt} is linked to this already-paid order.`, tone: "success" },
        RECEIPT_ALREADY_LINKED: { title: "Receipt already linked", description: `This order already has receipt ${data.receipt}.`, tone: "info" },
        REVIEW_REQUIRED: { title: "Payment needs review", description: `${data.candidateCount ?? 0} transaction(s) used this order reference but did not safely match all details. Nothing was settled automatically.`, tone: "info" },
        SEARCH_INCOMPLETE: { title: "Search incomplete", description: "This order was not changed because Safaricom returned more records than the safe request limit. Use Record receipt with verified M-Pesa details; no partial search is auto-settled.", tone: "info" },
        NO_MATCH: { title: "No matching payment found", description: `Checked ${data.checkedCount ?? 0} recent Paybill transaction(s). The order was not changed.`, tone: "info" },
      };
      const message = messages[data.status] ?? { title: "Pull check complete", description: data.status, tone: "info" as const };
      showToast(message);
      router.refresh();
    } catch (error) {
      showToast({ title: "Pull check failed", description: error instanceof Error ? error.message : "Please try again.", tone: "error" });
    } finally { setPullPending(false); }
  };

  const recordPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch(`/api/v1/admin/transactions/${encodeURIComponent(orderNumber)}/record-payment`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt, payerPhone: phone, amountMinor: Math.round(Number(amount)), paidAt: new Date(paidAt).toISOString(), note }),
      });
      const payload = await response.json() as { data?: { matched: boolean; fulfilmentReview?: boolean }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Payment evidence could not be recorded.");
      showToast({ title: payload.data.matched ? "Payment recorded" : "Receipt recorded for review", description: payload.data.matched ? (payload.data.fulfilmentReview ? "Payment confirmed; fulfilment needs stock review." : "Payment confirmed and linked to the order.") : "Money-in evidence is saved. The order remains under review until the details are verified.", tone: payload.data.matched ? "success" : "info" });
      setRecordOpen(false);
      router.refresh();
    } catch (error) {
      showToast({ title: "Could not record payment", description: error instanceof Error ? error.message : "Please try again.", tone: "error" });
    } finally { setPending(false); }
  };

  return <>
    <div className="flex flex-wrap gap-1.5">
      {canCheckStk ? <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-gray-300" disabled={pending || pullPending} onClick={() => void check()} type="button"><RefreshCw01Icon className={`size-3.5 ${pending ? "animate-spin" : ""}`} strokeWidth={2} />{pending ? "Checking…" : "Check STK"}</button> : null}
      {canPull ? <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300" disabled={pending || pullPending} onClick={() => void pull()} type="button"><RefreshCw01Icon className={`size-3.5 ${pullPending ? "animate-spin" : ""}`} strokeWidth={2} />{pullPending ? "Pulling…" : "Pull M-Pesa"}</button> : null}
      <button className="inline-flex h-8 items-center rounded-lg border border-warning-200 bg-warning-50 px-2.5 text-xs font-semibold text-warning-700 hover:bg-warning-100 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300" onClick={() => setRecordOpen(true)} type="button">Record receipt</button>
    </div>
    {recordOpen ? <div className="fixed inset-0 z-[100001] grid place-items-center bg-gray-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="record-mpesa-title">
      <form className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-theme-xl dark:bg-gray-dark" onSubmit={recordPayment}>
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-800 dark:text-white" id="record-mpesa-title">Record M-Pesa receipt · {orderNumber}</h2><p className="mt-1 text-sm text-gray-500">Use the customer’s M-Pesa confirmation or verified Paybill entry. Mismatches are retained for review, not discarded.</p></div><button className="text-gray-400 hover:text-gray-700" onClick={() => setRecordOpen(false)} type="button" aria-label="Close">×</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">M-Pesa receipt<input autoComplete="off" className="h-10 rounded-lg border border-gray-300 px-3 font-mono text-sm uppercase dark:border-gray-700 dark:bg-transparent" required value={receipt} onChange={(e) => setReceipt(e.target.value.toUpperCase())} /></label>
          <label className="grid gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">Amount paid (KSh)<input className="h-10 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-transparent" min="0.01" required step="0.01" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="grid gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">Payer phone<input className="h-10 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-transparent" required value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <label className="grid gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">Payment time<input className="h-10 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-transparent" required type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></label>
        </div>
        <label className="mt-3 grid gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">What did you verify?<textarea className="min-h-20 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent" minLength={8} required value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="mt-4 flex justify-end gap-2"><button className="h-9 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300" onClick={() => setRecordOpen(false)} type="button">Cancel</button><button className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Recording…" : "Record payment"}</button></div>
      </form>
    </div> : null}
  </>;
}
