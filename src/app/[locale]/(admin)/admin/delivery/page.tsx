import AdminPagination from "@/components/admin/AdminPagination";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import BasicTableOne from "@/components/tables/BasicTableOne";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { sql } from "@/server/db";
import {
  createFleetVehicle,
  saveDeliveryPricePerKm,
  saveStoreLocation,
  setStoreLocationActive,
} from "../actions";

export const dynamic = "force-dynamic";

const fleetPageSize = 10;
const date = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" });

type FleetVehicle = {
  registration: string;
  vehicle_type: string;
  make_model: string | null;
  rider: string | null;
  status: string;
  insurance_expires_at: Date | null;
  service_due_at: Date | null;
};

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const input = await searchParams;
  const requestedPage = Math.max(
    1,
    Number.parseInt(input.page ?? "1", 10) || 1,
  );
  const [areas, [fleetCount]] = await Promise.all([
    sql<
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
    `,
    sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM fleet_vehicles`,
  ]);
  const [priceSetting] = await sql<{ amount_minor: number }[]>`
    SELECT COALESCE((value->>'amount_minor')::integer,5000) AS amount_minor
    FROM platform_settings WHERE key='delivery.price_per_km'
  `;
  const fleetTotal = fleetCount?.count ?? 0;
  const fleetPageCount = Math.max(1, Math.ceil(fleetTotal / fleetPageSize));
  const fleetPage = Math.min(requestedPage, fleetPageCount);
  const fleet = await sql<FleetVehicle[]>`
    SELECT f.registration,f.vehicle_type,f.make_model,u.display_name AS rider,f.status,
           f.insurance_expires_at,f.service_due_at
    FROM fleet_vehicles f
    LEFT JOIN riders r ON r.id=f.rider_id
    LEFT JOIN users u ON u.id=r.user_id
    ORDER BY f.registration
    LIMIT ${fleetPageSize} OFFSET ${(fleetPage - 1) * fleetPageSize}
  `;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          Delivery zones
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage store locations, distance-based delivery pricing, and fleet
          availability.
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
                      step="any"
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
                        step="any"
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
                  step="any"
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
                    step="any"
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
                step="0.01"
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

        <ComponentCard
          title="Add fleet vehicle"
          desc="Track availability, insurance, and service dates."
        >
          <form
            action={createFleetVehicle}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Input name="registration" placeholder="Registration" required />
            <Input name="vehicleType" placeholder="Motorbike / van" required />
            <Input name="makeModel" placeholder="Make and model" />
            <label className="text-xs text-gray-500">
              Insurance expires
              <Input className="mt-1" name="insuranceExpires" type="date" />
            </label>
            <label className="text-xs text-gray-500">
              Service due
              <Input className="mt-1" name="serviceDue" type="date" />
            </label>
            <Button type="submit">Add vehicle</Button>
          </form>
        </ComponentCard>
      </div>

      <BasicTableOne
        title="Fleet management"
        description="Vehicles, assigned drivers, and compliance dates."
        columns={[
          "Registration",
          "Vehicle",
          "Driver",
          "Status",
          "Insurance",
          "Service due",
        ]}
        empty="No fleet vehicles recorded."
        pagination={false}
        footer={
          <AdminPagination
            page={fleetPage}
            pageCount={fleetPageCount}
            total={fleetTotal}
            pageSize={fleetPageSize}
          />
        }
        rows={fleet.map((vehicle) => [
          <span key="registration" className="font-medium text-gray-800">
            {vehicle.registration}
          </span>,
          [vehicle.vehicle_type, vehicle.make_model]
            .filter(Boolean)
            .join(" · "),
          vehicle.rider ?? "Unassigned",
          <Badge
            key="status"
            size="sm"
            color={
              vehicle.status === "AVAILABLE"
                ? "success"
                : vehicle.status === "MAINTENANCE"
                  ? "warning"
                  : "light"
            }
          >
            {vehicle.status}
          </Badge>,
          vehicle.insurance_expires_at
            ? date.format(vehicle.insurance_expires_at)
            : "—",
          vehicle.service_due_at ? date.format(vehicle.service_due_at) : "—",
        ])}
      />
    </div>
  );
}
