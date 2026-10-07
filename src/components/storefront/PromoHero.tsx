"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import BeverageImage from "./BeverageImage";
import type { CategoryId } from "./data";
import StoreIcon from "./StoreIcon";

interface PromoHeroProps {
  onShop: (category: CategoryId) => void;
}

interface PromoSlide { category: CategoryId; id: string; imageUrl: string; eyebrow: string; title: string; description: string }

export default function PromoHero({ onShop }: PromoHeroProps) {
  const t = useTranslations("storefront");
  const [slides, setSlides] = useState<PromoSlide[]>([]);
  const [trackIndex, setTrackIndex] = useState(1);
  const [isResetting, setIsResetting] = useState(false);
  const activeSlide = slides.length ? (trackIndex - 1 + slides.length) % slides.length : 0;
  const loopedSlides = slides.length ? [slides[slides.length - 1], ...slides, slides[0]] : [];

  const next = () => setTrackIndex((current) => current + 1);
  const previous = () => setTrackIndex((current) => current - 1);
  const showSlide = (index: number) => setTrackIndex(index + 1);

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/content/home", { cache: "no-store" }).then((response) => response.json()).then((payload) => {
      if (!active || !Array.isArray(payload.data?.banners)) return;
      setSlides(payload.data.banners.map((banner: Record<string, unknown>) => ({
        id: String(banner.key),
        category: String(banner.link_url ?? "/whisky").replace(/^\//, "") as CategoryId,
        imageUrl: String(banner.image_url),
        eyebrow: String((banner.metadata as Record<string, unknown> | undefined)?.eyebrow ?? ""),
        title: String(banner.title ?? ""),
        description: String(banner.body ?? ""),
      })));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (slides.length < 2) return;
    const interval = window.setInterval(next, 8000);
    return () => window.clearInterval(interval);
  }, [slides.length]);

  const resetLoop = () => {
    if (trackIndex !== 0 && trackIndex !== slides.length + 1) return;

    setIsResetting(true);
    setTrackIndex(trackIndex === 0 ? slides.length : 1);
    requestAnimationFrame(() => requestAnimationFrame(() => setIsResetting(false)));
  };

  if (!slides.length) return <div className="min-h-[185px] animate-pulse rounded-[18px] bg-tipsy-surface sm:min-h-[350px]" />;
  return (
    <section aria-label={t("promo.label")} className="relative isolate min-h-[185px] overflow-hidden rounded-[18px] border border-tipsy-line bg-tipsy-ink sm:min-h-[350px]">
      <div className={`flex min-h-[185px] ${isResetting ? "" : "transition-transform duration-500 ease-linear"} sm:min-h-[350px]`} onTransitionEnd={resetLoop} style={{ transform: `translateX(-${trackIndex * 100}%)` }}>
        {loopedSlides.map((slide, index) => <article className="relative min-h-[185px] min-w-full sm:min-h-[350px]" key={`${slide.id}-${index}`}><BeverageImage alt="" className="object-cover object-center" sizes="(min-width: 1440px) 1376px, 100vw" src={slide.imageUrl} /><div className="absolute inset-0 bg-gradient-to-r from-tipsy-ink via-tipsy-ink/75 to-tipsy-ink/5" /><div className="relative z-1 flex min-h-[185px] max-w-xl flex-col justify-end px-5 py-5 sm:min-h-[350px] sm:px-9 sm:py-9"><p className="text-[12px] font-semibold text-tipsy-amber-300 sm:text-[13px]">{slide.eyebrow}</p><h1 className="mt-2 max-w-[240px] text-[25px] font-bold leading-7 tracking-[-0.05em] text-white sm:mt-3 sm:max-w-md sm:text-[42px] sm:leading-normal">{slide.title}</h1><p className="mt-3 hidden max-w-sm text-sm leading-6 text-white/75 sm:block">{slide.description}</p><button className="mt-4 h-10 w-fit rounded-xl bg-tipsy-amber-500 px-4 text-sm font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300 sm:mt-5 sm:h-auto sm:px-5 sm:py-3" onClick={() => onShop(slide.category)} type="button">{t("promo.cta")}</button></div></article>)}
      </div>
      {slides.length > 1 ? <div className="absolute bottom-3 right-3 z-1 flex items-center gap-2 sm:bottom-5 sm:right-5 sm:gap-3"><span className="hidden text-xs font-semibold tracking-[0.18em] text-white/70 sm:block">0{activeSlide + 1} / 0{slides.length}</span><button aria-label={t("promo.previous")} className="flex size-9 items-center justify-center rounded-xl bg-white/90 text-tipsy-ink transition hover:bg-white" onClick={previous} type="button"><StoreIcon className="size-4 rotate-90" name="arrow" /></button><div className="flex gap-1.5">{slides.map((slide, index) => <button aria-label={t("promo.showSlide", { number: index + 1 })} className={`h-1.5 rounded-full ${index === activeSlide ? "w-7 bg-tipsy-amber-500" : "w-2.5 bg-white/60 hover:bg-white"}`} key={slide.id} onClick={() => showSlide(index)} type="button" />)}</div><button aria-label={t("promo.next")} className="flex size-9 items-center justify-center rounded-xl bg-white/90 text-tipsy-ink transition hover:bg-white" onClick={next} type="button"><StoreIcon className="size-4 -rotate-90" name="arrow" /></button></div> : null}
    </section>
  );
}
