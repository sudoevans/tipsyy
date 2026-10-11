"use client";

import { useRef, useState, useTransition } from "react";
import { saveTelegramNotificationSettings, testTelegramConnection } from "@/app/[locale]/(admin)/admin/actions";
import { useAdminToast } from "@/components/admin/AdminToast";

const eventGroups = [
  { title: "Orders", events: [["ORDER_CREATED", "New order"], ["ORDER_PAID", "Payment confirmed"], ["ORDER_CANCELLED", "Order cancelled"], ["ORDER_REFUNDED", "Refund recorded"]] },
  { title: "Drivers", events: [["DRIVER_ASSIGNED", "Driver assigned"], ["DRIVER_PICKED_UP", "Order picked up"], ["DRIVER_DROPPED", "Order delivered"], ["DRIVER_CANCELLED", "Delivery cancelled"]] },
  { title: "Inventory", events: [["INVENTORY_LOW_STOCK", "Low stock"], ["INVENTORY_OUT_OF_STOCK", "Out of stock"]] },
] as const;

function actionErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/Server Action .+ was not found on the server/i.test(message)) {
    return "This page is out of date after a deployment. Refresh the page and try again.";
  }
  return message;
}

export default function TelegramNotificationSettings({
  chatId,
  events,
  tokenConfigured,
}: {
  chatId: string;
  events: Record<string, boolean>;
  tokenConfigured: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [hasSavedToken, setHasSavedToken] = useState(tokenConfigured);
  const { showToast } = useAdminToast();
  const test = () => {
    const form = formRef.current;
    if (!form) return;
    const currentChat = String(new FormData(form).get("chatId") ?? "").trim();
    startTransition(async () => {
      try {
        await testTelegramConnection(currentChat);
        showToast({ title: "Telegram connected", description: "A test message was sent to the chat.", tone: "success" });
      } catch (error) {
        showToast({ title: "Telegram test failed", description: actionErrorMessage(error, "Check the chat ID and bot configuration."), tone: "error" });
      }
    });
  };

  return (
    <form ref={formRef} onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(async () => {
        try {
          await saveTelegramNotificationSettings(data);
          setHasSavedToken(true);
          const tokenInput = formRef.current?.elements.namedItem("botToken");
          if (tokenInput instanceof HTMLInputElement) tokenInput.value = "";
          showToast({ title: "Telegram settings saved", tone: "success" });
        } catch (error) {
          showToast({ title: "Could not save Telegram settings", description: actionErrorMessage(error, "Please try again."), tone: "error" });
        }
      });
    }} className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Telegram notifications</h2>
        <p className="mt-1 text-sm text-gray-500">Choose which operational events are sent to your shared Telegram chat.</p>
      </div>
      <label className="block text-sm font-medium text-gray-700">
        Telegram group or chat ID
        <input name="chatId" defaultValue={chatId} placeholder="e.g. -1001234567890" className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10" />
      </label>
      <label className="block text-sm font-medium text-gray-700">
        Telegram bot token
        <input name="botToken" type="password" autoComplete="new-password" placeholder={hasSavedToken ? "Saved securely — enter a new token to replace" : "Paste bot token from BotFather"} className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10" />
      </label>
      <p className="-mt-3 text-xs leading-5 text-gray-500">
        The token is encrypted before it is stored and is never sent back to the browser. Leave blank to keep the saved token. Keep the app session secret stable; rotate and re-save this token if that secret changes.
        {!hasSavedToken ? " No bot token is configured yet." : " A bot token is saved."}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {eventGroups.map((group) => (
          <fieldset key={group.title} className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-gray-800">{group.title}</legend>
            {group.events.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" name="events" value={value} defaultChecked={events[value] ?? false} className="size-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                {label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
        <button className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50" disabled={pending} type="submit">{pending ? "Saving…" : "Save notification settings"}</button>
        <button className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50" disabled={pending || !hasSavedToken} onClick={test} type="button">
          {pending ? "Testing…" : "Send test message"}
        </button>
      </div>
    </form>
  );
}
