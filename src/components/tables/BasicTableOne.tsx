"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";

export default function BasicTableOne({
  title,
  description,
  columns,
  rows,
  empty,
  actions,
  pagination = true,
  pageSize = 10,
  footer,
  noHorizontalScroll = false,
}: {
  title?: string;
  description?: string;
  columns: string[];
  rows: ReactNode[][];
  empty: string;
  actions?: ReactNode;
  pagination?: boolean;
  pageSize?: number;
  footer?: ReactNode;
  noHorizontalScroll?: boolean;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = pagination
    ? rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : rows;
  const hasHeading = Boolean(title || description);
  const cellLayout = noHorizontalScroll
    ? "whitespace-normal break-words align-top"
    : "whitespace-nowrap";

  return (
    <div className="space-y-5">
      {hasHeading || actions ? (
        <div
          className={`flex flex-col gap-4 sm:flex-row sm:items-end ${hasHeading ? "sm:justify-between" : "sm:justify-end"}`}
        >
          {hasHeading ? (
            <div>
              {title ? (
                <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
                  {title}
                </h1>
              ) : null}
              {description ? (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {description}
                </p>
              ) : null}
            </div>
          ) : null}
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
        {rows.length ? (
          <div
            className={
              noHorizontalScroll ? "w-full" : "max-w-full overflow-x-auto"
            }
          >
            <Table
              className={noHorizontalScroll ? "w-full table-fixed" : undefined}
            >
              <TableHeader className="border-b border-gray-100 dark:border-white/5">
                <TableRow>
                  {columns.map((column) => (
                    <TableCell
                      key={column}
                      isHeader
                      className={`px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400 ${cellLayout}`}
                    >
                      {column}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
                {visibleRows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <TableCell
                        key={cellIndex}
                        className={`px-4 py-4 text-start text-theme-sm text-gray-500 dark:text-gray-400 ${cellLayout}`}
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400">
            {empty}
          </div>
        )}
        {footer ??
          (pagination && rows.length > pageSize ? (
            <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-3 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:border-white/5 dark:text-gray-400">
              <span>
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, rows.length)} of {rows.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                  className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  Previous
                </button>
                <span className="text-xs font-medium">
                  {currentPage} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                  disabled={currentPage === pageCount}
                  className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null)}
      </div>
    </div>
  );
}
