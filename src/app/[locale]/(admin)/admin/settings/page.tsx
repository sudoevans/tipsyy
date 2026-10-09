import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import TelegramNotificationSettings from "@/components/admin/TelegramNotificationSettings";
import { sql } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { saveOperationsSettings } from "../actions";

export const dynamic = "force-dynamic";

type SettingsValue = {
  quantity?: number;
  weekday?: { open?: string; close?: string };
  weekend?: { open?: string; close?: string };
  closingSoonMinutes?: number;
  chatId?: string;
  events?: Record<string, boolean>;
};

export default async function SettingsPage() {
  const [settings, env] = await Promise.all([
    sql<{ key: string; value: SettingsValue }[]>`
      SELECT key,value FROM platform_settings
      WHERE key IN ('inventory.low_stock_threshold','store.operating_hours','notifications.telegram')
    `,
    Promise.resolve(getServerEnv()),
  ]);
  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  const inventory = byKey.get("inventory.low_stock_threshold");
  const hours = byKey.get("store.operating_hours");
  const telegram = byKey.get("notifications.telegram");

  return (
    <div className="max-w-4xl space-y-6">
      <ComponentCard title="Operations settings" desc="Shared rules used throughout the admin and storefront.">
        <form action={saveOperationsSettings} className="space-y-6">
          <label>
            <Label>Low-stock alert level</Label>
            <Input name="lowStockThreshold" type="number" min={0} defaultValue={inventory?.quantity ?? 3} required hint="A product is marked low stock when its available units are at or below this number." />
          </label>
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Operating hours</h2>
            <p className="mt-1 text-sm text-gray-500">Customers are notified before opening, after closing, and when closing is near.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label><Label>Weekdays: opens</Label><Input name="weekdayOpen" type="time" defaultValue={hours?.weekday?.open ?? "09:00"} required /></label>
              <label><Label>Weekdays: closes</Label><Input name="weekdayClose" type="time" defaultValue={hours?.weekday?.close ?? "22:00"} required /></label>
              <label><Label>Weekends: opens</Label><Input name="weekendOpen" type="time" defaultValue={hours?.weekend?.open ?? "10:00"} required /></label>
              <label><Label>Weekends: closes</Label><Input name="weekendClose" type="time" defaultValue={hours?.weekend?.close ?? "20:00"} required /></label>
              <label><Label>Closing soon notice (minutes)</Label><Input name="closingSoonMinutes" type="number" min={5} max={180} defaultValue={hours?.closingSoonMinutes ?? 30} required /></label>
            </div>
          </div>
          <Button type="submit">Save operations settings</Button>
        </form>
      </ComponentCard>
      <TelegramNotificationSettings
        chatId={telegram?.chatId ?? ""}
        events={telegram?.events ?? {}}
        tokenConfigured={Boolean(env.TELEGRAM_BOT_TOKEN)}
      />
    </div>
  );
}
