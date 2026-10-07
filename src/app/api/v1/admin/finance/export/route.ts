import { NextRequest } from "next/server";
import { sql } from "@/server/db";
import { apiErrorResponse } from "@/server/http";
import { requireAdmin } from "@/server/request-auth";

function escapeXml(value: unknown) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const startInput = request.nextUrl.searchParams.get("start");
    const endInput = request.nextUrl.searchParams.get("end");
    const filters = { start: validDate(startInput), end: validDate(endInput) };
    const today = new Date().toISOString().slice(0, 10);
    if ((startInput && !filters.start) || (endInput && !filters.end) || (filters.start && filters.start > today) || (filters.end && filters.end > today) || (filters.start && filters.end && filters.start > filters.end)) return Response.json({ error: { code: "INVALID_REPORTING_PERIOD", message: "Choose a valid completed reporting period." } }, { status: 400 });
    const rows = await sql<{order_number:string;paid_at:Date;customer_name:string;subtotal_minor:number;discount_minor:number;delivery_fee_minor:number;total_minor:number;refund_minor:number;cost_minor:number}[]>`
      SELECT o.order_number,o.paid_at,o.customer_name,o.subtotal_minor,o.discount_minor,o.delivery_fee_minor,o.total_minor,
        COALESCE((SELECT SUM(p.refunded_minor) FROM payments p WHERE p.order_id=o.id),0)::int AS refund_minor,
        COALESCE((SELECT SUM(oi.quantity*pv.cost_price_minor) FROM order_items oi LEFT JOIN product_variants pv ON pv.id=oi.variant_id WHERE oi.order_id=o.id),0)::int AS cost_minor
      FROM orders o WHERE o.paid_at IS NOT NULL
        AND (${filters.start}::date IS NULL OR o.paid_at::date >= ${filters.start}::date)
        AND (${filters.end}::date IS NULL OR o.paid_at::date <= ${filters.end}::date)
      ORDER BY o.paid_at DESC`;
    const headings = ["Order","Paid at","Customer","Gross sales","Discount","Delivery revenue","Net collected","Refund","Purchase cost","Gross profit"];
    const values: (string|number)[][] = [headings,...rows.map(r=>[r.order_number,r.paid_at.toISOString(),r.customer_name,r.subtotal_minor,r.discount_minor,r.delivery_fee_minor,r.total_minor,r.refund_minor,r.cost_minor,r.total_minor-r.refund_minor-r.cost_minor])];
    const xmlRows = values.map((row,rowIndex)=>`<Row>${row.map(value=>`<Cell><Data ss:Type="${rowIndex===0||typeof value==="string"?"String":"Number"}">${escapeXml(value)}</Data></Cell>`).join("")}</Row>`).join("");
    const body = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Financial report"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
    return new Response(body,{headers:{"content-type":"application/vnd.ms-excel; charset=utf-8","content-disposition":`attachment; filename="tipsy-financial-report-${new Date().toISOString().slice(0,10)}.xls"`}});
  } catch (error) {
    return apiErrorResponse(error);
  }
}
