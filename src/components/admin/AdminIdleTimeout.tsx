"use client";

import { useEffect } from "react";

const IDLE_MS = 15 * 60_000;
const STORAGE_KEY = "tipsy_admin_last_activity";

export default function AdminIdleTimeout() {
  useEffect(() => {
    let lastActivity = Date.now();
    let lastSync = 0;
    let exiting = false;
    let syncing = false;
    const logout = async () => {
      if (exiting) return;
      exiting = true;
      try { await fetch("/api/v1/admin/auth/logout", { method: "POST", signal: AbortSignal.timeout(5000) }); }
      catch { /* Server-side idle expiry still prevents access. */ }
      window.location.replace(window.location.hostname === "admin.tipsytheoryy.com" ? "/login?expired=1" : "/admin/login?expired=1");
    };
    const activity = () => {
      if (exiting) return;
      const now = Date.now();
      if (now - lastActivity >= IDLE_MS) { void logout(); return; }
      if (now - lastActivity > 1000) {
        lastActivity = now;
        try { localStorage.setItem(STORAGE_KEY, String(now)); } catch { /* Storage may be unavailable. */ }
      }
      if (!syncing && now - lastSync >= 60_000) {
        syncing = true;
        lastSync = now;
        void fetch("/api/v1/admin/auth/activity", { method: "POST", signal: AbortSignal.timeout(5000) })
          .then(response => { if (response.status === 401) void logout(); })
          .catch(() => { lastSync = 0; })
          .finally(() => { syncing = false; });
      }
    };
    const check = () => { if (Date.now() - lastActivity >= IDLE_MS) void logout(); };
    const storage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        const timestamp = Number(event.newValue);
        if (Number.isFinite(timestamp) && timestamp <= Date.now()) lastActivity = Math.max(lastActivity, timestamp);
      }
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;
    events.forEach(event => window.addEventListener(event, activity, { passive: true }));
    window.addEventListener("storage", storage);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 1000);
    return () => {
      window.clearInterval(timer);
      events.forEach(event => window.removeEventListener(event, activity));
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return null;
}
