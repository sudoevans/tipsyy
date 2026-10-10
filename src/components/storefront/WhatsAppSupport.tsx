"use client";

import { ArrowUpRight, MessageCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function WhatsAppSupport() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [supportNumber, setSupportNumber] = useState<string | null>(null);
  const hasInteracted = useRef(false);
  useEffect(() => {
    let active = true;
    fetch("/api/v1/support/whatsapp", { cache: "no-store" })
      .then(async (response) => await response.json() as { data?: { number?: string } })
      .then((result) => {
        if (active) setSupportNumber(String(result?.data?.number ?? "").replace(/\D/g, ""));
      })
      .catch(() => {
        if (active) setSupportNumber("");
      });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (/(?:^|\/)admin(?:\/|$)/.test(pathname)) return;
    try {
      if (window.sessionStorage.getItem("tipsy:whatsapp-nudge-seen")) return;
      const showTimer = window.setTimeout(() => {
        if (!hasInteracted.current) setShowNudge(true);
        window.sessionStorage.setItem("tipsy:whatsapp-nudge-seen", "1");
      }, 5000);
      const hideTimer = window.setTimeout(() => setShowNudge(false), 13000);
      return () => {
        window.clearTimeout(showTimer);
        window.clearTimeout(hideTimer);
      };
    } catch {
      // If storage is unavailable, the prompt still appears once for this visit.
      const timer = window.setTimeout(() => {
        if (!hasInteracted.current) setShowNudge(true);
      }, 5000);
      return () => window.clearTimeout(timer);
    }
  }, [pathname]);
  if (/(?:^|\/)admin(?:\/|$)/.test(pathname)) return null;

  const chatUrl = (message: string) => `https://wa.me/${supportNumber}?text=${encodeURIComponent(message)}`;
  const orderMessage = `Hi Tipsy Theoryy, I need help with an order. Page: ${typeof window === "undefined" ? "" : window.location.href}`;
  const contactLink = (label: string, message: string) => supportNumber ? (
    <a className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-tipsy-line px-3 py-3 text-sm font-semibold text-tipsy-ink transition hover:bg-tipsy-surface" href={chatUrl(message)} rel="noreferrer" target="_blank">{label}<ArrowUpRight className="size-4 shrink-0 text-tipsy-muted" /></a>
  ) : <div aria-disabled="true" className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-tipsy-line px-3 py-3 text-sm font-semibold text-tipsy-muted">{label}<ArrowUpRight className="size-4 shrink-0 text-tipsy-muted/50" /></div>;

  const toggleOpen = () => {
    hasInteracted.current = true;
    setShowNudge(false);
    setOpen((value) => !value);
  };

  return <div className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+6rem)] z-[70] flex w-12 flex-col items-end sm:right-6 sm:bottom-6 sm:w-auto">
    <section aria-hidden={!open} aria-label="WhatsApp support" className={`absolute bottom-[calc(100%+0.75rem)] right-0 flex max-h-[min(26rem,calc(100dvh-9rem))] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-[#e9e5dd] bg-white shadow-[0_16px_48px_rgba(21,19,15,0.18)] transition-opacity motion-reduce:transition-none sm:bottom-[calc(100%+1rem)] ${open ? "opacity-100 duration-400 ease-out" : "pointer-events-none opacity-0 duration-500 ease-in"}`} id="whatsapp-support-panel" inert={!open}>
      <div className="flex shrink-0 items-start justify-between gap-3 bg-tipsy-ink px-4 py-3.5 text-white">
        <div><p className="text-sm font-semibold">How can we help?</p><p className="mt-1 text-xs text-white/70">Choose a message to start a WhatsApp chat.</p></div>
        <button aria-label="Close support" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white/75 transition hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)} type="button"><X className="size-4" /></button>
      </div>
      <div className="grid gap-2 overflow-y-auto p-3">
        {contactLink("Ask a question", "Hi Tipsy Theoryy, I have a question about your store.")}
        {contactLink("Get help with an order", orderMessage)}
        {!supportNumber ? <p className="px-1 pt-1 text-xs leading-5 text-amber-800">{supportNumber === null ? "Connecting to support…" : "WhatsApp support isn’t available just now."}</p> : null}
      </div>
    </section>
    <button aria-hidden={!showNudge || open} aria-label="Do you need help? Open WhatsApp support" className={`absolute bottom-[calc(100%+0.75rem)] right-0 flex items-center gap-2 whitespace-nowrap rounded-full border border-[#d7eee1] bg-white px-3.5 py-2.5 text-sm font-semibold text-tipsy-ink shadow-[0_8px_24px_rgba(21,19,15,0.12)] transition-[opacity,transform,visibility] duration-450 ease-in-out motion-reduce:transition-none hover:-translate-y-0.5 ${showNudge && !open ? "visible translate-y-0 scale-100 opacity-100" : "invisible pointer-events-none translate-y-2 scale-[0.96] opacity-0"}`} inert={!showNudge || open} onClick={() => { hasInteracted.current = true; setShowNudge(false); setOpen(true); }} type="button"><span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#25D366]/50 motion-reduce:animate-none" /><span className="relative inline-flex size-2.5 rounded-full bg-[#25D366]" /></span>Do you need help?</button>
    <button aria-controls="whatsapp-support-panel" aria-expanded={open} aria-label={open ? "Close WhatsApp support" : "Contact support on WhatsApp"} className="relative flex size-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[#1fbd5c] hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/25" onClick={toggleOpen} title="WhatsApp support" type="button">
      <span className="relative size-5 shrink-0">
        <MessageCircle aria-hidden="true" className={`absolute inset-0 size-5 transition-opacity duration-200 ease-out motion-reduce:transition-none ${open ? "opacity-0" : "opacity-100"}`} />
        <X aria-hidden="true" className={`absolute inset-0 size-5 transition-opacity duration-200 ease-out motion-reduce:transition-none ${open ? "opacity-100" : "opacity-0"}`} />
      </span>
    </button>
  </div>;
}
