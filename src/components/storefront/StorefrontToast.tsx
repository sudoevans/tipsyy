"use client";

import { AlertCircleIcon, CheckCircleIcon, InfoCircleIcon, XCloseIcon } from "@untitledui/icons-react/outline";
import { createPortal } from "react-dom";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ToastTone = "success" | "error" | "info";
type Toast = { title: string; description?: string; tone?: ToastTone } | null;
type ToastContextValue = { showToast: (toast: Exclude<Toast, null>) => void };
const StorefrontToastContext = createContext<ToastContextValue | null>(null);

export function StorefrontToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>(null);
  const [isMounted, setIsMounted] = useState(false);
  const showToast = useCallback((nextToast: Exclude<Toast, null>) => setToast(nextToast), []);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const value = useMemo(() => ({ showToast }), [showToast]);
  const tone = toast?.tone ?? "info";
  const Icon = tone === "success" ? CheckCircleIcon : tone === "error" ? AlertCircleIcon : InfoCircleIcon;
  const toneClass = tone === "success" ? "bg-tipsy-amber-100 text-tipsy-ink" : tone === "error" ? "bg-red-50 text-red-700" : "bg-tipsy-surface text-tipsy-ink";

  return <StorefrontToastContext.Provider value={value}>
    {children}
    {toast && isMounted ? createPortal(<div aria-live="polite" className="feedback-toast fixed inset-x-4 top-4 z-[100000] mx-auto flex w-auto max-w-sm items-start gap-3 rounded-2xl border border-tipsy-line bg-white p-3.5 shadow-[0_12px_32px_rgba(21,19,15,0.12)]" role={tone === "error" ? "alert" : "status"}>
      <span className={`relative size-9 shrink-0 rounded-xl ${toneClass}`}><Icon className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2" strokeWidth={2} /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-tipsy-ink">{toast.title}</span>{toast.description ? <span className="mt-0.5 block text-xs leading-5 text-tipsy-muted">{toast.description}</span> : null}</span>
      <button aria-label="Dismiss notification" className="-mt-0.5 rounded-lg p-1 text-tipsy-muted transition hover:bg-tipsy-surface hover:text-tipsy-ink" onClick={() => setToast(null)} type="button"><XCloseIcon className="size-4" strokeWidth={2} /></button>
    </div>, document.body) : null}
  </StorefrontToastContext.Provider>;
}

export function useStorefrontToast() {
  const context = useContext(StorefrontToastContext);
  if (!context) throw new Error("useStorefrontToast must be used inside StorefrontToastProvider.");
  return context;
}
