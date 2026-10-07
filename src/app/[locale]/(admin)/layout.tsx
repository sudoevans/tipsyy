import AdminShell from "@/components/admin/AdminShell";
import { AdminToastProvider } from "@/components/admin/AdminToast";
import { getAdminFromSession } from "@/server/admin-auth";
import { ADMIN_SESSION_COOKIE } from "@/server/admin-session-cookie";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const user = await getAdminFromSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!user) redirect("/admin/login");
  return <AdminToastProvider><AdminShell displayName={user.display_name ?? user.username} role={user.role}>{children}</AdminShell></AdminToastProvider>;
}
