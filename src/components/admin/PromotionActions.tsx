"use client";

import { useState, useRef } from "react";
import { setPromotionActive, updatePromotion } from "@/app/[locale]/(admin)/admin/actions";

export default function PromotionActions({ id, name, code, percentage, minimum, active }: { id: string; name: string; code: string; percentage: number; minimum: number; active: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  function toggleMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setMenuPosition({ top: rect.bottom + 6, left: Math.max(12, rect.right - 144) });
    setMenuOpen((open) => !open);
  }
  return <div className="relative flex justify-end">
    <button aria-expanded={menuOpen} aria-label={`Actions for ${name}`} className="flex size-9 items-center justify-center rounded-lg text-lg leading-none text-gray-500 transition hover:bg-gray-100 hover:text-gray-800" onClick={toggleMenu} ref={triggerRef} type="button">⋮</button>
    {menuOpen ? <div className="fixed z-40 w-36 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg" style={menuPosition}><button className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50" onClick={() => { setEditing(true); setMenuOpen(false); }} type="button">Edit</button><form action={setPromotionActive.bind(null, id, !active)}><button className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50" type="submit">{active ? "Pause" : "Activate"}</button></form><form action={setPromotionActive.bind(null, id, false)}><button className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50" type="submit">End</button></form></div> : null}
    {editing ? <div className="fixed inset-0 z-50 grid place-items-center bg-gray-950/35 p-4"><form action={updatePromotion.bind(null, id)} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900">Edit promotion</h2><p className="mt-1 text-sm text-gray-500">Update the campaign and coupon code.</p></div><button className="text-xl text-gray-500" onClick={() => setEditing(false)} type="button">×</button></div><div className="mt-5 grid gap-4"><label className="grid gap-1.5 text-sm font-medium text-gray-700">Campaign name<input className="h-11 rounded-lg border border-gray-300 px-3" defaultValue={name} name="name" required /></label><label className="grid gap-1.5 text-sm font-medium text-gray-700">Coupon code<input className="h-11 rounded-lg border border-gray-300 px-3 uppercase" defaultValue={code} name="code" required /></label><div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-sm font-medium text-gray-700">Discount %<input className="h-11 rounded-lg border border-gray-300 px-3" defaultValue={percentage} max={100} min={1} name="percentage" required type="number" /></label><label className="grid gap-1.5 text-sm font-medium text-gray-700">Minimum KSh<input className="h-11 rounded-lg border border-gray-300 px-3" defaultValue={minimum} min={0} name="minimum" required type="number" /></label></div></div><div className="mt-6 flex justify-end gap-3"><button className="h-10 rounded-lg px-4 text-sm font-medium text-gray-600" onClick={() => setEditing(false)} type="button">Cancel</button><button className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white" type="submit">Save changes</button></div></form></div> : null}
  </div>;
}
