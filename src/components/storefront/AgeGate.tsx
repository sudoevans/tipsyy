"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

const AGE_GATE_KEY = "tipsy-theoryy-age-confirmed";
type AgeState = "checking" | "prompt" | "accepted" | "rejected";

function readAgeState(): AgeState {
  const saved = window.localStorage.getItem(AGE_GATE_KEY);
  return saved === "yes" ? "accepted" : saved === "no" ? "rejected" : "prompt";
}

function subscribeAgeState(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("tipsy-age-gate", onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener("tipsy-age-gate", onChange); };
}

function saveAgeState(value: "yes" | "no") {
  window.localStorage.setItem(AGE_GATE_KEY, value);
  window.dispatchEvent(new Event("tipsy-age-gate"));
}

export default function AgeGate() {
  const pathname = usePathname();
  const state = useSyncExternalStore(subscribeAgeState, readAgeState, () => "checking");

  if (pathname.startsWith("/admin") || state === "accepted") return null;

  return <div aria-label="Age confirmation" aria-modal="true" className="fixed inset-0 z-[2147483647] grid min-h-dvh place-items-center overflow-y-auto bg-[#171614] p-4" role="dialog">
    {state === "checking" ? <span className="size-7 animate-spin rounded-full border-2 border-white/25 border-t-[#ffc400]" aria-label="Loading" /> : <section className="w-full max-w-sm rounded-2xl bg-[#faf9f6] p-6 text-[#15130f] sm:p-7">
      <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8b5b00]">Tipsy Theory</p>
      {state === "rejected" ? <>
        <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.035em]">You must be 18 or older</h1>
        <p className="mt-3 text-[14px] leading-6 text-[#77736d]">This alcohol store is only available to adults aged 18 and over. You cannot continue into the store.</p>
      </> : <>
        <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.04em]">Are you 18 or older?</h1>
        <p className="mt-3 text-[14px] leading-6 text-[#77736d]">You must be of legal drinking age to browse and order from Tipsy Theory.</p>
        <div className="mt-6 grid gap-3">
          <button className="h-12 rounded-xl bg-[#ffc400] px-5 text-[15px] font-semibold text-[#15130f] transition hover:bg-[#ffd33d] active:scale-[0.99]" onClick={() => saveAgeState("yes")} type="button">Yes, continue</button>
          <button className="h-12 rounded-xl bg-[#f0ede7] px-5 text-[15px] font-semibold text-[#15130f] transition hover:bg-[#e7e2d9]" onClick={() => saveAgeState("no")} type="button">No, exit</button>
        </div>
      </>}
      <p className="mt-5 text-[12px] leading-5 text-[#77736d]">Please enjoy responsibly. Age confirmation may be requested again during delivery.</p>
    </section>}
  </div>;
}
