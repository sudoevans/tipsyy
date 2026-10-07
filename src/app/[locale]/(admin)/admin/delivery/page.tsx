import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import BasicTableOne from "@/components/tables/BasicTableOne";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { sql } from "@/server/db";
import { createFleetVehicle, saveDeliveryArea } from "../actions";

export const dynamic = "force-dynamic";
const money = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" });

export default async function DeliveryPage() {
  const [areas, assignments, fleet] = await Promise.all([
    sql<{ name:string; secondary_name:string|null; fee_mode:string; fee_minor:number; per_km_minor:number; minimum_fee_minor:number; active:boolean }[]>`SELECT name,secondary_name,fee_mode,fee_minor,per_km_minor,minimum_fee_minor,active FROM delivery_areas ORDER BY sort_order,name`,
    sql<{ order_number:string; rider:string|null; status:string; assigned_at:Date; payout_minor:number }[]>`SELECT o.order_number,u.display_name AS rider,a.status::text,a.assigned_at,a.payout_minor FROM delivery_assignments a JOIN orders o ON o.id=a.order_id JOIN riders r ON r.id=a.rider_id JOIN users u ON u.id=r.user_id ORDER BY a.assigned_at DESC LIMIT 30`,
    sql<{ registration:string; vehicle_type:string; make_model:string|null; rider:string|null; status:string; insurance_expires_at:Date|null; service_due_at:Date|null }[]>`SELECT f.registration,f.vehicle_type,f.make_model,u.display_name AS rider,f.status,f.insurance_expires_at,f.service_due_at FROM fleet_vehicles f LEFT JOIN riders r ON r.id=f.rider_id LEFT JOIN users u ON u.id=r.user_id ORDER BY f.registration`,
  ]);
  return <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-2">
      <ComponentCard title="Add delivery zone" desc="Zones appear as storefront location suggestions. Choose static or per-kilometre fees."><form action={saveDeliveryArea} className="grid gap-4 sm:grid-cols-2"><Input name="name" placeholder="Zone name" required/><Input name="slug" placeholder="zone-slug" required/><Input name="secondaryName" placeholder="County / area"/><select name="feeMode" className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="STATIC">Static fee</option><option value="PER_KM">Per kilometre</option></select><Input name="fee" type="number" min={0} step={1} placeholder="Static fee (KSh)"/><Input name="perKm" type="number" min={0} step={1} placeholder="Per km (KSh)"/><Input name="minimumFee" type="number" min={0} step={1} placeholder="Minimum fee (KSh)"/><Button type="submit">Save zone</Button></form></ComponentCard>
      <ComponentCard title="Add fleet vehicle" desc="Track availability, insurance, and service dates."><form action={createFleetVehicle} className="grid gap-4 sm:grid-cols-2"><Input name="registration" placeholder="Registration" required/><Input name="vehicleType" placeholder="Motorbike / van" required/><Input name="makeModel" placeholder="Make and model"/><label className="text-xs text-gray-500">Insurance expires<Input className="mt-1" name="insuranceExpires" type="date"/></label><label className="text-xs text-gray-500">Service due<Input className="mt-1" name="serviceDue" type="date"/></label><Button type="submit">Add vehicle</Button></form></ComponentCard>
    </div>
    <BasicTableOne title="Delivery zones & fees" description="Customer location suggestions and the pricing rule applied at checkout." columns={["Zone","Area","Fee model","Rate","Minimum","Status"]} empty="Add a delivery zone to serve customers." rows={areas.map(a => [<span key="n" className="font-medium text-gray-800">{a.name}</span>,a.secondary_name??"—",a.fee_mode==="STATIC"?"Static":"Per km",a.fee_mode==="STATIC"?money.format(a.fee_minor):`${money.format(a.per_km_minor)} / km`,money.format(a.minimum_fee_minor),<Badge key="s" size="sm" color={a.active?"success":"light"}>{a.active?"Active":"Inactive"}</Badge>])}/>
    <BasicTableOne title="Delivery assignments" description="Recent order-to-driver assignments and payouts." columns={["Order","Driver","Status","Assigned","Payout"]} empty="Assignments appear when an order is given to a driver." rows={assignments.map(a => [a.order_number,a.rider??"—",a.status.replaceAll("_"," "),date.format(a.assigned_at),money.format(a.payout_minor)])}/>
    <BasicTableOne title="Fleet management" description="Vehicles, assigned drivers, and compliance dates." columns={["Registration","Vehicle","Driver","Status","Insurance","Service due"]} empty="No fleet vehicles recorded." rows={fleet.map(f => [<span key="r" className="font-medium text-gray-800">{f.registration}</span>,[f.vehicle_type,f.make_model].filter(Boolean).join(" · "),f.rider??"Unassigned",<Badge key="s" size="sm" color={f.status==="AVAILABLE"?"success":f.status==="MAINTENANCE"?"warning":"light"}>{f.status}</Badge>,f.insurance_expires_at?date.format(f.insurance_expires_at):"—",f.service_due_at?date.format(f.service_due_at):"—"])}/>
  </div>;
}
