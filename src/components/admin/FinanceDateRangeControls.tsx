"use client";

import { CalendarIcon } from "@untitledui/icons-react/outline";
import { useAdminToast } from "./AdminToast";
import { DateField, DateRangePicker, Label, RangeCalendar } from "@heroui/react";
import { CalendarDate, getLocalTimeZone, parseDate, today as calendarToday } from "@internationalized/date";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Range = { start: CalendarDate; end: CalendarDate } | null;

function toRange(start: string, end: string): Range {
  return start && end ? { start: parseDate(start), end: parseDate(end) } : null;
}

export default function FinanceDateRangeControls({ start: initialStart, end: initialEnd, notice: initialNotice = "" }: { start: string; end: string; notice?: string }) {
  const router = useRouter();
  const { showToast } = useAdminToast();
  const maximum = useMemo(() => calendarToday(getLocalTimeZone()), []);
  const [range, setRange] = useState<Range>(() => toRange(initialStart, initialEnd));

  useEffect(() => {
    if (initialNotice) showToast({ title: "Reporting period needs attention", description: initialNotice, tone: "error" });
  }, [initialNotice, showToast]);

  function navigate(nextRange: Range) {
    if (!nextRange) return router.push("/admin/finance");
    router.push(`/admin/finance?${new URLSearchParams({ start: nextRange.start.toString(), end: nextRange.end.toString() })}`);
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!range) return showToast({ title: "Choose a reporting period", description: "Select both a start and end date.", tone: "error" });
    if (range.start.compare(range.end) > 0) return showToast({ title: "Invalid reporting period", description: "The start date must be on or before the end date.", tone: "error" });
    if (range.end.compare(maximum) > 0) return showToast({ title: "Future dates aren’t available", description: "Choose a completed reporting period.", tone: "error" });
    navigate(range);
  }

  function selectRange(days: number | "month" | "today") {
    const start = days === "month" ? maximum.set({ day: 1 }) : days === "today" ? maximum : maximum.subtract({ days: days - 1 });
    const nextRange = { start, end: maximum };
    setRange(nextRange);
    navigate(nextRange);
  }

  return <form className="finance-date-picker" onSubmit={apply}>
    <div className="flex flex-wrap items-end gap-2.5">
      <DateRangePicker aria-label="Reporting period" className="relative shrink-0" maxValue={maximum} onChange={(value) => setRange(value as Range)} value={range}>
        <Label className="mb-1 block text-xs font-medium text-gray-500">Reporting period</Label>
        <DateField.Group className="flex h-10 min-w-[278px] items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 shadow-theme-xs outline-none transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
          <DateField.InputContainer className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            <DateField.Input className="flex min-w-0 items-center" slot="start">{(segment) => <DateField.Segment className="rounded px-0.5 text-sm outline-none data-[type=literal]:text-gray-400 focus:bg-brand-50 focus:text-brand-700" segment={segment} />}</DateField.Input>
            <DateRangePicker.RangeSeparator className="px-1 text-gray-400">–</DateRangePicker.RangeSeparator>
            <DateField.Input className="flex min-w-0 items-center" slot="end">{(segment) => <DateField.Segment className="rounded px-0.5 text-sm outline-none data-[type=literal]:text-gray-400 focus:bg-brand-50 focus:text-brand-700" segment={segment} />}</DateField.Input>
          </DateField.InputContainer>
          <DateField.Suffix className="ml-1 flex shrink-0 items-center"><DateRangePicker.Trigger aria-label="Open reporting calendar" className="grid size-8 shrink-0 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"><CalendarIcon className="size-4 shrink-0" strokeWidth={2} /></DateRangePicker.Trigger></DateField.Suffix>
        </DateField.Group>
        <DateRangePicker.Popover className="z-50 mt-2 rounded-xl border border-gray-200 bg-white p-3 shadow-xl" placement="bottom start">
          <RangeCalendar aria-label="Choose reporting dates" className="w-[286px]" maxValue={maximum} visibleDuration={{ months: 1 }}>
            <RangeCalendar.Header className="mb-3 flex items-center justify-between"><RangeCalendar.NavButton className="grid size-8 place-items-center rounded-lg text-gray-600 transition hover:bg-gray-100" slot="previous" /><RangeCalendar.Heading className="text-sm font-semibold text-gray-800" /><RangeCalendar.NavButton className="grid size-8 place-items-center rounded-lg text-gray-600 transition hover:bg-gray-100" slot="next" /></RangeCalendar.Header>
            <RangeCalendar.Grid className="w-full border-collapse" weekdayStyle="short"><RangeCalendar.GridHeader>{(weekday) => <RangeCalendar.HeaderCell className="h-8 text-center text-[11px] font-medium text-gray-400">{weekday}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader><RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell className="h-9 w-9 rounded-lg text-center text-sm text-gray-700 outline-none transition data-[selected]:bg-brand-500 data-[selected]:text-white data-[selection-start]:rounded-l-lg data-[selection-end]:rounded-r-lg data-[disabled]:text-gray-300" date={date} />}</RangeCalendar.GridBody></RangeCalendar.Grid>
          </RangeCalendar>
        </DateRangePicker.Popover>
      </DateRangePicker>
      <div className="flex flex-wrap self-end gap-1.5"><button className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600" onClick={() => selectRange("today")} type="button">Today</button><button className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600" onClick={() => selectRange(7)} type="button">7D</button><button className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600" onClick={() => selectRange(30)} type="button">30D</button><button className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600" onClick={() => selectRange("month")} type="button">This month</button><button className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600" onClick={() => { setRange(null); navigate(null); }} type="button">All time</button></div>
      <button className="h-9 self-end rounded-lg bg-brand-500 px-3.5 text-sm font-medium text-white transition hover:bg-brand-600" type="submit">Apply</button>
    </div>
  </form>;
}
