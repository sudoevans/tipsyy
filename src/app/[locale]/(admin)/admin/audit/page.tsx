import type { ReactNode } from "react";
import Input from "@/components/form/input/InputField";
import BasicTableOne from "@/components/tables/BasicTableOne";
import Button from "@/components/ui/button/Button";
import { sql } from "@/server/db";

export const dynamic = "force-dynamic";

const privateField = /password|secret|token|credential|authorization|hash|phone|email|address|ip/i;

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return "Updated";
  return String(value);
}

function AuditDetails({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return <span className="text-xs text-gray-500">{formatValue(metadata)}</span>;
  }
  const entries = Object.entries(metadata as Record<string, unknown>).filter(([key]) => !privateField.test(key));
  if (!entries.length) return <span className="text-xs text-gray-400">No public details</span>;
  return <dl className="grid min-w-44 gap-1 text-xs">
    {entries.slice(0, 6).map(([key, value]) => {
      const beforeAfter = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
      const description = beforeAfter && ("before" in beforeAfter || "after" in beforeAfter)
        ? `${formatValue(beforeAfter.before)} → ${formatValue(beforeAfter.after)}`
        : formatValue(value);
      return <div className="flex flex-wrap gap-x-1" key={key}>
        <dt className="font-medium text-gray-600 dark:text-gray-300">{humanize(key)}:</dt>
        <dd className="break-words text-gray-500 dark:text-gray-400">{description}</dd>
      </div>;
    })}
    {entries.length > 6 ? <p className="text-gray-400">+{entries.length - 6} more changes</p> : null}
  </dl>;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const logs = await sql<{
    display_name: string | null;
    username: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    metadata: unknown;
    created_at: Date;
  }[]>`
    SELECT u.display_name, u.username, l.action, l.entity_type, l.entity_id, l.metadata, l.created_at
    FROM admin_activity_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    WHERE (${q} = '' OR l.action ILIKE ${`%${q}%`} OR l.entity_type ILIKE ${`%${q}%`} OR u.username ILIKE ${`%${q}%`})
    ORDER BY l.created_at DESC LIMIT 250
  `;

  const rows: ReactNode[][] = logs.map((log) => [
    log.created_at.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }),
    log.display_name ?? log.username ?? "System",
    humanize(log.action),
    humanize(log.entity_type),
    log.entity_id ?? "—",
    <AuditDetails key={`${log.action}-${log.entity_id ?? "none"}-${log.created_at.toISOString()}`} metadata={log.metadata} />,
  ]);

  return <BasicTableOne
    title="Activity logs & audit trail"
    description="A searchable record of administrative changes."
    actions={<form className="flex gap-2"><Input name="q" defaultValue={q} placeholder="Search actions" /><Button type="submit" size="sm" variant="outline">Search</Button></form>}
    columns={["When", "Staff", "Action", "Entity", "Record", "Changes"]}
    empty="Administrative changes will be recorded here."
    rows={rows}
    noHorizontalScroll
  />;
}
