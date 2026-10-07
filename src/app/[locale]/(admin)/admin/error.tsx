"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AdminPageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Admin page failed to load.", { digest: error.digest });
  }, [error]);

  return <section className="mx-auto flex min-h-[420px] max-w-xl items-center justify-center py-10">
    <div className="w-full rounded-2xl border border-gray-200 bg-white p-7 text-center shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm font-semibold text-brand-600">Operations needs attention</p>
      <h1 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">We couldn’t load this section</h1>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Try again in a moment. Your data has not been changed.</p>
      <div className="mt-6 flex justify-center gap-3"><button className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600" onClick={reset} type="button">Try again</button><Link className="inline-flex h-10 items-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" href="/admin">Back to overview</Link></div>
    </div>
  </section>;
}
