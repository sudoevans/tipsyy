import SignInForm from "@/components/auth/SignInForm";
import { getAdminFromSession } from "@/server/admin-auth";
import { ADMIN_SESSION_COOKIE } from "@/server/admin-session-cookie";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Admin sign in | Tipsy Theory", description: "Restricted Tipsy Theory operations access." };

export default async function AdminLoginPage() {
  const cookieStore = await cookies();
  const admin = await getAdminFromSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (admin) redirect("/admin");
  return <main className="flex min-h-dvh bg-white dark:bg-gray-900"><SignInForm /></main>;
}
