"use client";

import { DotsVerticalIcon } from "@untitledui/icons-react/outline";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type AdminTableAction = {
  label: string;
  icon?: ReactNode;
  href?: string;
  tone?: "default" | "danger";
  onSelect?: () => void;
};

export default function AdminTableActionsMenu({
  label,
  items,
  width = 160,
}: {
  label: string;
  items: AdminTableAction[];
  width?: number;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const close = useCallback(() => setPosition(null), []);

  useEffect(() => {
    if (!position) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      )
        close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    const onViewportChange = () => close();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [close, position]);

  const toggle = () => {
    if (position) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const estimatedHeight = items.length * 40 + 8;
    const top =
      window.innerHeight - rect.bottom < estimatedHeight + 12
        ? Math.max(8, rect.top - estimatedHeight - 6)
        : rect.bottom + 6;
    const left = Math.max(
      8,
      Math.min(rect.right - width, window.innerWidth - width - 8),
    );
    setPosition({ top, left });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        onClick={toggle}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white"
      >
        <DotsVerticalIcon className="size-4" />
      </button>
      {position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              className="fixed z-[160] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900"
              style={{ top: position.top, left: position.left, width }}
            >
              {items.map((item) => {
                const className = `flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${item.tone === "danger" ? "text-error-600 hover:bg-error-50 dark:text-red-400 dark:hover:bg-red-500/10" : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"}`;
                const onClick = () => {
                  close();
                  item.onSelect?.();
                };
                return item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    role="menuitem"
                    onClick={close}
                    className={className}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={onClick}
                    className={className}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
