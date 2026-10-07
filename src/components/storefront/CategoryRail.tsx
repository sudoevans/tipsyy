import { useTranslations } from "next-intl";
import BeverageImage from "./BeverageImage";
import { categories, type CategoryId } from "./data";

interface CategoryRailProps {
  onSelect: (category: CategoryId) => void;
  selectedCategory: CategoryId | "all";
}

export default function CategoryRail({ onSelect, selectedCategory }: CategoryRailProps) {
  const t = useTranslations("storefront");

  return (
    <section aria-labelledby="categories-heading">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold tracking-[-0.035em] text-tipsy-ink sm:text-2xl" id="categories-heading">{t("categoryTitle")}</h2><button className="text-sm font-semibold text-tipsy-muted transition hover:text-tipsy-ink" onClick={() => onSelect("whisky")} type="button">{t("seeAll")}</button></div>
      <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar sm:gap-4">
        {categories.map((category) => {
          const active = selectedCategory === category.id;
          return <button className="group min-w-[140px] text-left sm:min-w-[152px]" key={category.id} onClick={() => onSelect(category.id)} type="button">
            <span className={`relative block h-[104px] overflow-hidden rounded-[14px] bg-tipsy-surface transition duration-[180ms] sm:h-[116px] ${active ? "ring-2 ring-tipsy-amber-500 ring-offset-2 ring-offset-tipsy-canvas" : "group-hover:shadow-tipsy-card"}`}><BeverageImage alt="" className="object-cover transition duration-[180ms] group-hover:scale-[1.02]" sizes="152px" src={category.imageUrl} /></span>
            <span className={`block pt-2 text-sm font-semibold transition ${active ? "text-tipsy-ink" : "text-tipsy-ink group-hover:text-tipsy-amber-700"}`}>{t(`categories.${category.id}`)}</span>
          </button>;
        })}
      </div>
    </section>
  );
}
