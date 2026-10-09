import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import { sql } from "@/server/db";
import {
  saveDeliveryPricePerKm,
  saveStoreLocation,
  setStoreLocationActive,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const areas = await sql<
    {
      id: string;
      name: string;
      address: string;
      latitude: number;
      longitude: number;
      active: boolean;
    }[]
  >`
      SELECT id,name,address,latitude::float8,longitude::float8,active FROM store_locations ORDER BY active DESC,name
    `;
  const [priceSetting] = await sql<{ amount_minor: number }[]>`
    SELECT COALESCE((value->>'amount_minor')::integer,5000) AS amount_minor
    FROM platform_settings WHERE key='delivery.price_per_km'
  `;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          Delivery settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage store locations and per-kilometre delivery pricing.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <ComponentCard
          title="Store locations"
          desc="Delivery is priced from the nearest active store using the customer's current location."
        >
          <div className="space-y-3">
            {areas.map((store) => (
              <div
                key={store.id}
                className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <form
                  action={saveStoreLocation}
                  className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4"
                >
                  <input type="hidden" name="storeId" value={store.id} />
                  <label className="text-xs text-gray-500">
                    Store name
                    <Input
                      className="mt-1"
                      name="name"
                      defaultValue={store.name}
                      required
                    />
                  </label>
                  <label className="text-xs text-gray-500">
                    Address / plus code
                    <Input
                      className="mt-1"
                      name="address"
                      defaultValue={store.address}
                      required
                    />
                  </label>
                  <label className="text-xs text-gray-500">
                    Latitude
                    <Input
                      className="mt-1"
                      name="latitude"
                      type="number"
                      step={0.000001}
                      defaultValue={store.latitude}
                      required
                    />
                  </label>
                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <label className="text-xs text-gray-500">
                      Longitude
                      <Input
                        className="mt-1"
                        name="longitude"
                        type="number"
                        step={0.000001}
                        defaultValue={store.longitude}
                        required
                      />
                    </label>
                    <Button type="submit">Save</Button>
                  </div>
                </form>
                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
                  <Badge size="sm" color={store.active ? "success" : "light"}>
                    {store.active ? "Active" : "Inactive"}
                  </Badge>
                  <form
                    action={setStoreLocationActive.bind(
                      null,
                      store.id,
                      !store.active,
                    )}
                  >
                    <Button type="submit" variant="outline">
                      {store.active ? "Deactivate" : "Activate"}
                    </Button>
                  </form>
                </div>
              </div>
            ))}
            <form
              action={saveStoreLocation}
              className="grid items-end gap-3 rounded-xl border border-dashed border-gray-300 p-4 sm:grid-cols-2 xl:grid-cols-4 dark:border-gray-700"
            >
              <label className="text-xs text-gray-500">
                New store name
                <Input
                  className="mt-1"
                  name="name"
                  placeholder="Store name"
                  required
                />
              </label>
              <label className="text-xs text-gray-500">
                Address / plus code
                <Input
                  className="mt-1"
                  name="address"
                  placeholder="Address or plus code"
                  required
                />
              </label>
              <label className="text-xs text-gray-500">
                Latitude
                <Input
                  className="mt-1"
                  name="latitude"
                  type="number"
                  step={0.000001}
                  placeholder="-0.3935871"
                  required
                />
              </label>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <label className="text-xs text-gray-500">
                  Longitude
                  <Input
                    className="mt-1"
                    name="longitude"
                    type="number"
                    step={0.000001}
                    placeholder="37.1322716"
                    required
                  />
                </label>
                <Button type="submit">Add store</Button>
              </div>
            </form>
          </div>
        </ComponentCard>

        <ComponentCard
          title="Delivery pricing"
          desc="One rate applies to every delivery, based on distance from the nearest active store."
        >
          <form action={saveDeliveryPricePerKm} className="grid gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Price per kilometre (KSh)
              <Input
                className="mt-2"
                name="amount"
                type="number"
                min={0}
                step={0.01}
                defaultValue={(priceSetting?.amount_minor ?? 5000) / 100}
                required
              />
            </label>
            <p className="text-xs text-gray-500">
              Straight-line distance is rounded up to the next kilometre. For
              example, 2.1 km is charged as 3 km.
            </p>
            <Button type="submit">Save rate</Button>
          </form>
        </ComponentCard>

      </div>
    </div>
  );
}
