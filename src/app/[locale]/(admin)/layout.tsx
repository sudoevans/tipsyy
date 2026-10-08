import AdminShell from "@/components/admin/AdminShell";
import { AdminNotificationsProvider } from "@/components/admin/AdminNotificationsProvider";
import { AdminToastProvider } from "@/components/admin/AdminToast";
import { getAdminFromSession } from "@/server/admin-auth";
import { getAdminNotificationSummary } from "@/server/admin-notifications";
import { ADMIN_SESSION_COOKIE } from "@/server/admin-session-cookie";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const user = await getAdminFromSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!user) redirect("/admin/login");
  const notificationSummary = await getAdminNotificationSummary(user.id);
  return <AdminToastProvider><AdminNotificationsProvider initialSummary={notificationSummary}><AdminShell displayName={user.display_name ?? user.username} role={user.role}>{children}</AdminShell></AdminNotificationsProvider></AdminToastProvider>;
}
