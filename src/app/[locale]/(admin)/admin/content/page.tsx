import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import BasicTableOne from "@/components/tables/BasicTableOne";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { sql } from "@/server/db";
import { createContentBlock, setContentActive } from "../actions";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const banners = await sql<{
    id: string;
    key: string;
    title: string | null;
    image_url: string | null;
    link_url: string | null;
    sort_order: number;
    active: boolean;
  }[]>`
    SELECT id, key, title, image_url, link_url, sort_order, active
    FROM content_blocks WHERE kind = 'HERO_BANNER'
    ORDER BY active DESC, sort_order, created_at DESC
  `;

  return <div className="space-y-6">
    <ComponentCard title="Homepage banners" desc="Publish and manage the banners currently shown on the storefront.">
      <form action={createContentBlock} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <input name="kind" type="hidden" value="HERO_BANNER" />
        <Input name="key" placeholder="Banner key (e.g. weekend-offer)" required />
        <Input name="title" placeholder="Banner title" required />
        <Input name="imageUrl" placeholder="Image URL" required />
        <Input name="body" placeholder="Short supporting line (optional)" />
        <Input name="linkUrl" placeholder="Destination URL (optional)" />
        <div className="flex items-center"><Button type="submit">Publish banner</Button></div>
      </form>
    </ComponentCard>

    <BasicTableOne
      title="Storefront banners"
      description="Active banners appear on the storefront. Hidden banners stay saved for later."
      columns={["Preview", "Banner", "Destination", "Position", "Status", "Action"]}
      empty="No banners yet. Publish a banner to feature it on the storefront."
      rows={banners.map((banner) => [
        banner.image_url ? <span key="image" aria-label={`Preview: ${banner.title ?? banner.key}`} className="block h-12 w-20 rounded-lg border border-gray-200 bg-cover bg-center bg-gray-100" role="img" style={{ backgroundImage: `url(${JSON.stringify(banner.image_url)})` }} /> : "No image",
        <span key="title"><span className="block font-medium text-gray-800 dark:text-white/90">{banner.title ?? banner.key}</span><span className="text-xs text-gray-500">{banner.key}</span></span>,
        banner.link_url ?? "—",
        banner.sort_order + 1,
        <Badge key="status" size="sm" color={banner.active ? "success" : "light"}>{banner.active ? "Live" : "Hidden"}</Badge>,
        <form key="toggle" action={setContentActive.bind(null, banner.id, !banner.active)}><Button type="submit" size="sm" variant="outline">{banner.active ? "Hide" : "Publish"}</Button></form>,
      ])}
    />
  </div>;
}
