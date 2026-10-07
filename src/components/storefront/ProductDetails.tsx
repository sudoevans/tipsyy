"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import CartDrawer from "./CartDrawer";
import MobileCartToast from "./MobileCartToast";
import { confirmCartForCheckout, restoreCartForCheckout, saveCartForCheckout } from "./cartStorage";
import BeverageImage from "./BeverageImage";
import { formatPrice } from "./currency";
import type { StoreProduct } from "./data";
import ProductCard from "./ProductCard";
import StoreFooter from "./StoreFooter";
import StoreHeader from "./StoreHeader";
import StoreIcon from "./StoreIcon";
import { useStorefrontToast } from "./StorefrontToast";
import useCatalogProducts from "./useCatalogProducts";

interface ProductDetailsProps {
  product: StoreProduct;
}

export default function ProductDetails({ product }: ProductDetailsProps) {
  const router = useRouter();
  const t = useTranslations("storefront");
  const { products } = useCatalogProducts();
  const { showToast } = useStorefrontToast();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [isMobileCartToastOpen, setIsMobileCartToastOpen] = useState(false);
  const [isNavigatingToCheckout, setIsNavigatingToCheckout] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [query, setQuery] = useState("");
  const hasRestoredCart = useRef(false);
  const checkoutTimer = useRef<number | null>(null);
  const variants = product.variants ?? [{ id: "default", label: product.size, price: product.price, size: product.size }];
  const [selectedVariantId, setSelectedVariantId] = useState(variants[0].id);
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) ?? variants[0];
  const selectedProduct = { ...product, price: selectedVariant.price, size: selectedVariant.size };
  const available = product.available ?? true;
  const cartCount = Object.values(cart).reduce((sum, itemQuantity) => sum + itemQuantity, 0);
  const cartItems = products.filter((item) => cart[item.id]).map((item) => ({ product: item.id === product.id ? selectedProduct : item, quantity: cart[item.id] }));
  const similarProducts = products.filter((item) => item.id !== product.id && item.category === product.category).slice(0, 4);

  const setCartQuantity = (productId: string, nextQuantity: number) => setCart((current) => {
    const next = { ...current };
    const stock = (products.find((item) => item.id === productId) ?? product).availableQuantity ?? 0;
    if (nextQuantity <= 0) delete next[productId]; else next[productId] = Math.min(nextQuantity, stock);
    return next;
  });
  const addToCart = async () => {
    if (isAdding) return;
    const stock = product.availableQuantity ?? 100;
    const nextCart = { ...cart, [product.id]: Math.min((cart[product.id] ?? 0) + quantity, stock) };
    setIsAdding(true);
    try {
      const confirmed = await confirmCartForCheckout(nextCart);
      setCart(confirmed);
      if (window.matchMedia("(min-width: 640px)").matches) setCartOpen(true); else setIsMobileCartToastOpen(true);
    } catch (error) {
      showToast({ title: "Couldn’t update your cart", description: error instanceof Error ? error.message : "Please try again.", tone: "error" });
    } finally {
      setIsAdding(false);
    }
  };
  const name = product.name ?? t(`products.${product.id}.name`);
  const details = [
    [t("details.volume"), selectedVariant.size],
    [t("details.type"), t(`productDetails.${product.id}.type`)],
    [t("details.country"), t(`productDetails.${product.id}.country`)],
    [t("details.abv"), t(`productDetails.${product.id}.abv`)],
  ];

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      hasRestoredCart.current = true;
      void restoreCartForCheckout().then((restored) => { if (active) setCart(restored); });
    });

    return () => { active = false; window.cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => () => {
    if (checkoutTimer.current) window.clearTimeout(checkoutTimer.current);
  }, []);

  useEffect(() => {
    if (hasRestoredCart.current) saveCartForCheckout(cart);
  }, [cart]);

  const proceedToCheckout = async () => {
    if (isNavigatingToCheckout) return;
    setCartOpen(false);
    setIsMobileCartToastOpen(false);
    setIsNavigatingToCheckout(true);
    try {
      await confirmCartForCheckout(cart);
      checkoutTimer.current = window.setTimeout(() => router.push("/checkout"), 350);
    } catch (error) {
      setIsNavigatingToCheckout(false);
      showToast({ title: "Couldn’t prepare checkout", description: error instanceof Error ? error.message : "Please try again.", tone: "error" });
    }
  };

  return (
    <main className="min-h-screen bg-tipsy-canvas pb-20 text-tipsy-ink sm:pb-0">
      <StoreHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} onCategorySelect={() => router.push("/")} onSearchChange={setQuery} query={query} selectedCategory="all" />
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-tipsy-muted transition hover:text-tipsy-ink" href="/"><StoreIcon className="size-4 rotate-90" name="arrow" />{t("details.back")}</Link>
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:gap-10">
          <div className="relative min-h-[380px] overflow-hidden rounded-2xl border border-tipsy-line bg-tipsy-surface sm:min-h-[520px]"><BeverageImage alt={name} className="object-contain p-8 sm:p-12" sizes="(min-width: 1024px) 55vw, 100vw" src={product.imageUrl} /><button aria-label={t("saveProduct", { product: name })} className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-xl border border-tipsy-line bg-white text-tipsy-ink transition hover:bg-tipsy-amber-50" type="button"><StoreIcon className="size-5" name="heart" /></button></div>
          <div className="rounded-2xl border border-tipsy-line bg-white p-5 sm:p-7"><span className="rounded-full bg-tipsy-amber-100 px-2.5 py-1 text-xs font-semibold text-tipsy-ink">{t(`categories.${product.category}`)}</span><h1 className="mt-4 text-3xl font-bold tracking-[-0.055em] text-tipsy-ink sm:text-4xl">{name}</h1><div className="mt-3 flex items-center gap-3"><p className="text-xl font-bold text-tipsy-ink">{available ? formatPrice(selectedVariant.price) : t("pricingComingSoon")}</p><span className="text-sm font-semibold text-tipsy-muted">{product.rating === "New" ? t("newProduct") : <>★ {product.rating} {t("details.reviews")}</>}</span></div><p className="mt-5 max-w-xl text-sm leading-6 text-tipsy-muted">{t(`productDetails.${product.id}.description`)}</p>{variants.length > 1 ? <div className="mt-6"><p className="text-sm font-semibold text-tipsy-ink">{t("details.selectOption")}</p><div className="mt-3 flex flex-wrap gap-2">{variants.map((variant) => <button aria-pressed={selectedVariant.id === variant.id} className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${selectedVariant.id === variant.id ? "border-tipsy-amber-500 bg-tipsy-amber-50 text-tipsy-ink" : "border-tipsy-line text-tipsy-muted hover:border-tipsy-amber-500 hover:bg-tipsy-surface"}`} key={variant.id} onClick={() => setSelectedVariantId(variant.id)} type="button">{variant.label}</button>)}</div></div> : null}<dl className="mt-7 grid gap-3 border-y border-tipsy-line py-5 text-sm">{details.map(([label, value]) => <div className="flex items-center justify-between gap-4" key={label}><dt className="text-tipsy-muted">{label}</dt><dd className="text-right font-semibold text-tipsy-ink">{value}</dd></div>)}</dl><div className="mt-6 flex items-center gap-4"><div aria-label={t("details.quantity")} className="flex h-12 items-center rounded-xl border border-tipsy-line bg-tipsy-surface p-1"><button aria-label={t("details.decreaseQuantity")} className="flex size-10 items-center justify-center rounded-[10px] transition hover:bg-white" disabled={quantity === 1 || isAdding} onClick={() => setQuantity((current) => Math.max(1, current - 1))} type="button"><StoreIcon className="size-5" name="minus" /></button><span className="w-8 text-center text-sm font-bold">{quantity}</span><button aria-label={t("details.increaseQuantity")} className="flex size-10 items-center justify-center rounded-[10px] bg-white transition hover:bg-tipsy-amber-100 disabled:opacity-40" disabled={isAdding || (product.availableQuantity !== undefined && quantity >= product.availableQuantity)} onClick={() => setQuantity((current) => Math.min(product.availableQuantity ?? current + 1, current + 1))} type="button"><StoreIcon className="size-5" name="plus" /></button></div><button className="h-12 flex-1 rounded-xl bg-tipsy-amber-500 px-5 text-sm font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300 disabled:cursor-not-allowed disabled:opacity-50" disabled={!available || isAdding} onClick={addToCart} type="button">{available ? isAdding ? "Adding…" : t("details.addToCart") : "Out of stock"}</button></div></div>
        </section>
        {similarProducts.length ? <section className="mt-12"><div className="flex items-center justify-between"><h2 className="text-xl font-bold tracking-[-0.035em] sm:text-2xl">{t("details.similarProducts")}</h2><Link className="text-sm font-semibold text-tipsy-muted transition hover:text-tipsy-ink" href="/">{t("seeAll")}</Link></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{similarProducts.map((item) => <ProductCard key={item.id} onAdd={() => { setCartQuantity(item.id, (cart[item.id] ?? 0) + 1); setCartOpen(true); }} onRemove={() => setCartQuantity(item.id, (cart[item.id] ?? 0) - 1)} product={item} quantity={cart[item.id] ?? 0} />)}</div></section> : null}
      </div>
      <StoreFooter />
      <MobileCartToast onContinue={() => setIsMobileCartToastOpen(false)} onViewCart={() => { setIsMobileCartToastOpen(false); setCartOpen(true); }} visible={isMobileCartToastOpen} />
      {cartOpen ? <CartDrawer items={cartItems} onCheckout={proceedToCheckout} onClose={() => setCartOpen(false)} onQuantityChange={setCartQuantity} /> : null}
      {isNavigatingToCheckout ? <div aria-live="polite" className="checkout-route-transition fixed inset-0 z-[100001] grid place-items-center bg-tipsy-ink/30 p-4" role="status"><div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-tipsy-ink shadow-[0_12px_36px_rgba(21,19,15,0.16)]"><span className="size-4 animate-spin rounded-full border-2 border-tipsy-line border-t-tipsy-ink" />Preparing secure checkout</div></div> : null}
    </main>
  );
}
