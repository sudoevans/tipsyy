"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import CartDrawer from "./CartDrawer";
import MobileCartToast from "./MobileCartToast";
import { restoreCartForCheckout, saveCartForCheckout } from "./cartStorage";
import type { CategoryId } from "./data";
import ProductCard from "./ProductCard";
import PromoHero from "./PromoHero";
import SectionHeader from "./SectionHeader";
import StoreFooter from "./StoreFooter";
import StoreHeader from "./StoreHeader";
import StoreIcon from "./StoreIcon";
import useCatalogProducts from "./useCatalogProducts";

export default function StorefrontHome() {
  const router = useRouter();
  const t = useTranslations("storefront");
  const { error: catalogError, isLoading: isCatalogLoading, products } = useCatalogProducts();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileCartToastOpen, setIsMobileCartToastOpen] = useState(false);
  const [isNavigatingToCheckout, setIsNavigatingToCheckout] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | "all">("all");
  const hasRestoredCart = useRef(false);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((product) => {
      const categoryMatches = selectedCategory === "all" || product.category === selectedCategory;
      const queryMatches = !normalizedQuery || (product.name ?? product.id).toLowerCase().includes(normalizedQuery);
      return categoryMatches && queryMatches;
    });
  }, [products, query, selectedCategory]);

  const setQuantity = (productId: string, quantity: number) => setCart((current) => {
    const next = { ...current };
    const stock = products.find((product) => product.id === productId)?.availableQuantity ?? 0;
    if (quantity <= 0) delete next[productId]; else next[productId] = Math.min(quantity, stock);
    return next;
  });
  const addProduct = (productId: string) => {
    const stock = products.find((product) => product.id === productId)?.availableQuantity ?? 0;
    const nextCart = { ...cart, [productId]: Math.min((cart[productId] ?? 0) + 1, stock) };
    setCart(nextCart);
    if (window.matchMedia("(min-width: 640px)").matches) setIsCartOpen(true); else setIsMobileCartToastOpen(true);
  };
  const removeProduct = (productId: string) => setQuantity(productId, (cart[productId] ?? 0) - 1);
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const cartItems = products.filter((product) => cart[product.id]).map((product) => ({ product, quantity: cart[product.id] }));
  const collectionTitle = selectedCategory === "all" ? t("bestSellers") : t(`categories.${selectedCategory}`);
  const selectCategory = (category: CategoryId | "all") => setSelectedCategory(category);
  const proceedToCheckout = () => {
    if (isNavigatingToCheckout) return;
    setIsCartOpen(false);
    setIsMobileCartToastOpen(false);
    setIsNavigatingToCheckout(true);
    saveCartForCheckout(cart);
    router.push("/checkout");
  };

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      hasRestoredCart.current = true;
      void restoreCartForCheckout().then((restored) => { if (active) setCart(restored); });
    });

    return () => { active = false; window.cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    if (hasRestoredCart.current) saveCartForCheckout(cart);
  }, [cart]);

  useEffect(() => {
    if (selectedCategory === "all") return;
    const timer = window.setTimeout(() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => window.clearTimeout(timer);
  }, [selectedCategory]);

  return (
    <main className="min-h-screen bg-tipsy-canvas pb-20 text-tipsy-ink sm:pb-0" id="top">
      <StoreHeader cartCount={cartCount} onCartOpen={() => setIsCartOpen(true)} onCategorySelect={selectCategory} onSearchChange={setQuery} query={query} selectedCategory={selectedCategory} />
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <PromoHero onShop={selectCategory} />
        {isCatalogLoading ? <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div className="h-72 animate-pulse rounded-2xl bg-tipsy-surface" key={index} />)}</div> : catalogError ? <div className="mt-10 rounded-2xl bg-white px-6 py-12 text-center"><p className="text-sm font-semibold">The shop could not be loaded.</p><p className="mt-2 text-sm text-tipsy-muted">{catalogError}</p><button className="mt-5 rounded-xl bg-tipsy-amber-500 px-4 py-2.5 text-sm font-semibold" onClick={() => window.location.reload()} type="button">Try again</button></div> : selectedCategory === "all" ? <section className="mt-10" id="popular"><SectionHeader title={t("popularNearYou")} />{visibleProducts.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{visibleProducts.map((product) => <ProductCard key={product.id} onAdd={() => addProduct(product.id)} onRemove={() => removeProduct(product.id)} product={product} quantity={cart[product.id] ?? 0} />)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-tipsy-line bg-white px-6 py-12 text-center text-sm text-tipsy-muted">{t("noResults")}</div>}</section> : <section className="mt-10" id="catalog"><SectionHeader action={t("clearFilters")} onAction={() => selectCategory("all")} title={collectionTitle} /><div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar"><button className="shrink-0 rounded-full bg-tipsy-ink px-3 py-2 text-xs font-semibold text-white" type="button">{t(`categories.${selectedCategory}`)}</button><button className="shrink-0 rounded-full border border-tipsy-line bg-white px-3 py-2 text-xs font-semibold text-tipsy-ink transition hover:bg-tipsy-surface" type="button">{t("filter.price")}</button><button className="shrink-0 rounded-full border border-tipsy-line bg-white px-3 py-2 text-xs font-semibold text-tipsy-ink transition hover:bg-tipsy-surface" type="button">{t("filter.brand")}</button></div>{visibleProducts.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{visibleProducts.map((product) => <ProductCard key={product.id} onAdd={() => addProduct(product.id)} onRemove={() => removeProduct(product.id)} product={product} quantity={cart[product.id] ?? 0} />)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-tipsy-line bg-white px-6 py-12 text-center text-sm text-tipsy-muted">{t("noResults")}</div>}</section>}
      </div>
      <StoreFooter />
      <nav aria-label={t("mobileNavigation")} className="fixed inset-x-0 bottom-0 z-99 grid grid-cols-4 border-t border-tipsy-line bg-white px-3 py-2 sm:hidden"><Link className="flex flex-col items-center gap-1 text-[10px] font-semibold text-tipsy-ink" href="/"><span className="flex size-7 items-center justify-center rounded-lg bg-tipsy-amber-500"><StoreIcon className="size-4" name="location" /></span>{t("mobileNav.home")}</Link><button className="flex flex-col items-center gap-1 text-[10px] text-tipsy-muted" onClick={() => (document.querySelector('input[type="search"]') as HTMLInputElement | null)?.focus()} type="button"><StoreIcon className="size-5" name="search" />{t("mobileNav.search")}</button><Link className="flex flex-col items-center gap-1 text-[10px] text-tipsy-muted" href="/orders"><StoreIcon className="size-5" name="bag" />{t("mobileNav.orders")}</Link><Link className="flex flex-col items-center gap-1 text-[10px] text-tipsy-muted" href="/account"><StoreIcon className="size-5" name="user" />{t("mobileNav.profile")}</Link></nav>
      <MobileCartToast onContinue={() => setIsMobileCartToastOpen(false)} onViewCart={() => { setIsMobileCartToastOpen(false); setIsCartOpen(true); }} visible={isMobileCartToastOpen} />
      {isCartOpen ? <CartDrawer items={cartItems} onCheckout={proceedToCheckout} onClose={() => setIsCartOpen(false)} onQuantityChange={setQuantity} /> : null}
      {isNavigatingToCheckout ? <div aria-live="polite" className="checkout-route-transition fixed inset-0 z-[100001] grid place-items-center bg-tipsy-ink/30 p-4" role="status"><div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-tipsy-ink shadow-[0_12px_36px_rgba(21,19,15,0.16)]"><span className="size-4 animate-spin rounded-full border-2 border-tipsy-line border-t-tipsy-ink" />Opening checkout…</div></div> : null}
    </main>
  );
}
