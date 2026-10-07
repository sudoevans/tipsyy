"use client";

import {
  ChevronDownIcon,
  XCloseIcon,
} from "@untitledui/icons-react/outline";
import { useEffect, useMemo, useRef, useState } from "react";

type Brand = { id: string; name: string };

export default function BrandPicker({
  brands,
  defaultValue = "",
  name = "brandId",
}: {
  brands: Brand[];
  defaultValue?: string;
  name?: string;
}) {
  const selected = brands.find((brand) => brand.id === defaultValue);
  const root = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const matches = useMemo(
    () =>
      brands
        .filter((brand) =>
          brand.name.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 6),
    [brands, query],
  );

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const choose = (brand?: Brand) => {
    setValue(brand?.id ?? "");
    setQuery(brand?.name ?? "");
    setOpen(false);
  };
  const clear = () => {
    setValue("");
    setQuery("");
    setOpen(true);
  };

  return (
    <div ref={root} className="relative">
      <input name={name} type="hidden" value={value} />
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setValue("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search brands"
        className="field pr-9"
        role="combobox"
        aria-expanded={open}
        aria-controls="brand-options"
        aria-autocomplete="list"
        aria-label="Search brands"
      />
      <button
        type="button"
        onClick={() => (query ? clear() : setOpen((isOpen) => !isOpen))}
        className="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded p-1 text-gray-400 transition hover:text-gray-700"
        aria-label={query ? "Clear brand" : "Show brands"}
      >
        {query ? (
          <XCloseIcon className="size-4" />
        ) : (
          <ChevronDownIcon className="size-4" />
        )}
      </button>
      {open ? (
        <div
          id="brand-options"
          role="listbox"
          className="absolute top-full z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-theme-md dark:border-gray-700 dark:bg-gray-900"
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onClick={() => choose()}
            className="block w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            No brand
          </button>
          {matches.map((brand) => (
            <button
              type="button"
              role="option"
              aria-selected={value === brand.id}
              onClick={() => choose(brand)}
              key={brand.id}
              className="block w-full truncate px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 dark:text-white dark:hover:bg-white/5"
            >
              {brand.name}
            </button>
          ))}
          {!matches.length ? (
            <p className="px-3 py-2 text-sm text-gray-500">
              No stored brands match.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
