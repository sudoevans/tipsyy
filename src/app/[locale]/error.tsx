"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Route rendering failed.", { digest: error.digest });
  }, [error]);

  return <main className="grid min-h-dvh place-items-center bg-tipsy-canvas px-5 py-10 text-tipsy-ink">
    <section className="w-full max-w-md rounded-2xl border border-tipsy-line bg-white p-7 text-center shadow-[0_12px_32px_rgba(21,19,15,0.05)] sm:p-9">
      <p className="text-sm font-semibold text-tipsy-amber-700">Something needs attention</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">We couldn’t load this page</h1>
      <p className="mt-3 text-sm leading-6 text-tipsy-muted">Please try again. If the problem continues, return to the store and try once more.</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><button className="h-11 rounded-xl bg-tipsy-amber-500 px-5 text-sm font-semibold transition hover:bg-tipsy-amber-300" onClick={reset} type="button">Try again</button><Link className="inline-flex h-11 items-center justify-center rounded-xl border border-tipsy-line px-5 text-sm font-semibold transition hover:bg-tipsy-surface" href="/">Go to store</Link></div>
    </section>
  </main>;
}
