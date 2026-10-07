export default function StorefrontLoading() {
  return <main aria-busy="true" aria-label="Loading page" className="min-h-screen bg-tipsy-canvas text-tipsy-ink">
    <header className="border-b border-tipsy-line bg-white"><div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8"><div className="h-7 w-36 animate-pulse rounded bg-tipsy-surface" /><div className="h-10 w-56 animate-pulse rounded-xl bg-tipsy-surface" /></div></header>
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8"><div className="h-44 animate-pulse rounded-2xl bg-tipsy-surface sm:h-64" /><div className="mt-10 h-7 w-48 animate-pulse rounded bg-tipsy-surface" /><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div className="h-64 animate-pulse rounded-2xl bg-tipsy-surface" key={index} />)}</div></div>
  </main>;
}
