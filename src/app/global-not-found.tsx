import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found | Tipsy Theoryy",
  description: "The requested page could not be found.",
};

export default function GlobalNotFound() {
  return <html lang="en">
    <body className="bg-tipsy-canvas font-geist text-tipsy-ink">
      <main className="grid min-h-dvh place-items-center px-5 py-10">
        <section className="w-full max-w-md rounded-2xl border border-tipsy-line bg-white p-7 text-center shadow-[0_12px_32px_rgba(21,19,15,0.05)] sm:p-9">
          <p className="text-sm font-semibold text-tipsy-amber-700">404</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">We couldn’t find that page</h1>
          <p className="mt-3 text-sm leading-6 text-tipsy-muted">The page may have moved, or the address may be incomplete.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link className="inline-flex h-11 items-center justify-center rounded-xl bg-tipsy-amber-500 px-5 text-sm font-semibold transition hover:bg-tipsy-amber-300" href="/">Go to store</Link>
            <Link className="inline-flex h-11 items-center justify-center rounded-xl border border-tipsy-line px-5 text-sm font-semibold transition hover:bg-tipsy-surface" href="/admin">Open operations</Link>
          </div>
        </section>
      </main>
    </body>
  </html>;
}
