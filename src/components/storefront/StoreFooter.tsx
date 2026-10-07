"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

const paymentLogos = [
  { alt: "Safaricom", src: "/images/payment/safaricom.svg", width: 620, height: 145 },
  { alt: "M-Pesa", src: "/images/payment/mpesa.svg", width: 512, height: 200 },
];

export default function StoreFooter() {
  const t = useTranslations("storefront");
  const faqs = ["delivery", "payment", "age"] as const;

  return (
    <>
      <section aria-labelledby="faq-heading" className="mx-auto hidden max-w-[1440px] px-8 py-16 md:block">
        <div className="grid gap-10 border-t border-tipsy-line pt-12 lg:grid-cols-[0.7fr_1.3fr]"><div><p className="text-sm font-semibold text-tipsy-amber-700">{t("faq.eyebrow")}</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.05em] text-tipsy-ink" id="faq-heading">{t("faq.title")}</h2><p className="mt-3 max-w-sm text-sm leading-6 text-tipsy-muted">{t("faq.description")}</p></div><div className="divide-y divide-tipsy-line border-y border-tipsy-line">{faqs.map((faq, index) => <details className="group py-5" key={faq} open={index === 0}><summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base font-semibold text-tipsy-ink">{t(`faq.items.${faq}.question`)}<span className="text-xl font-normal text-tipsy-muted transition group-open:rotate-45">+</span></summary><p className="max-w-xl pt-3 text-sm leading-6 text-tipsy-muted">{t(`faq.items.${faq}.answer`)}</p></details>)}</div></div>
      </section>
      <footer className="mt-4 bg-tipsy-ink text-white md:mt-0"><div className="mx-auto hidden max-w-[1440px] grid-cols-[1.1fr_repeat(3,0.7fr)] gap-8 px-8 py-12 md:grid"><div><p className="text-2xl font-extrabold tracking-[-0.08em]">tipsy<span className="text-tipsy-amber-500">.</span>theoryy</p><p className="mt-4 max-w-xs text-sm leading-6 text-white/65">{t("footer.description")}</p><p className="mt-6 text-xs text-white/45">{t("footer.responsible")}</p></div><div><h3 className="text-sm font-bold">{t("footer.shop.title")}</h3><ul className="mt-4 grid gap-3 text-sm text-white/65"><li>{t("footer.shop.whisky")}</li><li>{t("footer.shop.beer")}</li><li>{t("footer.shop.wine")}</li><li>{t("footer.shop.offers")}</li></ul></div><div><h3 className="text-sm font-bold">{t("footer.help.title")}</h3><ul className="mt-4 grid gap-3 text-sm text-white/65"><li>{t("footer.help.orders")}</li><li>{t("footer.help.delivery")}</li><li>{t("footer.help.support")}</li></ul></div><div><h3 className="text-sm font-bold">{t("footer.payments")}</h3><div className="mt-5 flex items-center gap-3"><Image alt={paymentLogos[0].alt} className="h-auto w-28 shrink-0 object-contain" height={paymentLogos[0].height} src={paymentLogos[0].src} width={paymentLogos[0].width} /><Image alt={paymentLogos[1].alt} className="h-auto w-32 shrink-0 object-contain" height={paymentLogos[1].height} src={paymentLogos[1].src} width={paymentLogos[1].width} /></div><p className="mt-5 text-xs leading-5 text-white/55">{t("footer.paymentNote")}</p></div></div><div className="border-t border-white/10 px-4 py-5 text-center text-xs text-white/50 md:hidden">{t("footer.responsible")}</div><div className="border-t border-white/10"><div className="mx-auto flex max-w-[1440px] items-center justify-between px-8 py-4 text-xs text-white/45"><span>© {new Date().getFullYear()} Tipsy Theoryy</span><span>{t("footer.terms")}</span></div></div></footer>
    </>
  );
}
