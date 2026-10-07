export default function AdminLoading() {
  return <div aria-busy="true" aria-label="Loading admin page" className="space-y-6 pb-10">
    <div><div className="h-4 w-36 animate-pulse rounded bg-gray-100" /><div className="mt-3 h-8 w-44 animate-pulse rounded bg-gray-100" /></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="h-36 animate-pulse rounded-2xl border border-gray-200 bg-white" key={index} />)}</div>
    <div className="grid gap-4 xl:grid-cols-12"><div className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-white xl:col-span-7" /><div className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-white xl:col-span-5" /></div>
  </div>;
}
