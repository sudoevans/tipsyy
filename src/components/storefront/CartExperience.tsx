"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import BeverageImage from "./BeverageImage";
import CartDrawer from "./CartDrawer";
import { readCartForCheckout, readCouponCode, readDeliveryLocation, restoreCartForCheckout, saveCartForCheckout } from "./cartStorage";
import { formatPrice } from "./currency";
import StoreHeader from "./StoreHeader";
import StoreIcon from "./StoreIcon";
import useCatalogProducts from "./useCatalogProducts";

export default function CartExperience() {
  const router = useRouter();
  const t = useTranslations("storefront");
  const { isLoading: isCatalogLoading, products } = useCatalogProducts();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isReady, setIsReady] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [stockIssue, setStockIssue] = useState(false);
  const [quote, setQuote] = useState({ subtotal: 0, discount: 0, deliveryFee: 0, total: 0 });
  const hasRestoredCart = useRef(false);
  const items = products.filter((product) => cart[product.id]).map((product) => ({ product, quantity: cart[product.id] }));
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const cartSignature = items.map(({ product, quantity }) => `${product.id}:${quantity}`).join("|");
  const subtotal = items.length ? quote.subtotal || items.reduce((sum, item) => sum + item.product.price * item.quantity, 0) : 0;
  const deliveryFee = items.length ? quote.deliveryFee : 0;

  useEffect(() => {
    if (!cartSignature) return;
    let active = true;
    const quoteItems = cartSignature.split("|").map((entry) => { const [productSlug, quantity] = entry.split(":"); return { productSlug, quantity: Number(quantity) }; });
    void fetch("/api/v1/cart/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: quoteItems, deliveryArea: readDeliveryLocation() || undefined, couponCode: readCouponCode() || undefined }) }).then((response) => response.json() as Promise<{ data?: { subtotal: number; discount: number; deliveryFee: number; total: number } }>).then((payload) => { if (active && payload.data) setQuote(payload.data); }).catch(() => undefined);
    return () => { active = false; };
  }, [cartSignature]);

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      hasRestoredCart.current = true;
      if (window.sessionStorage.getItem("tipsy-theoryy-stock-issue")) {
        window.sessionStorage.removeItem("tipsy-theoryy-stock-issue");
        setStockIssue(true);
        setCart(readCartForCheckout());
        setIsReady(true);
        return;
      }
      void restoreCartForCheckout().then((restored) => { if (active) { setCart(restored); setIsReady(true); } });
    });

    return () => { active = false; window.cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    if (hasRestoredCart.current) saveCartForCheckout(cart);
  }, [cart]);

  const setQuantity = (productId: string, quantity: number) => setCart((current) => {
    const next = { ...current };
    const stock = products.find((product) => product.id === productId)?.availableQuantity ?? 0;
    if (quantity <= 0) delete next[productId]; else next[productId] = Math.min(quantity, stock);
    return next;
  });

  const proceedToCheckout = () => {
    saveCartForCheckout(cart);
    router.push("/checkout");
  };

  return <main className="min-h-screen bg-tipsy-canvas pb-12 text-tipsy-ink">
    <StoreHeader cartCount={itemCount} onCartOpen={() => setIsCartOpen(true)} onCategorySelect={() => router.push("/")} onSearchChange={setQuery} query={query} selectedCategory="all" />
    <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
      <Link className="inline-flex items-center gap-2 text-sm font-semibold text-tipsy-muted transition hover:text-tipsy-ink" href="/"><StoreIcon className="size-4" name="arrow-left" />Continue shopping</Link>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="rounded-[20px] border border-[#e9e5dd] bg-white p-5 sm:p-7">
          <div className="flex items-baseline justify-between gap-4"><h1 className="text-[30px] font-bold tracking-[-0.05em]">Your cart</h1>{isReady ? <span className="text-sm text-tipsy-muted">{t("cartItems", { count: itemCount })}</span> : null}</div>
          {!isReady || isCatalogLoading ? <div className="mt-8 h-24 animate-pulse rounded-xl bg-tipsy-surface" /> : items.length ? <>{stockIssue ? <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong className="font-semibold">Some items are no longer available.</strong><p className="mt-1 text-amber-800">Remove or replace unavailable items to continue.</p></div> : null}<div className={`${stockIssue ? "mt-4" : "mt-6"} divide-y divide-[#e9e5dd]`}>{items.map(({ product, quantity }) => { const unavailable = product.availableQuantity !== undefined && product.availableQuantity < quantity; return <article className="flex gap-4 py-5 first:pt-0" key={product.id}><div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-tipsy-surface"><BeverageImage alt="" className="object-contain p-1" sizes="80px" src={product.imageUrl} /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[15px] font-semibold">{product.name ?? t(`products.${product.id}.name`)}</h2><p className="mt-1 text-[13px] text-tipsy-muted">{unavailable ? <span className="font-semibold text-red-700">Unavailable</span> : product.size}</p></div><button aria-label={t("removeProduct", { product: product.name ?? t(`products.${product.id}.name`) })} className="p-1 text-tipsy-muted transition hover:text-tipsy-ink" onClick={() => setQuantity(product.id, 0)} type="button"><StoreIcon className="size-4" name="trash" /></button></div><div className="mt-4 flex items-center justify-between gap-3"><div className="flex h-10 items-center rounded-xl bg-tipsy-surface p-1"><button aria-label={t("removeOne", { product: product.name ?? t(`products.${product.id}.name`) })} className="flex size-8 items-center justify-center rounded-lg transition hover:bg-white" onClick={() => setQuantity(product.id, quantity - 1)} type="button"><StoreIcon className="size-4" name="minus" /></button><span className="w-8 text-center text-sm font-semibold">{quantity}</span><button aria-label={t("addProduct", { product: product.name ?? t(`products.${product.id}.name`) })} className="flex size-8 items-center justify-center rounded-lg transition hover:bg-white disabled:opacity-40" disabled={product.availableQuantity !== undefined && quantity >= product.availableQuantity} onClick={() => setQuantity(product.id, quantity + 1)} type="button"><StoreIcon className="size-4" name="plus" /></button></div><strong className="text-[15px]">{formatPrice(product.price * quantity)}</strong></div></div></article>; })}</div></> : <div className="py-16 text-center"><p className="text-sm text-tipsy-muted">{t("emptyCart")}</p><Link className="mt-5 inline-flex h-11 items-center rounded-xl bg-tipsy-amber-500 px-4 text-sm font-semibold transition hover:bg-tipsy-amber-300" href="/">Browse drinks</Link></div>}
        </section>
        <aside className="h-fit rounded-[20px] border border-[#e9e5dd] bg-white p-5 sm:p-6 lg:sticky lg:top-6"><h2 className="text-xl font-bold tracking-[-0.04em]">Order summary</h2><dl className="mt-6 grid gap-3 border-y border-[#e9e5dd] py-5 text-sm"><div className="flex justify-between text-tipsy-muted"><dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd></div>{quote.discount ? <div className="flex justify-between text-tipsy-muted"><dt>Discount</dt><dd>−{formatPrice(quote.discount)}</dd></div> : null}<div className="flex justify-between text-tipsy-muted"><dt>Delivery</dt><dd>{formatPrice(deliveryFee)}</dd></div></dl><div className="mt-5 flex justify-between text-lg font-bold"><span>Total</span><span>{formatPrice(quote.total || subtotal + deliveryFee)}</span></div><button className="mt-6 h-12 w-full rounded-xl bg-tipsy-amber-500 text-sm font-semibold transition hover:bg-tipsy-amber-300 disabled:cursor-not-allowed disabled:opacity-50" disabled={!items.length} onClick={proceedToCheckout} type="button">{t("checkout")}</button></aside>
      </div>
    </div>
    {isCartOpen ? <CartDrawer items={items} onCheckout={proceedToCheckout} onClose={() => setIsCartOpen(false)} onQuantityChange={setQuantity} /> : null}
  </main>;
}
