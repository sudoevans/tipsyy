"use client";

import { useState } from "react";
import { CheckCircleIcon, CreditCardRefreshIcon, XCloseIcon } from "@untitledui/icons-react/outline";
import { useRouter } from "@/i18n/navigation";
import { useAdminToast } from "./AdminToast";

export default function PaymentInvestigationActions({
  investigationId,
  status,
  receipt,
  payerPhone,
  amountMinor,
  canConfirm,
}: {
  investigationId: string | null;
  status: string | null;
  receipt: string | null;
  payerPhone: string;
  amountMinor: number;
  canConfirm: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [paidAt, setPaidAt] = useState("");
  const [note, setNote] = useState("");
  const router = useRouter();
  const { showToast } = useAdminToast();
  if (!investigationId || !status || ["CONFIRMED", "REJECTED", "CLOSED"].includes(status)) return <span className="text-sm text-gray-400">—</span>;
  if (!canConfirm) return <span className="text-xs text-gray-500">Administrator review required</span>;

  const confirm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paidAt) { showToast({ title: "Payment time required", description: "Enter the date and time shown in the M-Pesa message.", tone: "error" }); return; }
    setPending(true);
    try {
      const response = await fetch(`/api/v1/admin/payment-investigations/${investigationId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt, payerPhone, amountMinor, paidAt: new Date(paidAt).toISOString(), note }),
      });
      const payload = await response.json() as { data?: { fulfilmentReview?: boolean }; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Payment could not be confirmed.");
      showToast({ title: "Payment confirmed", description: payload.data?.fulfilmentReview ? "Payment was saved, but stock now needs fulfilment review." : "The order is ready for operations.", tone: "success" });
      setOpen(false);
      router.refresh();
    } catch (error) {
      showToast({ title: "Confirmation failed", description: error instanceof Error ? error.message : "Please try again.", tone: "error" });
    } finally { setPending(false); }
  };

  return <>
    <button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50 dark:border-brand-500/30 dark:bg-transparent" onClick={() => setOpen(true)} type="button"><CreditCardRefreshIcon className="size-4" strokeWidth={2} />Review</button>
    {open ? <div aria-labelledby="confirm-payment-title" className="fixed inset-0 z-[100001] grid place-items-center bg-gray-950/45 p-4" role="dialog" aria-modal="true">
      <form className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-theme-xl dark:bg-gray-dark" onSubmit={confirm}>
        <div className="flex items-start justify-between gap-4"><div><div className="flex size-9 items-center justify-center rounded-lg bg-warning-50 text-warning-600"><CreditCardRefreshIcon className="size-5" strokeWidth={2} /></div><h2 className="mt-3 text-lg font-semibold text-gray-800 dark:text-white" id="confirm-payment-title">Confirm reported payment</h2><p className="mt-1 text-sm leading-5 text-gray-500">Confirm only after reviewing the customer’s M-Pesa message. This is recorded in the audit trail.</p></div><button aria-label="Close" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10" onClick={() => setOpen(false)} type="button"><XCloseIcon className="size-5" /></button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Receipt code<input className="h-10 rounded-lg border border-gray-300 px-3 font-mono text-sm uppercase dark:border-gray-700 dark:bg-transparent" defaultValue={receipt ?? ""} disabled /></label>
          <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Payer phone<input className="h-10 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-transparent" defaultValue={payerPhone} disabled /></label>
          <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Amount (KSh)<input className="h-10 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-transparent" defaultValue={amountMinor.toLocaleString("en-KE")} disabled /></label>
          <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">M-Pesa payment time<input className="h-10 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-transparent" onChange={(event) => setPaidAt(event.target.value)} required type="datetime-local" value={paidAt} /></label>
        </div>
        <label className="mt-4 grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Review note<textarea className="min-h-22 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent" minLength={8} onChange={(event) => setNote(event.target.value)} placeholder="State what you verified in the M-Pesa message." required value={note} /></label>
        <div className="mt-5 flex justify-end gap-3"><button className="h-10 rounded-lg px-3 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10" onClick={() => setOpen(false)} type="button">Cancel</button><button className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit"><CheckCircleIcon className="size-4" strokeWidth={2} />{pending ? "Confirming…" : "Confirm payment"}</button></div>
      </form>
    </div> : null}
  </>;
}
