"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import StoreIcon from "./StoreIcon";
import { useStorefrontToast } from "./StorefrontToast";

const SessionContext = createContext<{ authenticated: boolean | null; favourites: string[]; updateFavourite: (slug: string, saved: boolean) => void }>({ authenticated: null, favourites: [], updateFavourite: () => {} });

export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [favourites, setFavourites] = useState<string[]>([]);
  useEffect(() => {
    if (/(?:^|\/)admin(?:\/|$)/.test(pathname)) return;
    let active = true;
    void fetch("/api/v1/account/profile", { cache: "no-store" }).then(async (response) => {
      if (active) setAuthenticated(response.ok);
      if (!response.ok) { if (active) setFavourites([]); return; }
      try {
        const favouritesResponse = await fetch("/api/v1/account/favourites", { cache: "no-store" });
        if (!favouritesResponse.ok) return;
        const payload = await favouritesResponse.json() as { data?: Array<{ slug: string }> };
        if (active) setFavourites((payload.data ?? []).map((product) => product.slug));
      } catch {
        // A favourites request failure does not invalidate the customer session.
      }
    }).catch(() => { if (active) setAuthenticated(false); });
    return () => { active = false; };
  }, [pathname]);
  const updateFavourite = (slug: string, saved: boolean) => setFavourites((current) => saved ? [...new Set([...current, slug])] : current.filter((item) => item !== slug));
  return <SessionContext.Provider value={{ authenticated, favourites, updateFavourite }}>{children}</SessionContext.Provider>;
}

export const useCustomerSession = () => useContext(SessionContext);

export function FavouriteButton({ productSlug, name, className }: { productSlug: string; name: string; className: string }) {
  const { authenticated, favourites, updateFavourite } = useCustomerSession();
  const { showToast } = useStorefrontToast();
  const saved = favourites.includes(productSlug);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const promptRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!prompt) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    promptRef.current?.querySelector<HTMLElement>("a")?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPrompt(false);
      if (event.key !== "Tab") return;
      const controls = promptRef.current?.querySelectorAll<HTMLElement>("a,button");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", dismiss);
    return () => { window.removeEventListener("keydown", dismiss); previousFocus?.focus(); };
  }, [prompt]);
  async function toggle() {
    if (!authenticated) { setPrompt(true); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/v1/account/favourites", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productSlug, favourite: !saved }) });
      if (response.status === 401) { setPrompt(true); return; }
      if (!response.ok) throw new Error("Could not update your favourites. Please try again.");
      updateFavourite(productSlug, !saved);
      showToast({ title: saved ? "Removed from favourites" : "Saved to favourites", tone: "success" });
    } catch (error) { showToast({ title: error instanceof Error ? error.message : "Could not save favourite", tone: "error" }); }
    finally { setBusy(false); }
  }
  return <>
    <button aria-label={saved ? `Remove ${name} from favourites` : `Save ${name}`} aria-pressed={saved} className={`${className} ${saved ? "text-tipsy-amber-700" : "text-tipsy-ink"}`} disabled={busy} onClick={() => void toggle()} type="button"><StoreIcon className={`size-4 ${saved ? "fill-current" : "fill-none"}`} name="heart" /></button>
    {prompt ? createPortal(<div className="fixed inset-0 z-[100002] grid place-items-center bg-black/35 p-4" onClick={() => setPrompt(false)}><section ref={promptRef} aria-label="Log in to save favourites" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-6 text-tipsy-ink shadow-xl" onClick={(event) => event.stopPropagation()} role="dialog"><h2 className="text-xl font-semibold">Log in to save favourites</h2><p className="mt-2 text-sm text-tipsy-muted">Keep your favourite drinks saved to your account.</p><div className="mt-5 grid gap-3"><Link className="rounded-xl bg-tipsy-amber-500 px-4 py-3 text-center text-sm font-semibold" href="/signin">Log in</Link><Link className="rounded-xl border border-tipsy-line px-4 py-3 text-center text-sm font-semibold" href="/signup">Sign up</Link><button className="py-2 text-sm text-tipsy-muted" onClick={() => setPrompt(false)} type="button">Not now</button></div></section></div>, document.body) : null}
  </>;
}
