import { CheckIcon, Edit01Icon } from "@untitledui/icons-react/outline";
import AdminSelect from "@/components/admin/AdminSelect";
import BrandPicker from "@/components/admin/BrandPicker";
import ProductImageEditor from "@/components/admin/ProductImageEditor";
import VariantManager from "@/components/admin/VariantManager";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { Link } from "@/i18n/navigation";
import { sql } from "@/server/db";
import { notFound } from "next/navigation";
import { updateProduct } from "../../actions";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const [[product], categories, brands, variants] = await Promise.all([
    sql<
      {
        id: string;
        sku: string;
        name: string;
        description: string | null;
        category_id: string;
        brand_id: string | null;
        image_url: string | null;
        featured: boolean;
      }[]
    >`SELECT id,sku,name,description,category_id,brand_id,image_url,featured FROM products WHERE id=${productId}`,
    sql<
      { id: string; name: string }[]
    >`SELECT id,name FROM categories WHERE active=true ORDER BY name`,
    sql<
      { id: string; name: string }[]
    >`SELECT id,name FROM brands WHERE active=true ORDER BY name`,
    sql<
      {
        id: string;
        label: string;
        sku: string;
        price_minor: number;
        cost_price_minor: number;
        active: boolean;
        available: number | null;
      }[]
    >`SELECT v.id,v.label,v.sku,v.price_minor,v.cost_price_minor,v.active,CASE WHEN i.variant_id IS NULL THEN NULL ELSE (i.on_hand_quantity-i.reserved_quantity)::int END AS available FROM product_variants v LEFT JOIN inventory i ON i.variant_id=v.id WHERE v.product_id=${productId} ORDER BY v.is_default DESC,v.label`,
  ]);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/admin/products"
            className="text-sm font-medium text-gray-500 transition hover:text-brand-600"
          >
            ← Back to products
          </Link>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-gray-800 dark:text-white">
            Product details
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Update product information and manage its variants.
          </p>
        </div>
        <Button
          form="product-details-form"
          type="submit"
          startIcon={<CheckIcon className="size-4" />}
          className="h-10 shrink-0 px-4 py-0"
          pendingLabel="Saving changes…"
        >
          Save changes
        </Button>
      </header>
      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <section className="flex rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <ProductImageEditor
            productId={product.id}
            productName={product.name}
            imageUrl={product.image_url}
          />
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <Edit01Icon className="size-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                Basic information
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Enter the main product details.
              </p>
            </div>
          </div>
          <form
            id="product-details-form"
            action={updateProduct.bind(null, product.id)}
            className="mt-6 grid gap-4 sm:grid-cols-2"
          >
            <label>
              <Label>
                Name <span className="text-error-500">*</span>
              </Label>
              <Input
                className="mt-1.5"
                name="name"
                defaultValue={product.name}
                required
              />
            </label>
            <label>
              <Label>Product SKU</Label>
              <Input className="mt-1.5" defaultValue={product.sku} readOnly />
            </label>
            <label>
              <Label>
                Category <span className="text-error-500">*</span>
              </Label>
              <span className="mt-1.5 block">
                <AdminSelect
                  name="categoryId"
                  defaultValue={product.category_id}
                  placeholder="Choose category"
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                />
              </span>
            </label>
            <label>
              <Label>Brand</Label>
              <span className="mt-1.5 block">
                <BrandPicker
                  brands={brands}
                  defaultValue={product.brand_id ?? ""}
                />
              </span>
            </label>
            <label className="sm:col-span-2">
              <Label>Description</Label>
              <textarea
                name="description"
                defaultValue={product.description ?? ""}
                rows={4}
                className="field mt-1.5 resize-none"
                placeholder="Add a short product description"
              />
            </label>
            <label className="flex items-start gap-3 rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
              <input
                type="checkbox"
                name="featured"
                defaultChecked={product.featured}
                className="mt-0.5 size-4 accent-brand-500"
              />
              <span>
                <span className="block font-semibold">Featured product</span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  Highlight this product on the storefront.
                </span>
              </span>
            </label>
          </form>
        </section>
      </div>
      <VariantManager
        productId={product.id}
        variants={variants.map((variant) => ({
          id: variant.id,
          label: variant.label,
          sku: variant.sku,
          priceMinor: variant.price_minor,
          costPriceMinor: variant.cost_price_minor,
          active: variant.active,
          stock: variant.available,
        }))}
      />
    </div>
  );
}
