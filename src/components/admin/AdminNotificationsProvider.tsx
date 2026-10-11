"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

export type AdminNotification = {
  id: string;
  event_type: string;
  entity_type: string;
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
  saving: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markCategoryRead: (category: "inventory" | "transactions") => Promise<void>;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const emptySummary: AdminNotificationSummary = { unread: 0, newOrders: 0, lowStock: 0, openInvestigations: 0 };
const SOUND_SETTING_EVENT = "tipsy-admin-order-sound-change";

function subscribeToSoundSetting(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SOUND_SETTING_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SOUND_SETTING_EVENT, onChange);
  };
}

function readSoundSetting() {
  return window.localStorage.getItem("tipsy-admin-order-sound") !== "off";
}

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
  const soundEnabled = useSyncExternalStore(subscribeToSoundSetting, readSoundSetting, () => true);
  const knownNotificationIds = useRef(new Set<string>());
  const hasLoadedNotifications = useRef(false);
  const soundEnabledRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const revision = useRef(0);
  const pendingMutations = useRef(new Map<string, Promise<void>>());
  const [saving, setSaving] = useState(false);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    soundEnabledRef.current = enabled;
    window.localStorage.setItem("tipsy-admin-order-sound", enabled ? "on" : "off");
    window.dispatchEvent(new Event(SOUND_SETTING_EVENT));
    if (enabled) {
      const AudioContextConstructor = window.AudioContext;
      if (!audioContextRef.current && AudioContextConstructor) audioContextRef.current = new AudioContextConstructor();
      if (audioContextRef.current?.state === "suspended") void audioContextRef.current.resume();
    }
  }, []);

  const playOrderSound = useCallback(() => {
    const context = audioContextRef.current;
    if (!soundEnabledRef.current || !context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(1174.66, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.33);
  }, []);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    if (pendingMutations.current.size) return;
    const version = ++revision.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/notifications?page=${nextPage}&pageSize=6`, { cache: "no-store" });
      const payload = await response.json() as { data?: { summary: AdminNotificationSummary; notifications: { items: AdminNotification[]; total: number } } };
      if (!response.ok || !payload.data || version !== revision.current) return;
      const nextItems = payload.data.notifications.items;
      if (hasLoadedNotifications.current && nextItems.some((item) => item.event_type === "ORDER_READY" && !knownNotificationIds.current.has(item.id))) playOrderSound();
      for (const item of nextItems) knownNotificationIds.current.add(item.id);
      hasLoadedNotifications.current = true;
      setSummary(payload.data.summary);
      setNotifications((current) => append ? [...current, ...nextItems.filter((item) => !current.some((existing) => existing.id === item.id))] : nextItems);
      setTotal(payload.data.notifications.total);
      setPage(nextPage);
    } catch {
      // Keep the last known state when a background refresh is unavailable.
    } finally {
      if (version === revision.current) setLoading(false);
    }
  }, [playOrderSound]);

  const refresh = useCallback(() => load(1, false), [load]);
  const persistRead = useCallback((key: string, body: object) => {
    const pending = pendingMutations.current.get(key);
    if (pending) return pending;
    ++revision.current;
    setLoading(false);
    setSaving(true);
    const operation = (async () => {
      try {
        const response = await fetch("/api/v1/admin/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const payload = await response.json() as { data?: { read?: boolean; summary?: AdminNotificationSummary } };
        if (!response.ok || !payload.data?.read) throw new Error("Could not mark notifications as read.");
        if (payload.data.summary && pendingMutations.current.size === 1) setSummary(payload.data.summary);
      } finally {
        pendingMutations.current.delete(key);
        if (!pendingMutations.current.size) { setSaving(false); await refresh(); }
      }
    })();
    pendingMutations.current.set(key, operation);
    return operation;
  }, [refresh]);
  const loadMore = useCallback(async () => {
    if (loading || notifications.length >= total) return;
    await load(page + 1, true);
  }, [load, loading, notifications.length, page, total]);

  const markRead = useCallback(async (id: string) => {
    if (pendingMutations.current.has(id)) return pendingMutations.current.get(id);
    const notification = notifications.find((item) => item.id === id);
    if (!notification || notification.read_at) return;
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    setSummary((current) => ({ ...current, unread: Math.max(0, current.unread - 1), newOrders: Math.max(0, current.newOrders - (notification.event_type === "ORDER_READY" ? 1 : 0)) }));
    try {
      await persistRead(id, { notificationId: id });
    } catch (error) {
      await refresh();
      throw error;
    }
  }, [notifications, refresh, persistRead]);

  const markAllRead = useCallback(async () => {
    if (pendingMutations.current.size) return;
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    setSummary(emptySummary);
    try {
      await persistRead("all", { markAll: true });
    } catch (error) {
      await refresh();
      throw error;
    }
  }, [refresh, persistRead]);

  const markCategoryRead = useCallback(async (category: "inventory" | "transactions") => {
    const relevant = (item: AdminNotification) => category === "inventory"
      ? item.entity_type === "inventory_variant"
      : item.event_type.startsWith("MPESA_") || item.event_type.startsWith("PAYMENT_") || item.event_type.startsWith("UNMATCHED_MPESA") || ["DUPLICATE_MPESA_RECEIPT", "STK_RECEIPT_AFTER_QUERY_MISMATCH", "PULLED_MPESA_RECEIPT_REVIEW"].includes(item.event_type);
    setNotifications((current) => current.map((item) => relevant(item) ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item));
    setSummary((current) => category === "inventory"
      ? { ...current, unread: Math.max(0, current.unread - current.lowStock), lowStock: 0 }
      : { ...current, unread: Math.max(0, current.unread - current.openInvestigations), openInvestigations: 0 });
    try {
      await persistRead(category, { markCategory: category });
    } catch (error) {
      await refresh();
      throw error;
    }
  }, [refresh, persistRead]);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  useEffect(() => {
    const unlockAudio = () => {
      if (!soundEnabledRef.current || audioContextRef.current) return;
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;
      audioContextRef.current = new AudioContextConstructor();
      if (audioContextRef.current.state === "suspended") void audioContextRef.current.resume();
    };
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 20_000);
    return () => { window.clearTimeout(initialRefresh); document.removeEventListener("visibilitychange", onVisibility); window.clearInterval(interval); window.removeEventListener("pointerdown", unlockAudio); window.removeEventListener("keydown", unlockAudio); void audioContextRef.current?.close(); audioContextRef.current = null; };
  }, [refresh]);

  const value = useMemo(() => ({ summary, notifications, total, loading, saving, refresh, loadMore, markRead, markAllRead, markCategoryRead, soundEnabled, setSoundEnabled }), [summary, notifications, total, loading, saving, refresh, loadMore, markRead, markAllRead, markCategoryRead, soundEnabled, setSoundEnabled]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useAdminNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("useAdminNotifications must be used inside AdminNotificationsProvider.");
  return value;
}
