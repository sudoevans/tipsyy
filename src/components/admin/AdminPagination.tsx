"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@untitledui/icons-react/outline";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
};

export default function AdminPagination({
  page,
  pageCount,
  total,
  pageSize,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  const goTo = (nextPage: number) => {
    if (nextPage < 1 || nextPage > pageCount || nextPage === page) return;
    const next = new URLSearchParams(params.toString());
    next.set("page", String(nextPage));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const pages = Array.from({ length: Math.min(pageCount, 5) }, (_, index) => {
    const start = Math.min(Math.max(page - 2, 1), Math.max(pageCount - 4, 1));
    return start + index;
  });

  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
      <span>
        Showing {from}–{to} of {total}
      </span>
      {pageCount > 1 ? (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            onClick={() => goTo(page - 1)}
            disabled={page <= 1}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          {pages.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => goTo(item)}
              aria-current={item === page ? "page" : undefined}
              className={`inline-flex size-9 items-center justify-center rounded-lg text-sm font-semibold transition ${
                item === page
                  ? "bg-brand-500 text-white"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              {item}
            </button>
          ))}
          <button
            type="button"
            onClick={() => goTo(page + 1)}
            disabled={page >= pageCount}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            aria-label="Next page"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
