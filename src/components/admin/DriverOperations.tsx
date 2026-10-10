"use client";

import {
  ChartBreakoutSquareIcon,
  CheckCircleIcon,
  Copy01Icon,
  DotsVerticalIcon,
  SearchLgIcon,
  Truck01Icon,
  UserPlus01Icon,
  Users01Icon,
  Wallet01Icon,
  XCloseIcon,
} from "@untitledui/icons-react/outline";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRider,
  createFleetVehicle,
  recordDriverPayout,
  setRiderStatus,
} from "@/app/[locale]/(admin)/admin/actions";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminSelect from "@/components/admin/AdminSelect";
import Badge from "@/components/ui/badge/Badge";
import AdminPagination from "@/components/admin/AdminPagination";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import BasicTableOne from "@/components/tables/BasicTableOne";

type Driver = {
  id: string;
  name: string;
  phone: string;
  userStatus: string;
  availability: string;
  vehicle: string;
  activeDeliveries: number;
  assignments: number;
  delivered: number;
  cancelled: number;
  earned: number;
  paid: number;
  currentWeekUnpaid: number;
};

type Delivery = {
  id: string;
  riderId: string;
  riderName: string;
  status: string;
  payout: number;
  payoutStatus: string;
  orderNumber: string;
  customerName: string;
  orderTotal: number;
  assignedAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
};

type DriverPayout = {
  id: string;
  riderId: string;
  riderName: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: string;
  reference: string;
  paidAt: string | null;
  deliveryCount: number;
};

type PayoutSummary = {
  earned: number;
  paid: number;
  pending: number;
  currentWeekDue: number;
  periodStart: string;
  periodEnd: string;
};

type PendingPayment = {
  riderId: string;
  riderName: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  deliveryCount: number;
  canPay: boolean;
  orders: {
    orderNumber: string;
    customerName: string;
    payout: number;
    deliveredAt: string;
  }[];
};

type Props = {
  drivers: Driver[];
  deliveries: Delivery[];
  payouts: DriverPayout[];
  payoutSummary: PayoutSummary;
  pendingPayments: PendingPayment[];
  fleet: FleetVehicle[];
  fleetPage: number;
  fleetPageCount: number;
  fleetTotal: number;
  fleetPageSize: number;
};
type FleetVehicle = {
  registration: string;
  vehicleType: string;
  makeModel: string | null;
  rider: string | null;
  status: string;
  insuranceExpiresAt: string | null;
  serviceDueAt: string | null;
};
type Tab = "overview" | "drivers" | "deliveries" | "payments" | "fleet";

const money = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat("en-KE", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" });
const pageSize = 10;

const deliveryStatuses = [
  { value: "all", label: "All delivery statuses" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "PICKED_UP", label: "Picked up" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "DECLINED", label: "Declined" },
  { value: "CANCELLED", label: "Cancelled" },
];

const driverStatuses = [
  { value: "all", label: "All drivers" },
  { value: "AVAILABLE", label: "Available" },
  { value: "BUSY", label: "Busy" },
  { value: "OFFBOARDED", label: "Offboarded" },
];

function deliveryRate(driver: Driver) {
  return driver.assignments
    ? Math.round((driver.delivered / driver.assignments) * 100)
    : 0;
}

function cancellationRate(driver: Driver) {
  return driver.assignments
    ? Math.round((driver.cancelled / driver.assignments) * 100)
    : 0;
}

function statusColor(status: string) {
  if (["DELIVERED", "ONLINE", "AVAILABLE", "PAID"].includes(status))
    return "success" as const;
  if (["DECLINED", "CANCELLED", "OFFBOARDED"].includes(status))
    return "error" as const;
  if (["BUSY", "ASSIGNED", "ACCEPTED", "PICKED_UP", "UNPAID"].includes(status))
    return "warning" as const;
  return "light" as const;
}

function behaviour(driver: Driver) {
  const completion = deliveryRate(driver);
  const cancellations = cancellationRate(driver);
  if (!driver.assignments) {
    return { label: "No delivery history", tone: "text-gray-500" };
  }
  if (cancellations >= 20 || completion < 70) {
    return { label: "Needs review", tone: "text-error-600" };
  }
  if (completion >= 90 && cancellations <= 5) {
    return { label: "Reliable", tone: "text-success-600" };
  }
  return { label: "Monitoring", tone: "text-warning-600" };
}

export default function DriverOperations({
  drivers,
  deliveries,
  payouts,
  payoutSummary,
  pendingPayments,
  fleet,
  fleetPage,
  fleetPageCount,
  fleetTotal,
  fleetPageSize,
}: Props) {
  const { showToast } = useAdminToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [onboarding, setOnboarding] = useState(false);
  const [driverQuery, setDriverQuery] = useState("");
  const [driverStatus, setDriverStatus] = useState("all");
  const [driverSort, setDriverSort] = useState("deliveries");
  const [deliveryQuery, setDeliveryQuery] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("all");
  const [payoutStatus, setPayoutStatus] = useState("all");
  const [payoutQuery, setPayoutQuery] = useState("");
  const [driversPage, setDriversPage] = useState(1);
  const [deliveriesPage, setDeliveriesPage] = useState(1);
  const [payoutsPage, setPayoutsPage] = useState(1);
  const [activityDriver, setActivityDriver] = useState<Driver | null>(null);
  const [selectedPendingPayment, setSelectedPendingPayment] =
    useState<PendingPayment | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredDrivers = useMemo(() => {
    const normalizedQuery = driverQuery.trim().toLowerCase();
    return [...drivers]
      .filter((driver) => {
        const matchesQuery =
          !normalizedQuery ||
          [driver.name, driver.phone, driver.vehicle]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);
        const matchesStatus =
          driverStatus === "all" ||
          (driverStatus === "OFFBOARDED"
            ? driver.userStatus !== "ACTIVE"
            : driver.userStatus === "ACTIVE" &&
              driver.availability === driverStatus);
        return matchesQuery && matchesStatus;
      })
      .sort((left, right) => {
        if (driverSort === "earnings") return right.earned - left.earned;
        if (driverSort === "completion")
          return deliveryRate(right) - deliveryRate(left);
        if (driverSort === "cancellations")
          return cancellationRate(right) - cancellationRate(left);
        return right.delivered - left.delivered;
      });
  }, [driverQuery, driverSort, driverStatus, drivers]);

  const filteredDeliveries = useMemo(() => {
    const normalizedQuery = deliveryQuery.trim().toLowerCase();
    return deliveries.filter((delivery) => {
      const matchesQuery =
        !normalizedQuery ||
        [delivery.orderNumber, delivery.riderName, delivery.customerName]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      return (
        matchesQuery &&
        (deliveryStatus === "all" || delivery.status === deliveryStatus) &&
        (payoutStatus === "all" || delivery.payoutStatus === payoutStatus)
      );
    });
  }, [deliveries, deliveryQuery, deliveryStatus, payoutStatus]);

  const filteredPayouts = useMemo(() => {
    const normalizedQuery = payoutQuery.trim().toLowerCase();
    if (!normalizedQuery) return payouts;
    return payouts.filter((payout) =>
      [payout.riderName, payout.reference]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [payoutQuery, payouts]);

  const driversPageCount = Math.max(
    1,
    Math.ceil(filteredDrivers.length / pageSize),
  );
  const deliveriesPageCount = Math.max(
    1,
    Math.ceil(filteredDeliveries.length / pageSize),
  );
  const payoutsPageCount = Math.max(
    1,
    Math.ceil(filteredPayouts.length / pageSize),
  );
  const currentDriversPage = Math.min(driversPage, driversPageCount);
  const currentDeliveriesPage = Math.min(deliveriesPage, deliveriesPageCount);
  const currentPayoutsPage = Math.min(payoutsPage, payoutsPageCount);
  const pagedDrivers = filteredDrivers.slice(
    (currentDriversPage - 1) * pageSize,
    currentDriversPage * pageSize,
  );
  const pagedDeliveries = filteredDeliveries.slice(
    (currentDeliveriesPage - 1) * pageSize,
    currentDeliveriesPage * pageSize,
  );
  const pagedPayouts = filteredPayouts.slice(
    (currentPayoutsPage - 1) * pageSize,
    currentPayoutsPage * pageSize,
  );
  const delivered = drivers.reduce(
    (total, driver) => total + driver.delivered,
    0,
  );
  const activeDrivers = drivers.filter(
    (driver) =>
      driver.userStatus === "ACTIVE" && driver.availability !== "OFFLINE",
  ).length;

  const run = (title: string, action: () => Promise<void>) =>
    startTransition(async () => {
      try {
        await action();
        router.refresh();
        showToast({ title, tone: "success" });
      } catch (error) {
        showToast({
          title: "Action could not be completed",
          description:
            error instanceof Error ? error.message : "Please try again.",
          tone: "error",
        });
      }
    });

  const copyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      showToast({ title: "Phone number copied", tone: "success" });
    } catch {
      showToast({
        title: "Could not copy phone number",
        description: "Select and copy the number manually.",
        tone: "error",
      });
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            Drivers
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Track delivery performance, earnings, balances, and rider activity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOnboarding(true)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          <UserPlus01Icon className="size-4" />
          Onboard driver
        </button>
      </header>

      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="-mb-px flex gap-5" aria-label="Driver sections">
          {[
            ["overview", "Overview"],
            ["drivers", "Drivers"],
            ["deliveries", "Deliveries"],
            ["payments", "Payments"],
            ["fleet", "Fleet"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setTab(value as Tab)}
              className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${
                tab === value
                  ? "border-brand-500 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "overview" ? (
        <DriverOverview
          drivers={drivers}
          activeDrivers={activeDrivers}
          delivered={delivered}
          totalEarned={payoutSummary.earned}
          payoutBalance={payoutSummary.pending}
          onViewDriver={(driver) => setActivityDriver(driver)}
        />
      ) : null}
      {tab === "drivers" ? (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-gray-800">
            <label className="relative block w-full lg:max-w-sm">
              <SearchLgIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
              <input
                value={driverQuery}
                onChange={(event) => {
                  setDriverQuery(event.target.value);
                  setDriversPage(1);
                }}
                placeholder="Search driver, phone or vehicle"
                className="h-10 w-full rounded-lg border border-gray-300 py-2 pr-3 pl-10 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <AdminSelect
                key={`driver-status-${driverStatus}`}
                value={driverStatus}
                onValueChange={(value) => {
                  setDriverStatus(value);
                  setDriversPage(1);
                }}
                placeholder="Filter status"
                options={driverStatuses}
              />
              <AdminSelect
                key={`driver-sort-${driverSort}`}
                value={driverSort}
                onValueChange={(value) => {
                  setDriverSort(value);
                  setDriversPage(1);
                }}
                placeholder="Rank by deliveries"
                options={[
                  { value: "deliveries", label: "Rank by deliveries" },
                  { value: "completion", label: "Rank by completion" },
                  { value: "earnings", label: "Rank by earnings" },
                  { value: "cancellations", label: "Fewest cancellations" },
                ]}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50/70 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-5 py-3">Driver</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Vehicle</th>
                  <th className="px-5 py-3 text-right">Assigned</th>
                  <th className="px-5 py-3 text-right">Delivered</th>
                  <th className="px-5 py-3">Delivery rate</th>
                  <th className="px-5 py-3 text-right">Earned</th>
                  <th className="px-5 py-3 text-right">Paid</th>
                  <th className="px-5 py-3 text-right">Balance</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pagedDrivers.map((driver, index) => (
                  <DriverRow
                    key={driver.id}
                    driver={driver}
                    rank={(currentDriversPage - 1) * pageSize + index + 1}
                    openUp={index >= pagedDrivers.length - 2}
                    pending={pending}
                    onCopy={copyPhone}
                    onView={() => setActivityDriver(driver)}
                    onStatus={(enabled) =>
                      run(
                        enabled ? "Driver reactivated" : "Driver offboarded",
                        () => setRiderStatus(driver.id, enabled),
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!pagedDrivers.length ? (
            <p className="p-14 text-center text-sm text-gray-500">
              No drivers match this search or filter.
            </p>
          ) : null}
          <LocalPagination
            page={currentDriversPage}
            pageCount={driversPageCount}
            total={filteredDrivers.length}
            onPageChange={setDriversPage}
          />
        </section>
      ) : null}
      {tab === "deliveries" ? (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 xl:flex-row xl:items-center xl:justify-between dark:border-gray-800">
            <label className="relative block w-full xl:max-w-sm">
              <SearchLgIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
              <input
                value={deliveryQuery}
                onChange={(event) => {
                  setDeliveryQuery(event.target.value);
                  setDeliveriesPage(1);
                }}
                placeholder="Search order, driver or customer"
                className="h-10 w-full rounded-lg border border-gray-300 py-2 pr-3 pl-10 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <AdminSelect
                key={`delivery-status-${deliveryStatus}`}
                value={deliveryStatus}
                onValueChange={(value) => {
                  setDeliveryStatus(value);
                  setDeliveriesPage(1);
                }}
                placeholder="All delivery statuses"
                options={deliveryStatuses}
              />
              <AdminSelect
                key={`payout-status-${payoutStatus}`}
                value={payoutStatus}
                onValueChange={(value) => {
                  setPayoutStatus(value);
                  setDeliveriesPage(1);
                }}
                placeholder="All payout statuses"
                options={[
                  { value: "all", label: "All payout statuses" },
                  { value: "PAID", label: "Paid" },
                  { value: "UNPAID", label: "Unpaid" },
                ]}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50/70 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-5 py-3">Order</th>
                  <th className="px-5 py-3">Driver</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Assigned</th>
                  <th className="px-5 py-3">Delivered</th>
                  <th className="px-5 py-3">Delivery</th>
                  <th className="px-5 py-3 text-right">Payout</th>
                  <th className="px-5 py-3">Payout status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pagedDeliveries.map((delivery) => (
                  <tr
                    key={delivery.id}
                    className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-4 font-semibold text-gray-800 dark:text-white">
                      {delivery.orderNumber}
                    </td>
                    <td className="px-5 py-4 font-medium text-gray-800 dark:text-gray-200">
                      {delivery.riderName}
                    </td>
                    <td className="px-5 py-4 text-gray-500">
                      {delivery.customerName}
                    </td>
                    <td className="px-5 py-4 text-gray-500">
                      {formatDate(delivery.assignedAt)}
                    </td>
                    <td className="px-5 py-4 text-gray-500">
                      {delivery.deliveredAt
                        ? formatDate(delivery.deliveredAt)
                        : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <Badge color={statusColor(delivery.status)} size="sm">
                        {delivery.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-gray-800 dark:text-white">
                      {money.format(delivery.payout)}
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        color={statusColor(delivery.payoutStatus)}
                        size="sm"
                      >
                        {delivery.payoutStatus}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!pagedDeliveries.length ? (
            <p className="p-14 text-center text-sm text-gray-500">
              No delivery records match this search or filter.
            </p>
          ) : null}
          <LocalPagination
            page={currentDeliveriesPage}
            pageCount={deliveriesPageCount}
            total={filteredDeliveries.length}
            onPageChange={setDeliveriesPage}
          />
        </section>
      ) : null}
      {tab === "payments" ? (
        <DriverPayments
          payouts={pagedPayouts}
          payoutSummary={payoutSummary}
          pendingPayments={pendingPayments}
          search={payoutQuery}
          total={filteredPayouts.length}
          page={currentPayoutsPage}
          pageCount={payoutsPageCount}
          onSearch={(value) => {
            setPayoutQuery(value);
            setPayoutsPage(1);
          }}
          onPageChange={setPayoutsPage}
          onPayDriver={setSelectedPendingPayment}
        />
      ) : null}
      {tab === "fleet" ? (
        <div className="space-y-5">
          <ComponentCard title="Add fleet vehicle" desc="Track vehicles used by your drivers.">
            <form action={createFleetVehicle} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Input name="registration" placeholder="Registration" required />
              <Input name="vehicleType" placeholder="Motorbike / van" required />
              <Input name="makeModel" placeholder="Make and model" />
              <label className="text-xs text-gray-500">Insurance expires<Input className="mt-1" name="insuranceExpires" type="date" /></label>
              <label className="text-xs text-gray-500">Service due<Input className="mt-1" name="serviceDue" type="date" /></label>
              <Button type="submit">Add vehicle</Button>
            </form>
          </ComponentCard>
          <BasicTableOne
            title="Fleet management"
            description="Vehicles, assigned drivers, and compliance dates."
            columns={["Registration", "Vehicle", "Driver", "Status", "Insurance", "Service due"]}
            empty="No fleet vehicles recorded."
            pagination={false}
            footer={<AdminPagination page={fleetPage} pageCount={fleetPageCount} total={fleetTotal} pageSize={fleetPageSize} pageParam="fleetPage" />}
            rows={fleet.map((vehicle) => [
              <span key="registration" className="font-medium text-gray-800">{vehicle.registration}</span>,
              [vehicle.vehicleType, vehicle.makeModel].filter(Boolean).join(" · "),
              vehicle.rider ?? "Unassigned",
              <Badge key="status" size="sm" color={vehicle.status === "AVAILABLE" ? "success" : vehicle.status === "MAINTENANCE" ? "warning" : "light"}>{vehicle.status}</Badge>,
              vehicle.insuranceExpiresAt ? dateOnly.format(new Date(vehicle.insuranceExpiresAt)) : "—",
              vehicle.serviceDueAt ? dateOnly.format(new Date(vehicle.serviceDueAt)) : "—",
            ])}
          />
        </div>
      ) : null}
      {onboarding ? (
        <OnboardDriverDialog onClose={() => setOnboarding(false)} />
      ) : null}
      {activityDriver ? (
        <DriverActivityDialog
          driver={activityDriver}
          deliveries={deliveries.filter(
            (delivery) => delivery.riderId === activityDriver.id,
          )}
          onClose={() => setActivityDriver(null)}
        />
      ) : null}
      {selectedPendingPayment ? (
        <RecordDriverPayoutDialog
          payment={selectedPendingPayment}
          onClose={() => setSelectedPendingPayment(null)}
        />
      ) : null}
    </div>
  );
}

function DriverOverview({
  drivers,
  activeDrivers,
  delivered,
  totalEarned,
  payoutBalance,
  onViewDriver,
}: {
  drivers: Driver[];
  activeDrivers: number;
  delivered: number;
  totalEarned: number;
  payoutBalance: number;
  onViewDriver: (driver: Driver) => void;
}) {
  const ranked = [...drivers]
    .sort((left, right) => right.delivered - left.delivered)
    .slice(0, 5);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Users01Icon className="size-5" />}
          label="Active drivers"
          value={String(activeDrivers)}
          note={`${drivers.length} onboarded`}
          tone="bg-brand-50 text-brand-600"
        />
        <Metric
          icon={<Truck01Icon className="size-5" />}
          label="Completed deliveries"
          value={String(delivered)}
          note="All recorded assignments"
          tone="bg-success-50 text-success-600"
        />
        <Metric
          icon={<Wallet01Icon className="size-5" />}
          label="Driver earnings"
          value={money.format(totalEarned)}
          note="Completed delivery earnings"
          tone="bg-warning-50 text-warning-600"
        />
        <Metric
          icon={<Wallet01Icon className="size-5" />}
          label="Driver payout balance"
          value={money.format(payoutBalance)}
          note="Delivered but unpaid"
          tone="bg-error-50 text-error-600"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-gray-800">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                Driver ranking
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Ranked by completed deliveries.
              </p>
            </div>
            <span className="text-sm font-semibold text-gray-500">
              Top {ranked.length}
            </span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {ranked.map((driver, index) => {
              const rate = deliveryRate(driver);
              return (
                <button
                  type="button"
                  key={driver.id}
                  onClick={() => onViewDriver(driver)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-gray-800 dark:text-white">
                      {driver.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {driver.delivered} of {driver.assignments} delivered ·{" "}
                      {driver.cancelled} cancelled
                    </span>
                  </span>
                  <span className="w-30">
                    <span className="mb-1 block text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {rate}%
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                      <span
                        className="block h-full rounded-full bg-brand-500"
                        style={{ width: `${rate}%` }}
                      />
                    </span>
                  </span>
                </button>
              );
            })}
            {!ranked.length ? (
              <p className="p-10 text-center text-sm text-gray-500">
                No driver delivery data yet.
              </p>
            ) : null}
          </div>
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            Performance signals
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            A quick view of delivery reliability from assignment outcomes.
          </p>
          <div className="mt-5 space-y-4">
            {ranked.slice(0, 4).map((driver) => {
              const signal = behaviour(driver);
              return (
                <div
                  key={driver.id}
                  className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-gray-800 dark:text-white">
                      {driver.name}
                    </span>
                    <span className={`text-xs font-semibold ${signal.tone}`}>
                      {signal.label}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <span className="text-gray-500">
                      Delivery rate{" "}
                      <strong className="ml-1 text-gray-800 dark:text-white">
                        {deliveryRate(driver)}%
                      </strong>
                    </span>
                    <span className="text-gray-500">
                      Cancelled{" "}
                      <strong className="ml-1 text-gray-800 dark:text-white">
                        {cancellationRate(driver)}%
                      </strong>
                    </span>
                  </div>
                </div>
              );
            })}
            {!ranked.length ? (
              <p className="py-10 text-center text-sm text-gray-500">
                Signals will appear after deliveries are assigned.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <span className={`grid size-10 place-items-center rounded-lg ${tone}`}>
        {icon}
      </span>
      <p className="mt-4 text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-gray-800 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500">{note}</p>
    </section>
  );
}

function DriverRow({
  driver,
  rank,
  openUp,
  pending,
  onCopy,
  onView,
  onStatus,
}: {
  driver: Driver;
  rank: number;
  openUp: boolean;
  pending: boolean;
  onCopy: (phone: string) => void;
  onView: () => void;
  onStatus: (enabled: boolean) => void;
}) {
  const balance = Math.max(0, driver.earned - driver.paid);
  const visibleStatus =
    driver.userStatus !== "ACTIVE" ? "OFFBOARDED" : driver.availability;
  return (
    <tr className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {rank}
          </span>
          <span>
            <span className="block font-semibold text-gray-800 dark:text-white">
              {driver.name}
            </span>
            <span
              className={`mt-0.5 block text-xs font-medium ${behaviour(driver).tone}`}
            >
              {behaviour(driver).label}
            </span>
          </span>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-600 dark:text-gray-300">
            {driver.phone || "—"}
          </span>
          {driver.phone ? (
            <button
              type="button"
              onClick={() => onCopy(driver.phone)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-white/5"
              aria-label={`Copy ${driver.name}'s phone number`}
            >
              <Copy01Icon className="size-3.5" />
            </button>
          ) : null}
        </div>
      </td>
      <td className="px-5 py-4 text-gray-500">{driver.vehicle || "—"}</td>
      <td className="px-5 py-4 text-right">{driver.assignments}</td>
      <td className="px-5 py-4 text-right font-medium text-gray-800 dark:text-white">
        {driver.delivered}
      </td>
      <td className="px-5 py-4">
        <span className="font-semibold text-gray-800 dark:text-white">
          {deliveryRate(driver)}%
        </span>
        <span className="ml-2 text-xs text-gray-500">
          {driver.cancelled} cancelled
        </span>
      </td>
      <td className="px-5 py-4 text-right">{money.format(driver.earned)}</td>
      <td className="px-5 py-4 text-right">{money.format(driver.paid)}</td>
      <td className="px-5 py-4 text-right font-semibold text-gray-800 dark:text-white">
        {money.format(balance)}
      </td>
      <td className="px-5 py-4">
        <Badge color={statusColor(visibleStatus)} size="sm">
          {visibleStatus}
        </Badge>
      </td>
      <td className="px-5 py-4 text-right">
        <details className="relative inline-block text-left">
          <summary className="inline-flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5 [&::-webkit-details-marker]:hidden">
            <DotsVerticalIcon className="size-4" />
          </summary>
          <div
            className={`absolute right-0 z-30 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-theme-md dark:border-gray-700 dark:bg-gray-900 ${openUp ? "bottom-full mb-1" : "mt-1"}`}
          >
            <button
              type="button"
              onClick={onView}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
            >
              <ChartBreakoutSquareIcon className="size-4" />
              View activity
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onStatus(driver.userStatus !== "ACTIVE")}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-error-600 hover:bg-error-50 disabled:opacity-50"
            >
              {driver.userStatus === "ACTIVE"
                ? "Offboard driver"
                : "Reactivate driver"}
            </button>
          </div>
        </details>
      </td>
    </tr>
  );
}

function DriverPayments({
  payouts,
  payoutSummary,
  pendingPayments,
  search,
  total,
  page,
  pageCount,
  onSearch,
  onPageChange,
  onPayDriver,
}: {
  payouts: DriverPayout[];
  payoutSummary: PayoutSummary;
  pendingPayments: PendingPayment[];
  search: string;
  total: number;
  page: number;
  pageCount: number;
  onSearch: (value: string) => void;
  onPageChange: (page: number) => void;
  onPayDriver: (payment: PendingPayment) => void;
}) {
  const [queuePage, setQueuePage] = useState(1);
  const queuePageCount = Math.max(
    1,
    Math.ceil(pendingPayments.length / pageSize),
  );
  const currentQueuePage = Math.min(queuePage, queuePageCount);
  const pagedPendingPayments = pendingPayments.slice(
    (currentQueuePage - 1) * pageSize,
    currentQueuePage * pageSize,
  );

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PaymentMetric
            label="Total driver earnings"
            value={money.format(payoutSummary.earned)}
          />
          <PaymentMetric
            label="Paid to drivers"
            value={money.format(payoutSummary.paid)}
            tone="text-success-600"
          />
          <PaymentMetric
            label="Pending payments"
            value={money.format(payoutSummary.pending)}
            tone="text-warning-600"
          />
          <PaymentMetric
            label="This week"
            value={money.format(payoutSummary.currentWeekDue)}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">
            Pending payments
          </h2>
          <Badge color="warning" size="sm">
            {pendingPayments.length} pending
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/70 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.02]">
              <tr>
                <th className="px-5 py-3">Driver</th>
                <th className="px-5 py-3">Week</th>
                <th className="px-5 py-3">Orders</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {pagedPendingPayments.map((payment) => (
                <tr
                  key={`${payment.riderId}-${payment.periodStart}`}
                  className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-4 font-semibold text-gray-800 dark:text-white">
                    {payment.riderName}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-gray-600 dark:text-gray-300">
                    {formatDateOnly(payment.periodStart)} –{" "}
                    {formatDateOnly(payment.periodEnd)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex max-w-72 flex-wrap gap-1.5">
                      {payment.orders.slice(0, 2).map((order) => (
                        <span
                          key={order.orderNumber}
                          className="font-mono rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                        >
                          {order.orderNumber}
                        </span>
                      ))}
                      {payment.orders.length > 2 ? (
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06]">
                          +{payment.orders.length - 2}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onPayDriver(payment)}
                      className="mt-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      View {payment.deliveryCount} order
                      {payment.deliveryCount === 1 ? "" : "s"}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-gray-800 dark:text-white">
                    {money.format(payment.amount)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => onPayDriver(payment)}
                      className="inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white transition hover:bg-brand-600"
                    >
                      {payment.canPay ? "Pay driver" : "View orders"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!pendingPayments.length ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            No pending payments.
          </p>
        ) : null}
        <LocalPagination
          page={currentQueuePage}
          pageCount={queuePageCount}
          total={pendingPayments.length}
          onPageChange={setQueuePage}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">
            Payment history
          </h2>
          <label className="relative block w-full sm:w-60">
            <SearchLgIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search driver or reference"
              className="h-10 w-full rounded-lg border border-gray-300 py-2 pr-3 pl-10 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/70 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.02]">
              <tr>
                <th className="px-5 py-3">Driver</th>
                <th className="px-5 py-3">Week</th>
                <th className="px-5 py-3 text-right">Orders</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {payouts.map((payout) => (
                <tr
                  key={payout.id}
                  className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-4">
                    <span className="block font-semibold text-gray-800 dark:text-white">
                      {payout.riderName}
                    </span>
                    <span className="font-mono mt-0.5 block text-xs text-gray-500">
                      {payout.reference}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {formatDateOnly(payout.periodStart)} –{" "}
                    {formatDateOnly(payout.periodEnd)}
                  </td>
                  <td className="px-5 py-4 text-right text-gray-600 dark:text-gray-300">
                    {payout.deliveryCount}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-gray-800 dark:text-white">
                    {money.format(payout.amount)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col items-start gap-1">
                      <Badge color={statusColor(payout.status)} size="sm">
                        {payout.status}
                      </Badge>
                      <span className="text-xs whitespace-nowrap text-gray-500">
                        {payout.paidAt ? formatDate(payout.paidAt) : "Not paid"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!payouts.length ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            No payments found.
          </p>
        ) : null}
        <LocalPagination
          page={page}
          pageCount={pageCount}
          total={total}
          onPageChange={onPageChange}
        />
      </section>
    </div>
  );
}

function PaymentMetric({
  label,
  value,
  tone = "text-gray-800 dark:text-white",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <article className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-white/[0.02]">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold tracking-tight ${tone}`}>
        {value}
      </p>
    </article>
  );
}

function RecordDriverPayoutDialog({
  payment,
  onClose,
}: {
  payment: PendingPayment;
  onClose: () => void;
}) {
  const { showToast } = useAdminToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [orderQuery, setOrderQuery] = useState("");
  const filteredOrders = useMemo(() => {
    const query = orderQuery.trim().toLowerCase();
    if (!query) return payment.orders;
    return payment.orders.filter((order) =>
      [order.orderNumber, order.customerName]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [orderQuery, payment.orders]);
  const submit = (form: HTMLFormElement) =>
    startTransition(async () => {
      try {
        const result = await recordDriverPayout(new FormData(form));
        router.refresh();
        showToast({
          title: "Payment recorded",
          description: `${result.count} orders paid for ${money.format(result.amount)}.`,
          tone: "success",
        });
        onClose();
      } catch (error) {
        showToast({
          title: "Could not record payout",
          description:
            error instanceof Error
              ? error.message
              : "Review the payout period and try again.",
          tone: "error",
        });
      }
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-driver-payout-title"
      className="fixed inset-0 z-[140] flex items-end bg-gray-950/40 sm:items-center sm:justify-center sm:p-6"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(event.currentTarget);
        }}
        className="w-full max-w-xl rounded-t-2xl bg-white shadow-theme-xl sm:rounded-2xl dark:bg-gray-900"
      >
        <div className="flex items-start justify-between border-b border-gray-100 p-5 dark:border-gray-800">
          <div>
            <h2
              id="record-driver-payout-title"
              className="text-lg font-semibold text-gray-800 dark:text-white"
            >
              {payment.canPay ? "Record payment" : "Pending payment"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {payment.riderName} · {formatDateOnly(payment.periodStart)} –{" "}
              {formatDateOnly(payment.periodEnd)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <XCloseIcon className="size-5" />
          </button>
        </div>
        <input name="riderId" type="hidden" value={payment.riderId} />
        <input
          name="periodStart"
          type="hidden"
          value={payment.periodStart.slice(0, 10)}
        />
        <input
          name="periodEnd"
          type="hidden"
          value={payment.periodEnd.slice(0, 10)}
        />
        <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto]">
          <div className="rounded-lg bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
            <p className="text-xs font-medium text-gray-500">Orders</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white">
              {payment.deliveryCount}
            </p>
          </div>
          <div className="rounded-lg bg-brand-50 px-4 py-3 text-right dark:bg-brand-500/10">
            <p className="text-xs font-medium text-brand-600">Amount to pay</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white">
              {money.format(payment.amount)}
            </p>
          </div>
        </div>
        <div className="mx-5 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <label className="relative block border-b border-gray-100 p-3 dark:border-gray-800">
            <SearchLgIcon className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-gray-400" />
            <input
              value={orderQuery}
              onChange={(event) => setOrderQuery(event.target.value)}
              placeholder="Filter order or customer"
              className="h-9 w-full rounded-md border border-gray-200 py-2 pr-3 pl-9 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Delivered</th>
                  <th className="px-4 py-3 text-right">Earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredOrders.map((order) => (
                  <tr key={order.orderNumber}>
                    <td className="px-4 py-3">
                      <span className="block font-semibold text-gray-800 dark:text-white">
                        {order.orderNumber}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {order.customerName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(order.deliveredAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-white">
                      {money.format(order.payout)}
                    </td>
                  </tr>
                ))}
                {!filteredOrders.length ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-sm text-gray-500"
                    >
                      No orders match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        {payment.canPay ? (
          <div className="mx-5 mt-4">
            <Field label="Reference (optional)">
              <input
                name="reference"
                className="field mt-1.5 h-11"
                placeholder="e.g. MPESA-DRIVER-1024"
              />
            </Field>
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 p-5 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-10 px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            {payment.canPay ? "Cancel" : "Close"}
          </button>
          {payment.canPay ? (
            <button
              disabled={pending}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Wallet01Icon className="size-4" />
              {pending ? "Recording…" : "Record payment"}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function DriverActivityDialog({
  driver,
  deliveries,
  onClose,
}: {
  driver: Driver;
  deliveries: Delivery[];
  onClose: () => void;
}) {
  const balance = Math.max(0, driver.earned - driver.paid);
  const signal = behaviour(driver);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="driver-activity-title"
      className="fixed inset-0 z-[140] flex items-end bg-gray-950/40 sm:items-center sm:justify-center sm:p-6"
    >
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-white shadow-theme-xl sm:rounded-2xl dark:bg-gray-900">
        <div className="flex items-start justify-between border-b border-gray-100 p-5 dark:border-gray-800">
          <div>
            <h2
              id="driver-activity-title"
              className="text-lg font-semibold text-gray-800 dark:text-white"
            >
              {driver.name}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {driver.phone || "No phone"} ·{" "}
              {driver.vehicle || "No vehicle recorded"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <XCloseIcon className="size-5" />
          </button>
        </div>
        <div className="p-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <MiniMetric label="Assigned" value={String(driver.assignments)} />
            <MiniMetric label="Delivered" value={String(driver.delivered)} />
            <MiniMetric label="Completion" value={`${deliveryRate(driver)}%`} />
            <MiniMetric label="Balance" value={money.format(balance)} />
          </div>
          <div className="mt-5 rounded-lg bg-gray-50 p-4 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="size-5 text-brand-600" />
              <p className="font-semibold text-gray-800 dark:text-white">
                {signal.label}
              </p>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {driver.cancelled} cancelled or declined assignment
              {driver.cancelled === 1 ? "" : "s"}; cancellation rate is{" "}
              {cancellationRate(driver)}%.
            </p>
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-white">
                  Delivery activity
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Order-level record with assignment and completion dates.
                </p>
              </div>
              <span className="text-sm font-medium text-gray-500">
                {deliveries.length} record{deliveries.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/70 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.02]">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Assigned</th>
                    <th className="px-4 py-3">Delivered</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Payout</th>
                    <th className="px-4 py-3">Payout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {deliveries.slice(0, 20).map((delivery) => (
                    <tr key={delivery.id}>
                      <td className="px-4 py-3 font-semibold text-gray-800 dark:text-white">
                        {delivery.orderNumber}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(delivery.assignedAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {delivery.deliveredAt
                          ? formatDate(delivery.deliveredAt)
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={statusColor(delivery.status)} size="sm">
                          {delivery.status.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-white">
                        {money.format(delivery.payout)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          color={statusColor(delivery.payoutStatus)}
                          size="sm"
                        >
                          {delivery.payoutStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!deliveries.length ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-sm text-gray-500"
                      >
                        No delivery activity recorded for this driver.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function LocalPagination({
  page,
  pageCount,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
      <span>
        Showing {from}–{to} of {total}
      </span>
      {pageCount > 1 ? (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
          >
            Previous
          </button>
          <span className="px-2 text-xs font-medium">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            disabled={page === pageCount}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}

function OnboardDriverDialog({ onClose }: { onClose: () => void }) {
  const { showToast } = useAdminToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const submit = (form: HTMLFormElement) =>
    startTransition(async () => {
      try {
        await createRider(new FormData(form));
        router.refresh();
        showToast({ title: "Driver onboarded", tone: "success" });
        onClose();
      } catch (error) {
        showToast({
          title: "Could not onboard driver",
          description:
            error instanceof Error
              ? error.message
              : "Check the details and try again.",
          tone: "error",
        });
      }
    });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboard-driver-title"
      className="fixed inset-0 z-[140] flex items-end bg-gray-950/40 sm:items-center sm:justify-center sm:p-6"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(event.currentTarget);
        }}
        className="w-full max-w-xl rounded-t-2xl bg-white shadow-theme-xl sm:rounded-2xl dark:bg-gray-900"
      >
        <div className="flex items-start justify-between border-b border-gray-100 p-5 dark:border-gray-800">
          <div>
            <h2
              id="onboard-driver-title"
              className="text-lg font-semibold text-gray-800 dark:text-white"
            >
              Onboard driver
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Create a driver profile and attach their current vehicle details.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <XCloseIcon className="size-5" />
          </button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Driver name">
            <input
              name="name"
              required
              className="field mt-1.5 h-11"
              placeholder="Full name"
            />
          </Field>
          <Field label="Phone number">
            <input
              name="phone"
              required
              className="field mt-1.5 h-11"
              placeholder="07XX XXX XXX"
            />
          </Field>
          <Field label="Vehicle type">
            <input
              name="vehicleType"
              required
              className="field mt-1.5 h-11"
              placeholder="Motorbike"
            />
          </Field>
          <Field label="Registration">
            <input
              name="registration"
              className="field mt-1.5 h-11"
              placeholder="KXX 000X"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 p-5 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-10 px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            disabled={pending}
            className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Onboarding…" : "Onboard driver"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatDate(value: string) {
  return dateTime.format(new Date(value));
}

function formatDateOnly(value: string) {
  return dateOnly.format(new Date(value));
}
