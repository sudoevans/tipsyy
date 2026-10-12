"use client";

import { useAdminNotifications } from "@/components/admin/AdminNotificationsProvider";
import { useSidebar } from "@/context/SidebarContext";
import { Link, useRouter } from "@/i18n/navigation";
import { AlertTriangleIcon, Bell01Icon, CheckCircleIcon, InfoCircleIcon, XCloseIcon } from "@untitledui/icons-react/outline";
import { Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useAdminToast } from "@/components/admin/AdminToast";

export default function AppHeader() {
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationPosition, setNotificationPosition] = useState({ top: 0, left: 12, width: 360 });
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { showToast } = useAdminToast();
  const { summary, notifications, total, loading, saving, refresh, loadMore, markRead, markAllRead, soundEnabled, setSoundEnabled } = useAdminNotifications();
  const handleToggle = () => window.innerWidth >= 1280 ? toggleSidebar() : toggleMobileSidebar();

  useEffect(() => {
    if (!notificationsOpen) return;
    const placePanel = () => {
      const rect = notificationButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(368, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      setNotificationPosition({ top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 160)), left, width });
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!notificationPanelRef.current?.contains(target) && !notificationButtonRef.current?.contains(target)) setNotificationsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setNotificationsOpen(false); };
    placePanel();
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
    };
  }, [notificationsOpen]);

  const handleMarkRead = async (id: string) => {
    try { await markRead(id); return true; }
    catch { showToast({ title: "Could not mark notification as read", description: "Please try again.", tone: "error" }); return false; }
  };

  const handleMarkAllRead = async () => {
    try { await markAllRead(); }
    catch { showToast({ title: "Could not mark notifications as read", description: "Please try again.", tone: "error" }); }
  };

  return (
    <header className="sticky top-0 z-99999 flex w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex w-full items-center justify-between px-4 py-3 xl:px-6 xl:py-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 lg:h-11 lg:w-11 dark:border-gray-800 dark:text-gray-400 ${isMobileOpen ? "bg-gray-100 dark:bg-white/3" : ""}`} onClick={handleToggle} aria-label="Toggle sidebar" type="button">
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M.583 1c0-.414.336-.75.75-.75h13.334a.75.75 0 010 1.5H1.333A.75.75 0 01.583 1zm0 10c0-.414.336-.75.75-.75h13.334a.75.75 0 010 1.5H1.333a.75.75 0 01-.75-.75zm.75-5.75a.75.75 0 000 1.5H8a.75.75 0 000-1.5H1.333z" fill="currentColor" /></svg>
          </button>
          <Link href="/admin" className="flex items-center gap-2 xl:hidden"><Image src="/images/logo/admin-logo.svg" alt="" width={28} height={28} /><span className="text-lg font-semibold tracking-[-0.03em] text-gray-900 dark:text-white">TipsyAdmin</span></Link>
          <div className="relative hidden xl:block">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-gray-500"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m14.5 14.5 3 3m-1.75-8.125a6.375 6.375 0 1 1-12.75 0 6.375 6.375 0 0 1 12.75 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span>
            <input aria-label="Search admin" type="search" placeholder="Search or type command..." className="h-11 w-107.5 rounded-lg border border-gray-200 bg-transparent py-2.5 ps-12 pe-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-800 dark:bg-white/3 dark:text-white/90" />
            <span className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/3">⌘K</span>
          </div>
        </div>

        <div className="flex items-center gap-2 2xsm:gap-3">
          <div className="relative">
            <button ref={notificationButtonRef} aria-expanded={notificationsOpen} aria-haspopup="dialog" aria-label="Notifications" className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800" onClick={() => { setNotificationsOpen((open) => !open); void refresh(); }} type="button">
              <Bell01Icon className="size-5" strokeWidth={1.8} />
              {summary.unread > 0 ? <span className="absolute -top-1 -right-1 grid min-w-5 h-5 place-items-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold leading-none text-white dark:border-gray-900">{summary.unread > 99 ? "99+" : summary.unread}</span> : null}
            </button>
            {notificationsOpen && typeof document !== "undefined" ? createPortal(<div ref={notificationPanelRef} aria-label="Notifications" className="fixed z-[100000] flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 shadow-lg sm:p-4" role="dialog" style={{ top: notificationPosition.top, left: notificationPosition.left, width: notificationPosition.width, maxHeight: `min(32rem, calc(100dvh - ${notificationPosition.top + 12}px))` }}>
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <div className="min-w-0"><p className="text-lg font-semibold text-gray-800">Notification</p></div>
                <div className="flex shrink-0 items-center gap-3">
                  <button aria-label={soundEnabled ? "Mute new-order sound" : "Enable new-order sound"} aria-pressed={soundEnabled} className="grid size-8 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5" onClick={() => setSoundEnabled(!soundEnabled)} title={soundEnabled ? "Mute new-order sound" : "Enable new-order sound"} type="button">{soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}</button>
                  {summary.unread || saving ? <button disabled={saving} className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50" onClick={() => void handleMarkAllRead()} type="button">{saving ? "Saving…" : "Mark all read"}</button> : null}
                  <button aria-label="Close notifications" className="grid size-8 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5" onClick={() => setNotificationsOpen(false)} type="button"><XCloseIcon className="size-4" /></button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {notifications.length ? notifications.map((notification) => {
                  const Icon = notification.severity === "CRITICAL" ? AlertTriangleIcon : notification.severity === "WARNING" ? InfoCircleIcon : CheckCircleIcon;
                  const tone = notification.severity === "CRITICAL" ? "bg-red-50 text-red-600" : notification.severity === "WARNING" ? "bg-warning-50 text-warning-600" : "bg-brand-50 text-brand-600";
                  const content = <><span className={`relative mt-0.5 grid size-10 shrink-0 place-items-center rounded-full ${tone}`}><Icon className="size-5" strokeWidth={1.8} />{!notification.read_at ? <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-white bg-brand-500" aria-label="Unread" /> : null}</span><span className="min-w-0 flex-1"><strong className="block text-sm font-semibold text-gray-800">{notification.title}</strong><span className="mt-0.5 block text-sm leading-5 text-gray-600">{notification.body}</span><time dateTime={notification.created_at} className="mt-1.5 block text-xs text-gray-400">{new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(notification.created_at))}</time></span></>;
                  const className = `flex w-full gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-[#f2f4f7] ${notification.read_at ? "" : "bg-gray-50"}`;
                  const openNotification = async (event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
                    if (notification.href) event.preventDefault();
                    if (!notification.read_at && !(await handleMarkRead(notification.id))) return;
                    if (notification.href) { setNotificationsOpen(false); router.push(notification.href); }
                  };
                  return <div className="my-1 rounded-lg" key={notification.id}>
                    {notification.href ? <Link className={className} href={notification.href} onClick={(event) => { void openNotification(event); }}>{content}</Link> : <button className={className} onClick={(event) => { void openNotification(event); }} type="button">{content}</button>}
                    {!notification.read_at ? <div className="-mt-2 flex justify-end px-4 pb-2"><button disabled={saving} className="rounded-md px-2 py-1 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50" onClick={() => void handleMarkRead(notification.id)} type="button">Mark as read</button></div> : null}
                  </div>;
                }) : <p className="px-4 py-10 text-center text-sm text-gray-500">{loading ? "Loading notifications…" : "No notifications yet."}</p>}
              </div>
              {notifications.length < total ? <button className="mt-3 w-full shrink-0 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 disabled:opacity-50" disabled={loading || saving} onClick={() => void loadMore()} type="button">{loading ? "Loading…" : "View more notifications"}</button> : null}
            </div>, document.body) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
