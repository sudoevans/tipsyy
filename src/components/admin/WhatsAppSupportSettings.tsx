"use client";

import { useState, useTransition } from "react";
import { saveWhatsAppSupportNumber } from "@/app/[locale]/(admin)/admin/actions";
import { useAdminToast } from "@/components/admin/AdminToast";

export default function WhatsAppSupportSettings({ supportNumber }: { supportNumber: string }) {
  const [pending, startTransition] = useTransition();
  const [number, setNumber] = useState(supportNumber);
  const { showToast } = useAdminToast();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        await saveWhatsAppSupportNumber(formData);
        const cleaned = String(formData.get("supportNumber") ?? "").replace(/[\s()+.-]/g, "");
        setNumber(cleaned);
        showToast({ title: "WhatsApp support number saved", tone: "success" });
      } catch (error) {
        showToast({ title: "Could not save WhatsApp number", description: error instanceof Error ? error.message : "Please try again.", tone: "error" });
      }
    });
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-800">WhatsApp support</h2>
        <p className="mt-1 text-sm text-gray-500">Choose where storefront support and order-help messages should go.</p>
      </div>
      <label className="block text-sm font-medium text-gray-700">
        WhatsApp number
        <input
          autoComplete="tel"
          className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 sm:max-w-md"
          inputMode="tel"
          name="supportNumber"
          onChange={(event) => setNumber(event.target.value)}
          placeholder="2547XXXXXXXX"
          value={number}
        />
      </label>
      <p className="text-xs leading-5 text-gray-500">Include the country code and enter digits only (10–15 digits). Leave blank to hide the storefront WhatsApp contact button.</p>
      <button className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50" disabled={pending} type="submit">
        {pending ? "Saving…" : "Save WhatsApp settings"}
      </button>
    </form>
  );
}
