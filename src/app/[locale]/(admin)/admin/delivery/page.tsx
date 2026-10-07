import DeliveryZonesTable, {
  type DeliveryZone,
} from "@/components/admin/DeliveryZonesTable";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminSelect from "@/components/admin/AdminSelect";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import BasicTableOne from "@/components/tables/BasicTableOne";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { sql } from "@/server/db";
import { createFleetVehicle, saveDeliveryArea } from "../actions";

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
        slug: string;
        name: string;
        secondary_name: string | null;
        fee_mode: "STATIC" | "PER_KM";
        fee_minor: number;
        per_km_minor: number;
        minimum_fee_minor: number;
        active: boolean;
      }[]
    >`
      SELECT id,slug,name,secondary_name,fee_mode,fee_minor,per_km_minor,minimum_fee_minor,active
      FROM delivery_areas
      ORDER BY sort_order,name
    `,
    sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM fleet_vehicles`,
  ]);
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
          Manage delivery coverage, customer-facing fees, and fleet
          availability.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ComponentCard
          title="Add delivery zone"
          desc="Zones appear as delivery location suggestions at checkout."
        >
          <form action={saveDeliveryArea} className="grid gap-4 sm:grid-cols-2">
            <Input name="name" placeholder="Zone name" required />
            <Input name="slug" placeholder="zone-slug" required />
            <Input name="secondaryName" placeholder="County / area" />
            <AdminSelect
              name="feeMode"
              defaultValue="STATIC"
              placeholder="Choose fee model"
              options={[
                { value: "STATIC", label: "Static fee" },
                { value: "PER_KM", label: "Per kilometre" },
              ]}
            />
            <Input
              name="fee"
              type="number"
              min={0}
              step={1}
              placeholder="Static fee (KSh)"
            />
            <Input
              name="perKm"
              type="number"
              min={0}
              step={1}
              placeholder="Per km (KSh)"
            />
            <Input
              name="minimumFee"
              type="number"
              min={0}
              step={1}
              placeholder="Minimum fee (KSh)"
            />
            <Button type="submit">Save zone</Button>
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

      <DeliveryZonesTable
        zones={areas.map((area): DeliveryZone => ({
          id: area.id,
          slug: area.slug,
          name: area.name,
          secondaryName: area.secondary_name,
          feeMode: area.fee_mode,
          fee: area.fee_minor,
          perKm: area.per_km_minor,
          minimumFee: area.minimum_fee_minor,
          active: area.active,
        }))}
      />

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
