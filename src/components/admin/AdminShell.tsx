"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";

export default function AdminShell({ children, displayName, role }: { children: React.ReactNode; displayName?: string | null; role?: string | null }) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const margin = isMobileOpen ? "ml-0" : isExpanded || isHovered ? "xl:ml-[290px]" : "xl:ml-[90px]";
  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar />
      <Backdrop />
      <div className={`min-w-0 flex-1 transition-all duration-300 ease-in-out ${margin}`}>
        <AppHeader displayName={displayName} role={role} />
        <main className="mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
