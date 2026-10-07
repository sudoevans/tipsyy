"use client";

import { ChevronDownIcon, SearchLgIcon } from "@untitledui/icons-react/outline";
import { useEffect, useMemo, useRef, useState } from "react";

export type AdminSelectOption = { value: string; label: string };

type Props = {
  options: AdminSelectOption[];
  value?: string;
  defaultValue?: string;
  name?: string;
  placeholder: string;
  searchable?: boolean;
  className?: string;
  onValueChange?: (value: string) => void;
};

export default function AdminSelect({
  options,
  value,
  defaultValue = "",
  name,
  placeholder,
  searchable = false,
  className = "",
  onValueChange,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [selectedValue, setSelectedValue] = useState(value ?? defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === selectedValue);
  const matches = useMemo(
    () =>
      searchable
        ? options.filter((option) =>
            option.label.toLowerCase().includes(query.toLowerCase()),
          )
        : options,
    [options, query, searchable],
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

  const choose = (nextValue: string) => {
    setSelectedValue(nextValue);
    setOpen(false);
    setQuery("");
    onValueChange?.(nextValue);
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <input name={name} type="hidden" value={selectedValue} />
      <button
        type="button"
        onClick={() => {
          setOpen((isOpen) => !isOpen);
          setQuery("");
        }}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 text-left text-sm font-medium text-gray-700 transition outline-none hover:border-gray-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={`truncate ${selected ? "" : "text-gray-400"}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute top-full z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-theme-md dark:border-gray-700 dark:bg-gray-900"
        >
          {searchable ? (
            <label className="relative mb-1 block">
              <SearchLgIcon className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search…"
                className="h-9 w-full rounded-md border border-gray-200 bg-white py-2 pr-3 pl-9 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          ) : null}
          {matches.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={selectedValue === option.value}
              key={option.value}
              onClick={() => choose(option.value)}
              className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-white/5 ${selectedValue === option.value ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-gray-700 dark:text-gray-200"}`}
            >
              {option.label}
            </button>
          ))}
          {!matches.length ? (
            <p className="px-3 py-2 text-sm text-gray-500">
              No matching options.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
