"use client";

import { useState, useTransition } from "react";
import { addExpense } from "@/app/[locale]/(admin)/admin/actions";
import { useAdminToast } from "./AdminToast";

export default function RecordExpenseDialog({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { showToast } = useAdminToast();

  return <>
    <button className="inline-flex h-9 items-center rounded-lg bg-brand-500 px-3.5 text-sm font-medium text-white transition hover:bg-brand-600" onClick={() => setOpen(true)} type="button">Record expense</button>
    {open ? <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-gray-950/30 p-4" role="dialog">
      <form action={(formData) => startTransition(async () => { try { await addExpense(formData); setOpen(false); showToast({ title: "Expense recorded", description: "It is now included in finance reporting.", tone: "success" }); } catch (error) { showToast({ title: "Couldn’t record expense", description: error instanceof Error ? error.message : "Please review the details and try again.", tone: "error" }); } })} className="w-full max-w-[520px] rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Record expense</h2><p className="mt-1 text-sm text-gray-500">Included in the current finance reporting.</p></div><button aria-label="Close" className="grid size-8 place-items-center rounded-lg text-xl text-gray-500 hover:bg-gray-100" onClick={() => setOpen(false)} type="button">×</button></div>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="grid min-w-0 gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Category<input className="h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-950" name="category" placeholder="Fuel" required /></label><label className="grid min-w-0 gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Amount (KSh)<input className="h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-950" min={1} name="amount" placeholder="0" required type="number" /></label><label className="grid min-w-0 gap-1.5 text-sm font-medium text-gray-700 sm:col-span-2 dark:text-gray-300">Description<input className="h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-950" name="description" placeholder="e.g. Rider fuel top-up" required /></label><label className="grid min-w-0 gap-1.5 text-sm font-medium text-gray-700 sm:max-w-[220px] dark:text-gray-300">Date<input className="h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-950" defaultValue={today} max={today} name="expenseDate" required type="date" /></label></div>
        <div className="mt-6 flex justify-end gap-2"><button className="h-9 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100" onClick={() => setOpen(false)} type="button">Cancel</button><button className="h-9 rounded-lg bg-brand-500 px-3.5 text-sm font-medium text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Saving…" : "Save expense"}</button></div>
      </form>
    </div> : null}
  </>;
}
