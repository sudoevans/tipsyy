"use client";

import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });
const compactMoney = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", notation: "compact", maximumFractionDigits: 1 });
const axisDate = new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric" });

type TrendPoint = { date: string; revenue: number; expenses: number; profit: number };

export default function FinanceCharts({ trend, productRevenue, deliveryRevenue }: { trend: TrendPoint[]; productRevenue: number; deliveryRevenue: number }) {
  const hasTrend = trend.some((point) => point.revenue || point.expenses || point.profit);
  const hasRevenueSplit = productRevenue > 0 || deliveryRevenue > 0;
  const categories = trend.map((point) => axisDate.format(new Date(`${point.date}T00:00:00`)));
  const trendOptions: ApexOptions = {
    chart: { type: "area", height: 274, fontFamily: "Geist, sans-serif", toolbar: { show: false }, zoom: { enabled: false } },
    colors: ["#465fff", "#ef4444", "#16a34a"],
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2.5 },
    fill: { type: "gradient", gradient: { opacityFrom: 0.18, opacityTo: 0.01 } },
    grid: { borderColor: "#edf0f5", strokeDashArray: 3, padding: { left: 0, right: 0 } },
    legend: { position: "top", horizontalAlign: "left", fontSize: "12px", fontWeight: 500, markers: { size: 6 }, itemMargin: { horizontal: 12 } },
    xaxis: { categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { colors: "#98a2b3", fontSize: "11px" }, rotate: 0, hideOverlappingLabels: true } },
    yaxis: { labels: { formatter: (value) => compactMoney.format(value), style: { colors: "#98a2b3", fontSize: "11px" } } },
    tooltip: { y: { formatter: (value) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value) } },
  };
  const splitOptions: ApexOptions = {
    chart: { type: "donut", fontFamily: "Geist, sans-serif" },
    labels: ["Product revenue", "Delivery revenue"],
    colors: ["#465fff", "#8b5cf6"],
    dataLabels: { enabled: false },
    legend: { position: "bottom", fontSize: "12px", fontWeight: 500, markers: { size: 7 }, itemMargin: { horizontal: 10, vertical: 3 } },
    stroke: { width: 4, colors: ["#fff"] },
    plotOptions: { pie: { donut: { size: "70%", labels: { show: true, total: { show: true, label: "Revenue", formatter: () => compactMoney.format(productRevenue + deliveryRevenue) }, value: { show: false } } } } },
    tooltip: { y: { formatter: (value) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value) } },
  };

  return <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
    <article className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"><div><h2 className="text-lg font-semibold text-gray-800">Revenue, expenses & profit</h2><p className="mt-1 text-sm text-gray-500">Daily financial movement for the selected reporting period.</p></div>{hasTrend ? <Chart options={trendOptions} series={[{ name: "Revenue", data: trend.map((point) => point.revenue) }, { name: "Expenses", data: trend.map((point) => point.expenses) }, { name: "Profit", data: trend.map((point) => point.profit) }]} type="area" height={274} /> : <EmptyChartState text="No financial activity exists for this reporting period." />}</article>
    <article className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold text-gray-800">Revenue mix</h2><p className="mt-1 text-sm text-gray-500">Product sales compared with delivery fees.</p>{hasRevenueSplit ? <Chart options={splitOptions} series={[productRevenue, deliveryRevenue]} type="donut" height={274} /> : <EmptyChartState text="Revenue mix will appear after the first paid order." />}</article>
  </section>;
}

function EmptyChartState({ text }: { text: string }) {
  return <div className="grid h-[274px] place-items-center"><div className="max-w-xs text-center"><div className="mx-auto grid size-11 place-items-center rounded-full bg-gray-50 text-lg text-gray-400">—</div><p className="mt-3 text-sm font-medium text-gray-700">Nothing to show yet</p><p className="mt-1 text-sm leading-6 text-gray-500">{text}</p></div></div>;
}
