import { SidebarProvider } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import AgeGate from "@/components/storefront/AgeGate";
import WhatsAppSupport from "@/components/storefront/WhatsAppSupport";
import { StorefrontToastProvider } from "@/components/storefront/StorefrontToast";
import { GeistSans } from "geist/font/sans";
import { isRtl } from "@/i18n/languages";
import { type Locale, routing } from "@/i18n/routing";
import "flatpickr/dist/flatpickr.css";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import "simplebar-react/dist/simplebar.min.css";
import "swiper/css/bundle";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html className={GeistSans.variable} lang={locale} dir={isRtl(locale as Locale) ? "rtl" : "ltr"}>
      <body className="font-geist font-medium dark:bg-gray-900">
        <AgeGate />
        <NextIntlClientProvider>
          <ThemeProvider>
            <StorefrontToastProvider><SidebarProvider>{children}<WhatsAppSupport /></SidebarProvider></StorefrontToastProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
