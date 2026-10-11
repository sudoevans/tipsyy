"use client";

import { useState } from "react";
import { saveTelegramNotificationSettings, testTelegramConnection } from "@/app/[locale]/(admin)/admin/actions";
import EditableSettingsCard from "./EditableSettingsCard";

const eventGroups = [
  { title: "Orders", events: [["ORDER_CREATED", "New order"], ["ORDER_PAID", "Payment confirmed"], ["ORDER_CANCELLED", "Order cancelled"], ["ORDER_REFUNDED", "Refund recorded"]] },
  { title: "Drivers", events: [["DRIVER_ASSIGNED", "Driver assigned"], ["DRIVER_PICKED_UP", "Order picked up"], ["DRIVER_DROPPED", "Order delivered"], ["DRIVER_CANCELLED", "Delivery cancelled"]] },
  { title: "Inventory", events: [["INVENTORY_LOW_STOCK", "Low stock"], ["INVENTORY_OUT_OF_STOCK", "Out of stock"]] },
] as const;

export default function TelegramNotificationSettings({ chatId, events, tokenConfigured }: {
  chatId: string; events: Record<string, boolean>; tokenConfigured: boolean;
}) {
  const [savedChat, setSavedChat] = useState(chatId);
  const [hasSavedToken, setHasSavedToken] = useState(tokenConfigured);
  async function save(data: FormData) {
    await saveTelegramNotificationSettings(data);
    setSavedChat(String(data.get("chatId") ?? "").trim());
    if (String(data.get("botToken") ?? "").trim()) setHasSavedToken(true);
  }
  return <EditableSettingsCard title="Telegram notifications" description="Operational alerts for your shared Telegram chat." onSave={save} onTest={hasSavedToken && savedChat ? async () => { await testTelegramConnection(savedChat); } : undefined}>
    <label className="block text-sm font-medium text-gray-700">Telegram group or chat ID
      <input name="chatId" defaultValue={chatId} placeholder="e.g. -1001234567890" className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10" />
    </label>
    <label className="block text-sm font-medium text-gray-700">Telegram bot token
      <input name="botToken" type="password" autoComplete="new-password" placeholder={hasSavedToken ? "Saved securely — leave blank to keep" : "No token configured"} className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10" />
    </label>
    <p className="text-xs text-gray-500">{hasSavedToken ? "Token saved securely. Enter a new token only to replace it." : "Add a bot token to enable Telegram alerts."}</p>
    <div className="grid gap-4 sm:grid-cols-3">
      {eventGroups.map((group) => <fieldset key={group.title} className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-gray-800">{group.title}</legend>
        {group.events.map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" name="events" value={value} defaultChecked={events[value] ?? false} className="size-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />{label}
        </label>)}
      </fieldset>)}
    </div>
  </EditableSettingsCard>;
}
