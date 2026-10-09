"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import BeverageImage from "./BeverageImage";
import { formatPrice } from "./currency";
import type { StoreProduct } from "./data";
import StoreIcon from "./StoreIcon";

interface ProductCardProps {
  onAdd: () => void | Promise<void>;
  onRemove: () => void;
  product: StoreProduct;
  quantity: number;
}

export default function ProductCard({ onAdd, onRemove, product, quantity }: ProductCardProps) {
  const t = useTranslations("storefront");
  const [isSaved, setIsSaved] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const name = product.name ?? t(`products.${product.id}.name`);
  const available = product.available ?? true;
  const atStockLimit = product.availableQuantity !== undefined && quantity >= product.availableQuantity;
  const stockLabel = product.availableQuantity === 0
    ? t("outOfStock")
    : product.availableQuantity !== undefined && product.availableQuantity <= 3
      ? t("stockRemaining", { count: product.availableQuantity })
      : t("inStock");
  const handleAdd = async () => {
    if (isAdding) return;
    setIsAdding(true);
    try { await onAdd(); } finally { setIsAdding(false); }
  };

  return (
    <article className="group relative min-w-0">
      <div className="relative h-40 overflow-hidden rounded-[14px] border border-tipsy-line/70 bg-tipsy-surface sm:h-52 lg:h-60">
        <Link aria-label={name} className="absolute inset-0 cursor-pointer" href={`/products/${product.id}`}><BeverageImage alt={name} className="object-contain p-4 transition duration-[180ms] group-hover:scale-[1.02] sm:p-5" sizes="(min-width: 1280px) 250px, (min-width: 640px) 31vw, 46vw" src={product.imageUrl} /></Link>
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {product.badge ? <span className="rounded-full bg-tipsy-amber-500 px-2.5 py-1 text-[11px] font-semibold text-tipsy-ink">{t(`badges.${product.badge}`)}</span> : <span />}
          <button aria-label={t("saveProduct", { product: name })} aria-pressed={isSaved} className={`flex size-9 items-center justify-center rounded-xl border border-tipsy-line bg-white/90 transition hover:bg-tipsy-amber-50 ${isSaved ? "text-tipsy-amber-700" : "text-tipsy-ink"}`} onClick={() => setIsSaved((saved) => !saved)} type="button"><StoreIcon className="size-4" name="heart" /></button>
        </div>
      </div>
      <div className="px-1 pt-3">
        <Link className="block min-h-10 cursor-pointer text-[15px] font-semibold leading-5 text-tipsy-ink transition hover:text-tipsy-amber-700" href={`/products/${product.id}`}><h3 className="line-clamp-2">{name}</h3></Link>
        <p className="mt-1 min-h-5 text-[13px] text-tipsy-muted">{t(`categories.${product.category}`)}{product.size ? ` · ${product.size}` : ""}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div><p className="text-[16px] font-bold tracking-[-0.025em] text-tipsy-ink">{formatPrice(product.price)}</p><p className={`mt-1 text-xs font-medium ${product.availableQuantity === 0 ? "text-red-700" : "text-tipsy-muted"}`}>{stockLabel}</p></div>
          {available ? quantity ? <div aria-label={t("quantityFor", { product: name, quantity })} className="flex h-10 items-center rounded-xl border border-tipsy-line bg-tipsy-surface p-0.5">
            <button aria-label={t("removeOne", { product: name })} className="flex size-9 items-center justify-center rounded-[10px] text-tipsy-ink transition hover:bg-white" onClick={onRemove} type="button"><StoreIcon className="size-4" name="minus" /></button>
            <span className="w-6 text-center text-xs font-bold">{quantity}</span>
            <button aria-label={t("addProduct", { product: name })} className="flex size-9 items-center justify-center rounded-[10px] bg-tipsy-amber-500 text-tipsy-ink transition hover:bg-tipsy-amber-300 disabled:cursor-not-allowed disabled:opacity-40" disabled={atStockLimit || isAdding} onClick={() => void handleAdd()} type="button">{isAdding ? <span className="size-3 animate-spin rounded-full border-2 border-tipsy-ink/30 border-t-tipsy-ink" /> : <StoreIcon className="size-4" name="plus" />}</button>
          </div> : <>
            <button aria-label={t("addProduct", { product: name })} className="hidden h-10 min-w-28 items-center justify-center rounded-xl bg-tipsy-amber-500 px-4 text-xs font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300 disabled:cursor-not-allowed disabled:opacity-50 sm:flex" disabled={isAdding} onClick={() => void handleAdd()} type="button">{isAdding ? "Adding…" : t("details.addToCart")}</button>
            <button aria-label={t("addProduct", { product: name })} className="flex size-9 items-center justify-center rounded-xl bg-tipsy-amber-500 text-tipsy-ink transition hover:bg-tipsy-amber-300 disabled:cursor-not-allowed disabled:opacity-50 sm:hidden" disabled={isAdding} onClick={() => void handleAdd()} type="button">{isAdding ? <span className="size-3 animate-spin rounded-full border-2 border-tipsy-ink/30 border-t-tipsy-ink" /> : <StoreIcon className="size-5" name="plus" />}</button>
          </> : <span className="rounded-lg bg-tipsy-surface px-2.5 py-2 text-[11px] font-semibold text-tipsy-muted">Out of stock</span>}
        </div>
      </div>
    </article>
  );
}
