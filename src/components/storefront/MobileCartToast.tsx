"use client";

import StoreIcon from "./StoreIcon";

interface MobileCartToastProps {
  onContinue: () => void;
  onViewCart: () => void;
  visible: boolean;
}

export default function MobileCartToast({ onContinue, onViewCart, visible }: MobileCartToastProps) {
  if (!visible) return null;

  return <div aria-live="polite" className="fixed inset-x-3 bottom-[76px] z-[100000] sm:hidden" role="status">
    <div className="flex items-center gap-3 rounded-2xl border border-tipsy-line bg-white p-3 shadow-[0_8px_24px_rgba(21,19,15,0.12)]">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tipsy-amber-500 text-tipsy-ink"><StoreIcon className="size-5" name="check" /></span>
      <p className="min-w-0 flex-1 text-sm font-semibold text-tipsy-ink">Added to cart</p>
      <button className="min-h-11 rounded-xl px-3 text-sm font-semibold text-tipsy-muted transition hover:bg-tipsy-surface hover:text-tipsy-ink" onClick={onContinue} type="button">Continue</button>
      <button className="min-h-11 rounded-xl bg-tipsy-amber-500 px-3 text-sm font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300" onClick={onViewCart} type="button">View cart</button>
    </div>
  </div>;
}
