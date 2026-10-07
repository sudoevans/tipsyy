"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import BeverageImage from "./BeverageImage";
import { formatPrice } from "./currency";
import StoreIcon from "./StoreIcon";
import useCatalogProducts from "./useCatalogProducts";

interface SearchBarProps {
  className?: string;
  onSearchChange: (query: string) => void;
  query: string;
}

export default function SearchBar({ className = "", onSearchChange, query }: SearchBarProps) {
  const t = useTranslations("storefront");
  const { products } = useCatalogProducts();
  const [isOpen, setIsOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return products.slice(0, 6);
    return products.filter((product) => (product.name ?? "").toLowerCase().includes(normalizedQuery) || t(`categories.${product.category}`).toLowerCase().includes(normalizedQuery)).slice(0, 8);
  }, [products, query, t]);

  useEffect(() => {
    if (isOpen) window.setTimeout(() => searchInput.current?.focus(), 0);
  }, [isOpen]);

  const close = () => setIsOpen(false);
  const updateQuery = (value: string) => onSearchChange(value);
  const heading = query.trim() ? t("searchMatches") : t("popularProducts");

  return (
    <div className={className}>
      <label className="flex h-11 items-center gap-3 rounded-xl border border-tipsy-line bg-white px-4 text-tipsy-muted transition focus-within:border-tipsy-amber-500">
        <StoreIcon className="size-5 shrink-0" name="search" />
        <input aria-label={t("searchLabel")} className="w-full bg-transparent text-sm text-tipsy-ink outline-none placeholder:text-tipsy-muted" onFocus={() => setIsOpen(true)} placeholder={t("searchPlaceholder")} readOnly type="search" value={query} />
      </label>
      {isOpen ? <div className="fixed inset-0 z-99999 bg-tipsy-ink/45" role="dialog">
        <button aria-label={t("closeSearch")} className="absolute inset-0" onClick={close} type="button" />
        <div className="absolute left-1/2 top-4 max-h-[calc(100vh-32px)] w-[calc(100%-32px)] max-w-[1040px] -translate-x-1/2 overflow-y-auto rounded-2xl border border-tipsy-line bg-white shadow-[0_8px_28px_rgba(21,19,15,0.08)] sm:top-20 sm:max-h-[calc(100vh-160px)]">
          <div className="sticky top-0 z-1 border-b border-tipsy-line bg-white p-3 sm:p-4"><label className="flex h-12 items-center gap-3 rounded-xl bg-tipsy-surface px-4 text-tipsy-muted focus-within:ring-2 focus-within:ring-tipsy-amber-500"><StoreIcon className="size-5 shrink-0" name="search" /><input aria-label={t("searchLabel")} className="w-full bg-transparent text-sm text-tipsy-ink outline-none placeholder:text-tipsy-muted" onChange={(event) => updateQuery(event.target.value)} placeholder={t("searchPlaceholder")} ref={searchInput} type="search" value={query} /></label></div>
          <div className="p-4 sm:p-7"><h2 className="text-sm font-semibold text-tipsy-muted">{heading}</h2>{matches.length ? <div className="mt-4 grid gap-1 md:grid-cols-2 md:gap-x-8">{matches.map((product) => <Link className="group flex items-center gap-3 rounded-xl p-2 transition duration-150 hover:bg-tipsy-amber-50 focus-visible:bg-tipsy-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tipsy-amber-500" href={`/products/${product.id}`} key={product.id} onClick={close}>
            <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-tipsy-surface"><BeverageImage alt="" className="object-contain p-1 transition duration-150 group-hover:scale-105" sizes="44px" src={product.imageUrl} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-tipsy-ink transition group-hover:text-tipsy-amber-700">{product.name}</span><span className="mt-0.5 block text-xs text-tipsy-muted">{product.size} · {formatPrice(product.price)}</span></span><StoreIcon className="size-4 shrink-0 -rotate-90 text-tipsy-ink opacity-0 transition duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:translate-x-0.5 group-focus-visible:opacity-100" name="arrow" />
          </Link>)}</div> : <p className="py-10 text-center text-sm text-tipsy-muted">{t("noSuggestions")}</p>}</div>
        </div>
      </div> : null}
    </div>
  );
}
