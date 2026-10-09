"use client";

import { useAdminNotifications } from "@/components/admin/AdminNotificationsProvider";
import { useSidebar } from "@/context/SidebarContext";
import { ChevronDownIcon } from "@/icons";
import { Link, useRouter } from "@/i18n/navigation";
import { AlertTriangleIcon, Bell01Icon, CheckCircleIcon, InfoCircleIcon } from "@untitledui/icons-react/outline";
import Image from "next/image";
import { useState } from "react";

export default function AppHeader({ displayName, role }: { displayName?: string | null; role?: string | null }) {
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const { summary, notifications, total, loading, refresh, loadMore, markRead, markAllRead } = useAdminNotifications();
  const handleToggle = () => window.innerWidth >= 1280 ? toggleSidebar() : toggleMobileSidebar();
  const signOut = async () => {
    setSigningOut(true);
    try { await fetch("/api/v1/admin/auth/logout", { method: "POST" }); router.replace("/admin/login"); router.refresh(); }
    finally { setSigningOut(false); }
  };

  return (
    <header className="sticky top-0 z-99999 flex w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex w-full items-center justify-between px-4 py-3 xl:px-6 xl:py-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 lg:h-11 lg:w-11 dark:border-gray-800 dark:text-gray-400 ${isMobileOpen ? "bg-gray-100 dark:bg-white/3" : ""}`} onClick={handleToggle} aria-label="Toggle sidebar" type="button">
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M.583 1c0-.414.336-.75.75-.75h13.334a.75.75 0 010 1.5H1.333A.75.75 0 01.583 1zm0 10c0-.414.336-.75.75-.75h13.334a.75.75 0 010 1.5H1.333a.75.75 0 01-.75-.75zm.75-5.75a.75.75 0 000 1.5H8a.75.75 0 000-1.5H1.333z" fill="currentColor" /></svg>
          </button>
          <Link href="/admin" className="flex items-center gap-2 xl:hidden"><Image src="/images/logo/logo-icon.svg" alt="" width={28} height={28} /><span className="text-lg font-semibold tracking-[-0.03em] text-gray-900 dark:text-white">TipsyAdmin</span></Link>
          <div className="relative hidden xl:block">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-gray-500"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m14.5 14.5 3 3m-1.75-8.125a6.375 6.375 0 1 1-12.75 0 6.375 6.375 0 0 1 12.75 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span>
            <input aria-label="Search admin" type="search" placeholder="Search or type command..." className="h-11 w-107.5 rounded-lg border border-gray-200 bg-transparent py-2.5 ps-12 pe-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-800 dark:bg-white/3 dark:text-white/90" />
            <span className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/3">⌘K</span>
          </div>
        </div>

        <div className="flex items-center gap-2 2xsm:gap-3">
          <div className="relative">
            <button aria-expanded={notificationsOpen} aria-haspopup="dialog" aria-label="Notifications" className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800" onClick={() => { setNotificationsOpen((open) => !open); void refresh(); }} type="button">
              <Bell01Icon className="size-5" strokeWidth={1.8} />
              {summary.unread > 0 ? <span className="absolute -top-1 -right-1 grid min-w-5 h-5 place-items-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold leading-none text-white dark:border-gray-900">{summary.unread > 99 ? "99+" : summary.unread}</span> : null}
            </button>
            {notificationsOpen ? <div aria-label="Notifications" className="absolute right-0 z-100 mt-3 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark" role="dialog">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <div><p className="text-sm font-semibold text-gray-800 dark:text-white">Notifications</p><p className="mt-0.5 text-xs text-gray-500">{summary.unread ? `${summary.unread} unread` : "You’re all caught up"}</p></div>
                {summary.unread ? <button className="text-xs font-semibold text-brand-600 hover:text-brand-700" onClick={() => void markAllRead()} type="button">Mark all read</button> : null}
              </div>
              <div className="max-h-[26rem] overflow-y-auto">
                {notifications.length ? notifications.map((notification) => {
                  const Icon = notification.severity === "CRITICAL" ? AlertTriangleIcon : notification.severity === "WARNING" ? InfoCircleIcon : CheckCircleIcon;
                  const tone = notification.severity === "CRITICAL" ? "bg-red-50 text-red-600" : notification.severity === "WARNING" ? "bg-warning-50 text-warning-600" : "bg-brand-50 text-brand-600";
                  const item = <><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-4" strokeWidth={2} /></span><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-3"><strong className="text-sm text-gray-800 dark:text-white">{notification.title}</strong><time className="shrink-0 text-[11px] text-gray-400">{new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(notification.created_at))}</time></span><span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{notification.body}</span></span>{!notification.read_at ? <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-500" /> : null}</>;
                  const className = `flex w-full gap-3 border-b border-gray-100 px-4 py-3 text-left transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/5 ${notification.read_at ? "" : "bg-brand-50/40 dark:bg-brand-500/5"}`;
                  return notification.href ? <Link className={className} href={notification.href} key={notification.id} onClick={() => { void markRead(notification.id); setNotificationsOpen(false); }}>{item}</Link> : <button className={className} key={notification.id} onClick={() => void markRead(notification.id)} type="button">{item}</button>;
                }) : <p className="px-4 py-10 text-center text-sm text-gray-500">{loading ? "Loading notifications…" : "No notifications yet."}</p>}
              </div>
              {notifications.length < total ? <button className="w-full border-t border-gray-100 px-4 py-3 text-sm font-semibold text-brand-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-white/5" disabled={loading} onClick={() => void loadMore()} type="button">{loading ? "Loading…" : "Load more"}</button> : null}
            </div> : null}
          </div>
          <div className="relative">
            <button className="flex items-center text-gray-700 dark:text-gray-400" onClick={() => setMenuOpen((open) => !open)} type="button">
              <span className="me-3 h-11 w-11 overflow-hidden rounded-full"><Image width={44} height={44} src="/images/user/owner.png" alt="Admin" /></span>
              <span className="me-1 hidden max-w-36 truncate text-theme-sm font-medium sm:block">{displayName || "Administrator"}</span>
              <ChevronDownIcon className={`hidden size-5 text-gray-500 transition-transform sm:block ${menuOpen ? "rotate-180" : ""}`} />
            </button>
            {menuOpen ? <div className="absolute right-0 mt-4.25 flex w-65 flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"><div className="px-3 py-2"><span className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300">{displayName || "Administrator"}</span><span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">{role === "ADMIN" ? "Administrator" : "Support"}</span></div><button className="mt-3 rounded-lg border border-gray-200 px-3 py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5" disabled={signingOut} onClick={signOut} type="button">{signingOut ? "Signing out…" : "Sign out"}</button></div> : null}
          </div>
        </div>
      </div>
    </header>
  );
}
