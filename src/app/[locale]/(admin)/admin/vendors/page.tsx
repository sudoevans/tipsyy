import { redirect } from "next/navigation";

export default function LegacySuppliersPage(): never {
  redirect("/admin/inventory");
}
