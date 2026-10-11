"use client";

import { saveWhatsAppSupportNumber } from "@/app/[locale]/(admin)/admin/actions";
import EditableSettingsCard from "./EditableSettingsCard";

export default function WhatsAppSupportSettings({ supportNumber }: { supportNumber: string }) {
  return <EditableSettingsCard title="WhatsApp support" description="Storefront support and order-help contact." onSave={saveWhatsAppSupportNumber}>
    <label className="block text-sm font-medium text-gray-700">WhatsApp number
      <input autoComplete="tel" className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 sm:max-w-md" inputMode="tel" name="supportNumber" placeholder="2547XXXXXXXX" defaultValue={supportNumber} />
    </label>
    <p className="text-xs leading-5 text-gray-500">Use 10–15 digits, including the country code. Leave blank to hide WhatsApp support.</p>
  </EditableSettingsCard>;
}
