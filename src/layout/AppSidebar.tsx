"use client";

import { useSidebar } from "@/context/SidebarContext";
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
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/utils";
import Image from "next/image";
import type { ReactNode } from "react";

type NavItem = {
  label: string;
  path: string;
  icon: ReactNode;
  exact?: boolean;
};

const operations: NavItem[] = [
  { label: "Overview", path: "/admin", icon: <GridIcon />, exact: true },
  { label: "Orders", path: "/admin/orders", icon: <TableIcon /> },
  { label: "Transactions", path: "/admin/transactions", icon: <DollarLineIcon /> },
  { label: "Products", path: "/admin/products", icon: <BoxCubeIcon /> },
  { label: "Inventory", path: "/admin/inventory", icon: <ListIcon /> },
  { label: "Customers", path: "/admin/customers", icon: <GroupIcon /> },
  { label: "Drivers", path: "/admin/riders", icon: <UserCircleIcon /> },
  { label: "Delivery", path: "/admin/delivery", icon: <TaskIcon /> },
];

const growth: NavItem[] = [
  { label: "Finance", path: "/admin/finance", icon: <DollarLineIcon /> },
  { label: "Suppliers", path: "/admin/vendors", icon: <BoxCubeIcon /> },
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
  return (
    <div>
      {expanded ? (
        <p className="mb-4 flex px-3 text-xs leading-5 text-gray-400 uppercase">
          {title}
        </p>
      ) : null}
      <ul className="space-y-1">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.path
            : pathname === item.path || pathname.startsWith(`${item.path}/`);
          return (
            <li key={item.path}>
              <Link
                href={item.path}
                title={!expanded ? item.label : undefined}
                className={cn(
                  "group menu-item",
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
                {expanded ? (
                  <span className="menu-item-text">{item.label}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function AppSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const expanded = isExpanded || isHovered || isMobileOpen;
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
        <Link href="/admin" aria-label="Tipsy Theory operations">
          {expanded ? (
            <span className="flex items-center gap-2.5">
              <Image src="/images/logo/logo-icon.svg" alt="" width={32} height={32} priority />
              <span className="text-xl font-semibold tracking-[-0.03em] text-gray-900 dark:text-white">TipsyAdmin</span>
            </span>
          ) : (
            <Image
              src="/images/logo/logo-icon.svg"
              alt="Tipsy Theory admin"
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
      </div>
    </aside>
  );
}
