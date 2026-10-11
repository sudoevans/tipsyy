"use client";

import { useSidebar } from "@/context/SidebarContext";
import { useAdminNotifications } from "@/components/admin/AdminNotificationsProvider";
import { useEffect, useState } from "react";
import {
  BoltIcon,
  BoxCubeIcon,
  DocsIcon,
  DollarLineIcon,
  GridIcon,
  GroupIcon,
  ListIcon,
  PageIcon,
  PieChartIcon,
  TableIcon,
  TaskIcon,
  UserCircleIcon,
} from "@/icons";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/utils";
import Image from "next/image";
import type { ReactNode } from "react";

type NavItem = {
  label: string;
  path: string;
  icon: ReactNode;
  exact?: boolean;
  badge?: "inventory" | "transactions";
};

const operations: NavItem[] = [
  { label: "Overview", path: "/admin", icon: <GridIcon />, exact: true },
  { label: "Orders", path: "/admin/orders", icon: <TableIcon /> },
  {
    label: "Transactions",
    path: "/admin/transactions",
    icon: <DollarLineIcon />,
    badge: "transactions",
  },
  { label: "Products", path: "/admin/products", icon: <BoxCubeIcon /> },
  { label: "Inventory", path: "/admin/inventory", icon: <ListIcon />, badge: "inventory" },
  { label: "Customers", path: "/admin/customers", icon: <GroupIcon /> },
  { label: "Drivers", path: "/admin/riders", icon: <UserCircleIcon /> },
  { label: "Delivery settings", path: "/admin/delivery", icon: <TaskIcon /> },
];

const growth: NavItem[] = [
  { label: "Finance", path: "/admin/finance", icon: <DollarLineIcon /> },
  { label: "Promotions", path: "/admin/promotions", icon: <PageIcon /> },
  { label: "Store content", path: "/admin/content", icon: <PageIcon /> },
  { label: "Reports", path: "/admin/reports", icon: <PieChartIcon /> },
  { label: "Staff & roles", path: "/admin/staff", icon: <GroupIcon /> },
  { label: "Audit trail", path: "/admin/audit", icon: <DocsIcon /> },
  { label: "Settings", path: "/admin/settings", icon: <BoltIcon /> },
];

function NavigationGroup({
  title,
  items,
  expanded,
}: {
  title: string;
  items: NavItem[];
  expanded: boolean;
}) {
  const pathname = usePathname();
  const { summary } = useAdminNotifications();
  return (
    <div>
      {expanded ? (
        <p className="mb-4 flex px-3 text-xs leading-5 text-gray-400 uppercase">
          {title}
        </p>
      ) : null}
      <ul className="space-y-1">
        {items.map((item) => {
          const badgeCount = item.badge === "inventory" ? summary.lowStock : item.badge === "transactions" ? summary.openInvestigations : 0;
          const active = item.exact
            ? pathname === item.path
            : pathname === item.path || pathname.startsWith(`${item.path}/`);
          return (
            <li key={item.path}>
              <Link
                href={item.path}
                title={!expanded ? item.label : undefined}
                className={cn(
                  "group relative menu-item",
                  expanded ? "justify-start" : "xl:justify-center",
                  active ? "menu-item-active" : "menu-item-inactive",
                )}
              >
                <span
                  className={
                    active ? "menu-item-icon-active" : "menu-item-icon-inactive"
                  }
                >
                  {item.icon}
                </span>
                {expanded ? <span className="menu-item-text">{item.label}</span> : null}
                {badgeCount > 0 ? <span className={`rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white ${expanded ? "ml-auto" : "absolute top-1 right-1"}`}>{badgeCount > 99 ? "99+" : badgeCount}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function AppSidebar({ displayName, role }: { displayName?: string | null; role?: string | null }) {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const { markCategoryRead } = useAdminNotifications();
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const expanded = isExpanded || isHovered || isMobileOpen;
  useEffect(() => {
    if (pathname === "/admin/inventory" || pathname.startsWith("/admin/inventory/")) void markCategoryRead("inventory").catch(() => undefined);
    else if (pathname === "/admin/transactions" || pathname.startsWith("/admin/transactions/")) void markCategoryRead("transactions").catch(() => undefined);
  }, [pathname, markCategoryRead]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/v1/admin/auth/logout", { method: "POST" });
      router.replace("/admin/login");
      router.refresh();
    } finally {
      setSigningOut(false);
      setProfileOpen(false);
    }
  };
  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-50 flex h-full flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out rtl:right-0 rtl:left-auto rtl:border-r-0 rtl:border-l dark:border-gray-800 dark:bg-gray-900",
        expanded ? "w-72.5" : "w-22.5",
        isMobileOpen
          ? "translate-x-0"
          : "-translate-x-full rtl:translate-x-full",
        "xl:translate-x-0 xl:rtl:translate-x-0",
      )}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "flex py-8",
          expanded ? "justify-start" : "xl:justify-center",
        )}
      >
        <Link href="/admin" aria-label="Tipsy Theoryy operations">
          {expanded ? (
            <span className="flex items-center gap-2.5">
              <Image
                src="/images/logo/tipsyy-icon.svg"
                alt=""
                width={32}
                height={32}
                priority
              />
              <span className="text-xl font-semibold tracking-[-0.03em] text-gray-900 dark:text-white">
                TipsyAdmin
              </span>
            </span>
          ) : (
            <Image
              src="/images/logo/tipsyy-icon.svg"
              alt="Tipsy Theoryy admin"
              width={32}
              height={32}
              priority
            />
          )}
        </Link>
      </div>
      <nav className="no-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto pb-4">
        <NavigationGroup title="Menu" items={operations} expanded={expanded} />
        <NavigationGroup
          title="Management"
          items={growth}
          expanded={expanded}
        />
      </nav>
      <div className="border-t border-gray-100 py-4 dark:border-gray-800">
        <Link
          href="/"
          className={cn(
            "group menu-item menu-item-inactive",
            expanded ? "justify-start" : "xl:justify-center",
          )}
          title={!expanded ? "View storefront" : undefined}
        >
          <PageIcon />
          {expanded ? <span>View storefront</span> : null}
        </Link>
        <div className="relative mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
          {profileOpen ? <div className="absolute bottom-full left-0 z-20 mb-2 w-60 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
            <div className="px-3 py-2"><p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{displayName || "Administrator"}</p><p className="text-xs text-gray-500">{role === "ADMIN" ? "Administrator" : "Support"}</p></div>
            <Link className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5" href="/admin/settings" onClick={() => setProfileOpen(false)}>Settings</Link>
            <button className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10" disabled={signingOut} onClick={() => void signOut()} type="button">{signingOut ? "Signing out…" : "Sign out"}</button>
          </div> : null}
          <button aria-expanded={profileOpen} className={cn("flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-gray-50 dark:hover:bg-white/5", expanded ? "justify-start" : "xl:justify-center")} onClick={() => setProfileOpen((open) => !open)} type="button">
            <Image alt="" className="size-9 rounded-full object-cover" height={36} src="/images/user/owner.png" width={36} />
            {expanded ? <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-gray-800 dark:text-white">{displayName || "Administrator"}</span><span className="block text-xs text-gray-500">{role === "ADMIN" ? "Administrator" : "Support"}</span></span> : null}
          </button>
        </div>
      </div>
    </aside>
  );
}
