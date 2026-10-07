"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import StoreIcon from "./StoreIcon";
import { formatPrice } from "./currency";

type View = "overview" | "orders" | "addresses" | "favourites" | "notifications" | "settings" | "help";
type ApiState = { loading: boolean; error: string; data: unknown };

const links: Array<{ view: View; label: string; icon: Parameters<typeof StoreIcon>[0]["name"] }> = [
  { view: "overview", label: "Account", icon: "user" },
  { view: "orders", label: "Orders", icon: "bag" },
  { view: "addresses", label: "Addresses", icon: "location" },
  { view: "favourites", label: "Favourites", icon: "heart" },
  { view: "notifications", label: "Notifications", icon: "bell" },
  { view: "settings", label: "Settings", icon: "settings" },
  { view: "help", label: "Help & support", icon: "help" },
];

function endpoint(view: View) {
  if (view === "overview" || view === "settings") return "/api/v1/account/profile";
  if (view === "help") return null;
  return `/api/v1/account/${view}`;
}

export default function CustomerAccount({ view }: { view: View }) {
  const [state, setState] = useState<ApiState>({ loading: view !== "help", error: "", data: null });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const url = endpoint(view);
    if (!url) return;
    let active = true;
    void fetch(url, { credentials: "same-origin", cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not load this page.");
      if (active) setState({ loading: false, error: "", data: payload.data });
    }).catch(() => active && setState((current) => ({ loading: false, error: "We couldn’t refresh this page. Please try again.", data: current.data })));
    return () => { active = false; };
  }, [view, refresh]);

  return <main className="min-h-screen bg-tipsy-canvas text-tipsy-ink">
    <header className="bg-white"><div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-4 sm:px-6"><Link className="text-2xl font-bold tracking-[-0.075em]" href="/">tipsy<span className="text-tipsy-amber-500">.</span>theoryy</Link><Link className="text-sm font-semibold text-tipsy-muted hover:text-tipsy-ink" href="/">Back to shop</Link></div></header>
    <div className="mx-auto grid max-w-[1120px] gap-5 px-4 py-6 sm:px-6 md:grid-cols-[220px_minmax(0,1fr)] md:py-10">
      <nav aria-label="Account" className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-2 md:block md:self-start">
        {links.map((item) => <Link className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${item.view === view ? "bg-tipsy-amber-50 text-tipsy-ink" : "text-tipsy-muted hover:bg-tipsy-surface hover:text-tipsy-ink"}`} href={item.view === "overview" ? "/account" : `/${item.view}`} key={item.view}><StoreIcon className="size-4" name={item.icon} />{item.label}</Link>)}
      </nav>
      <section className="min-w-0 rounded-2xl bg-white p-5 sm:p-7">
        {state.loading && !state.data ? <div className="grid gap-4"><div className="h-7 w-36 animate-pulse rounded bg-tipsy-surface" /><div className="h-24 animate-pulse rounded-xl bg-tipsy-surface" /><div className="h-24 animate-pulse rounded-xl bg-tipsy-surface" /></div> : state.error && !state.data ? <div className="py-10 text-center"><p className="text-sm text-tipsy-muted">We couldn’t load your account right now.</p><button className="mt-4 inline-flex h-11 items-center rounded-xl bg-tipsy-amber-500 px-5 text-sm font-bold" onClick={() => setRefresh((value) => value + 1)} type="button">Try again</button></div> : <>{state.error ? <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-tipsy-amber-50 px-4 py-3 text-sm text-tipsy-ink"><span>{state.error}</span><button className="shrink-0 font-semibold underline decoration-tipsy-amber-500 underline-offset-4" onClick={() => setRefresh((value) => value + 1)} type="button">Retry</button></div> : null}<AccountContent data={state.data} onRefresh={() => setRefresh((value) => value + 1)} view={view} /></>}
      </section>
    </div>
  </main>;
}

function AccountContent({ data, onRefresh, view }: { data: unknown; onRefresh: () => void; view: View }) {
  if (view === "orders") return <Orders data={data as Array<Record<string, unknown>>} />;
  if (view === "addresses") return <Addresses data={data as Array<Record<string, unknown>>} onRefresh={onRefresh} />;
  if (view === "favourites") return <Favourites data={data as Array<Record<string, unknown>>} onRefresh={onRefresh} />;
  if (view === "notifications") return <Notifications data={data as Array<Record<string, unknown>>} onRefresh={onRefresh} />;
  if (view === "settings") return <Settings data={data as Record<string, unknown>} onRefresh={onRefresh} />;
  if (view === "help") return <Help />;
  const profile = data as Record<string, unknown>;
  return <><p className="text-sm text-tipsy-muted">Your account</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">{String(profile?.display_name ?? "Welcome back")}</h1><p className="mt-2 text-sm text-tipsy-muted">{String(profile?.phone ?? profile?.email ?? "")}</p><div className="mt-7 grid gap-3 sm:grid-cols-2">{links.slice(1, 5).map((item) => <Link className="flex items-center justify-between rounded-xl bg-tipsy-surface p-4 text-sm font-semibold transition hover:bg-tipsy-amber-50" href={`/${item.view}`} key={item.view}><span className="flex items-center gap-2"><StoreIcon className="size-5" name={item.icon} />{item.label}</span><StoreIcon className="size-4" name="arrow" /></Link>)}</div></>;
}

function Empty({ children }: { children: string }) { return <p className="rounded-xl bg-tipsy-surface px-4 py-8 text-center text-sm text-tipsy-muted">{children}</p>; }

function Orders({ data }: { data: Array<Record<string, unknown>> }) {
  return <><h1 className="text-2xl font-semibold">Orders</h1><div className="mt-5 grid gap-3">{data.length ? data.map((order) => <Link className="block rounded-xl bg-tipsy-surface p-4 transition hover:bg-tipsy-amber-50" href={`/orders/${String(order.order_number)}`} key={String(order.order_number)}><div className="flex items-start justify-between gap-3"><div><strong className="text-sm">Order #{String(order.order_number)}</strong><p className="mt-1 text-xs text-tipsy-muted">{new Date(String(order.created_at)).toLocaleString("en-KE")}</p></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold">{String(order.status).replaceAll("_", " ")}</span></div><div className="mt-4 flex items-end justify-between"><span className="text-sm text-tipsy-muted">{String(order.item_count)} items</span><strong>{formatPrice(Number(order.total_minor))}</strong></div></Link>) : <Empty>You have no orders yet.</Empty>}</div></>;
}

function Addresses({ data, onRefresh }: { data: Array<Record<string, unknown>>; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/account/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliveryArea: form.get("area"), addressLine: form.get("address"), label: form.get("label"), isDefault: form.get("default") === "on" }) });
    const payload = await response.json(); setMessage(response.ok ? "Address saved." : payload.error?.message ?? "Could not save address."); if (response.ok) { setShowForm(false); onRefresh(); }
  }
  return <><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Saved addresses</h1><button className="text-sm font-bold underline decoration-tipsy-amber-500 decoration-2 underline-offset-4" onClick={() => setShowForm(!showForm)} type="button">{showForm ? "Cancel" : "Add address"}</button></div>{showForm ? <form className="mt-5 grid gap-3 rounded-xl bg-tipsy-surface p-4" onSubmit={submit}><input className="h-11 rounded-xl bg-white px-3 text-sm outline-none ring-tipsy-amber-500 focus:ring-2" name="label" placeholder="Label, e.g. Home" /><input className="h-11 rounded-xl bg-white px-3 text-sm outline-none ring-tipsy-amber-500 focus:ring-2" name="area" placeholder="Delivery area slug or name" required /><input className="h-11 rounded-xl bg-white px-3 text-sm outline-none ring-tipsy-amber-500 focus:ring-2" name="address" placeholder="Address or landmark" required /><label className="flex items-center gap-2 text-sm"><input name="default" type="checkbox" /> Make default</label><button className="h-11 rounded-xl bg-tipsy-amber-500 text-sm font-bold" type="submit">Save address</button></form> : null}{message ? <p className="mt-3 text-sm text-tipsy-muted">{message}</p> : null}<div className="mt-5 grid gap-3">{data.length ? data.map((address) => <article className="flex items-start gap-3 rounded-xl bg-tipsy-surface p-4" key={String(address.id)}><StoreIcon className="mt-0.5 size-5" name="location" /><div><strong className="text-sm">{String(address.label ?? address.delivery_area_name ?? "Delivery address")}</strong><p className="mt-1 text-sm text-tipsy-muted">{String(address.address_line)}</p>{address.is_default ? <span className="mt-2 inline-block text-xs font-semibold text-tipsy-amber-700">Default</span> : null}</div></article>) : <Empty>No saved addresses yet.</Empty>}</div></>;
}

function Favourites({ data, onRefresh }: { data: Array<Record<string, unknown>>; onRefresh: () => void }) {
  async function remove(slug: string) { await fetch("/api/v1/account/favourites", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productSlug: slug, favourite: false }) }); onRefresh(); }
  return <><h1 className="text-2xl font-semibold">Favourites</h1><div className="mt-5 grid gap-3 sm:grid-cols-2">{data.length ? data.map((product) => <article className="rounded-xl bg-tipsy-surface p-4" key={String(product.slug)}><Link className="font-semibold" href={`/products/${String(product.slug)}`}>{String(product.name)}</Link><p className="mt-1 text-sm text-tipsy-muted">{formatPrice(Number(product.price_minor))} · {String(product.size_label ?? "")}</p><button className="mt-4 text-xs font-bold underline" onClick={() => void remove(String(product.slug))} type="button">Remove</button></article>) : <Empty>No favourite products yet.</Empty>}</div></>;
}

function Notifications({ data, onRefresh }: { data: Array<Record<string, unknown>>; onRefresh: () => void }) {
  async function read(id: string) { await fetch("/api/v1/account/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: id }) }); onRefresh(); }
  return <><h1 className="text-2xl font-semibold">Notifications</h1><div className="mt-5 grid gap-3">{data.length ? data.map((notification) => <button className={`rounded-xl p-4 text-left ${notification.status === "READ" ? "bg-tipsy-surface" : "bg-tipsy-amber-50"}`} key={String(notification.id)} onClick={() => void read(String(notification.id))} type="button"><strong className="text-sm">{String(notification.subject ?? notification.event_type)}</strong><p className="mt-1 text-sm text-tipsy-muted">{String(notification.body)}</p></button>) : <Empty>You have no notifications.</Empty>}</div></>;
}

function Settings({ data, onRefresh }: { data: Record<string, unknown>; onRefresh: () => void }) {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch("/api/v1/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: form.get("name"), marketingOptIn: form.get("marketing") === "on" }) }); const payload = await response.json(); setMessage(response.ok ? "Profile saved." : payload.error?.message ?? "Could not save profile."); if (response.ok) onRefresh(); }
  return <><h1 className="text-2xl font-semibold">Settings</h1><form className="mt-5 grid max-w-lg gap-4" onSubmit={submit}><label className="grid gap-1.5 text-sm font-semibold">Name<input className="h-12 rounded-xl border border-tipsy-line px-3 text-sm outline-none focus:border-tipsy-amber-500" defaultValue={String(data.display_name ?? "")} name="name" required /></label><label className="flex items-center gap-2 text-sm"><input defaultChecked={Boolean(data.marketing_opt_in)} name="marketing" type="checkbox" /> Send me useful offers</label><button className="h-12 rounded-xl bg-tipsy-amber-500 text-sm font-bold" type="submit">Save changes</button>{message ? <p className="text-sm text-tipsy-muted">{message}</p> : null}</form></>;
}

function Help() { return <><h1 className="text-2xl font-semibold">Help & support</h1><p className="mt-2 max-w-xl text-sm leading-6 text-tipsy-muted">Need help with an order, payment, or delivery? Contact support and include your order number when possible.</p><div className="mt-6 grid max-w-lg gap-3"><a className="rounded-xl bg-tipsy-surface p-4 text-sm font-semibold" href="mailto:support@tipsytheory.co.ke">Email support</a></div></>; }
