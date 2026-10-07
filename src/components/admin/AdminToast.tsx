"use client";
import type { ReactNode } from "react";
import { Toaster, toast } from "sonner";
type ToastTone = "success" | "error" | "info";
type ToastMessage = { title: string; description?: string; tone: ToastTone };
export function AdminToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        offset={{ top: 96, right: 24 }}
        mobileOffset={{ top: 84, right: 16, left: 16 }}
        closeButton
        richColors
        expand={false}
        toastOptions={{ className: "tipsy-admin-toast", duration: 4200 }}
      />
    </>
  );
}
export function useAdminToast() {
  return {
    showToast: ({ title, description, tone }: ToastMessage) => {
      if (tone === "success") toast.success(title, { description });
      else if (tone === "error") toast.error(title, { description });
      else toast.info(title, { description });
    },
  };
}
