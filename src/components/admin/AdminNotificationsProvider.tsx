"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AdminNotification = {
  id: string;
  event_type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string;
  href: string | null;
  created_at: string;
  resolved_at: string | null;
  read_at: string | null;
};

export type AdminNotificationSummary = {
  unread: number;
  newOrders: number;
  lowStock: number;
  openInvestigations: number;
};

type NotificationsContextValue = {
  summary: AdminNotificationSummary;
  notifications: AdminNotification[];
  total: number;
  loading: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const emptySummary: AdminNotificationSummary = { unread: 0, newOrders: 0, lowStock: 0, openInvestigations: 0 };

export function AdminNotificationsProvider({
  children,
  initialSummary = emptySummary,
}: {
  children: React.ReactNode;
  initialSummary?: AdminNotificationSummary;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/notifications?page=${nextPage}&pageSize=6`, { cache: "no-store" });
      const payload = await response.json() as { data?: { summary: AdminNotificationSummary; notifications: { items: AdminNotification[]; total: number } } };
      if (!response.ok || !payload.data) return;
      setSummary(payload.data.summary);
      setNotifications((current) => append ? [...current, ...payload.data!.notifications.items.filter((item) => !current.some((existing) => existing.id === item.id))] : payload.data!.notifications.items);
      setTotal(payload.data.notifications.total);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(1, false), [load]);
  const loadMore = useCallback(async () => {
    if (loading || notifications.length >= total) return;
    await load(page + 1, true);
  }, [load, loading, notifications.length, page, total]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((current) => current.map((item) => item.id === id && !item.read_at ? { ...item, read_at: new Date().toISOString() } : item));
    setSummary((current) => ({ ...current, unread: Math.max(0, current.unread - 1), newOrders: Math.max(0, current.newOrders - (notifications.find((item) => item.id === id)?.event_type === "ORDER_READY" ? 1 : 0)) }));
    await fetch("/api/v1/admin/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: id }) });
  }, [notifications]);

  const markAllRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    setSummary((current) => ({ ...current, unread: 0, newOrders: 0 }));
    await fetch("/api/v1/admin/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAll: true }) });
  }, []);

  useEffect(() => {
    void refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 20_000);
    return () => { document.removeEventListener("visibilitychange", onVisibility); window.clearInterval(interval); };
  }, [refresh]);

  const value = useMemo(() => ({ summary, notifications, total, loading, refresh, loadMore, markRead, markAllRead }), [summary, notifications, total, loading, refresh, loadMore, markRead, markAllRead]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useAdminNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("useAdminNotifications must be used inside AdminNotificationsProvider.");
  return value;
}
