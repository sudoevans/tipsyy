"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { CategoryId } from "./data";
import SearchBar from "./SearchBar";
import { readDeliveryDetails, saveDeliveryLocation } from "./cartStorage";
import { getCurrentDeliveryLocation, type DeliveryLocationDetails } from "./deliveryLocation";
import StoreIcon from "./StoreIcon";

interface StoreHeaderProps {
  cartCount: number;
  onCartOpen: () => void;
  onCategorySelect: (category: CategoryId | "all") => void;
  onSearchChange: (query: string) => void;
  query: string;
  selectedCategory: CategoryId | "all";
}

type LocationModalStep = "confirm" | "saved" | "select";

export default function StoreHeader({ cartCount, onCartOpen, onCategorySelect, onSearchChange, query, selectedCategory }: StoreHeaderProps) {
  const t = useTranslations("storefront");
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [location, setLocation] = useState<DeliveryLocationDetails | null>(null);
  const [pendingLocation, setPendingLocation] = useState<DeliveryLocationDetails | null>(null);
  const [locationStep, setLocationStep] = useState<LocationModalStep>("select");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [savedLocation, setSavedLocation] = useState<string | null>(null);
  const navigation: Array<{ id: CategoryId | "all"; label: string }> = [
    { id: "all", label: t("navigation.shop") },
    { id: "spirits", label: t("categories.spirits") },
    { id: "whisky", label: t("categories.whisky") },
    { id: "rum", label: t("categories.rum") },
    { id: "beer", label: t("categories.beer") },
    { id: "wine", label: t("categories.wine") },
    { id: "vodka", label: t("categories.vodka") },
    { id: "gin", label: t("categories.gin") },
    { id: "mixers", label: t("categories.mixers") },
  ];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedLocation = readDeliveryDetails();
      const hasCurrentCoordinates = Boolean(savedLocation && Number.isFinite(savedLocation.latitude) && Number.isFinite(savedLocation.longitude));
      setLocation(hasCurrentCoordinates ? savedLocation : null);
      setPendingLocation(hasCurrentCoordinates ? savedLocation : null);
      setIsLocationOpen(!hasCurrentCoordinates);
      setIsHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!savedLocation) return;

    const timeout = window.setTimeout(() => setSavedLocation(null), 4600);
    return () => window.clearTimeout(timeout);
  }, [savedLocation]);

  const closeLocation = () => {
    setIsLocationOpen(false);
    setLocationError(null);
    setPendingLocation(location);
    setLocationStep("select");
  };

  const openLocation = () => {
    setLocationError(null);
    setPendingLocation(location);
    setLocationStep("select");
    setIsLocationOpen(true);
  };

  const chooseLocation = (nextLocation: DeliveryLocationDetails) => {
    setLocation(nextLocation);
    saveDeliveryLocation(nextLocation);
    setPendingLocation(nextLocation);
    setLocationError(null);
    setLocationStep("saved");
  };

  const continueAfterSaving = () => {
    if (location) setSavedLocation(location.addressLine);
    closeLocation();
  };

  const requestCurrentLocation = async () => {
    setIsRequestingLocation(true);
    setLocationError(null);
    try {
      const current = await getCurrentDeliveryLocation(location?.instructions ?? "");
      setPendingLocation(current);
      setLocationStep("confirm");
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "We could not get your current location.");
    } finally {
      setIsRequestingLocation(false);
    }
  };

  const locationDialog = isLocationOpen ? (
    <div aria-label={t("chooseLocation")} aria-modal="true" className="fixed inset-0 z-[99999] flex min-h-dvh items-center justify-center overflow-y-auto bg-tipsy-ink/35 p-5 sm:p-6" role="dialog">
      <button aria-label={t("closeLocation")} className="absolute inset-0 cursor-default" onClick={closeLocation} type="button" />
      <section className="relative my-auto w-full max-w-[600px] rounded-[20px] border border-[#e9e5dd] bg-white p-4 shadow-[0_10px_30px_rgba(21,19,15,0.07)] sm:rounded-[22px] sm:p-6">
        {locationStep === "select" ? <div className="location-state-panel" key="select">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[15px] text-tipsy-muted">Delivery location</p><h2 className="mt-2 text-[27px] font-bold tracking-[-0.055em] text-tipsy-ink sm:text-[34px]">Use your current location</h2><p className="mt-2 text-[14px] leading-5 text-tipsy-muted sm:text-[15px]">We’ll use your device location to check delivery and guide the rider to you.</p></div><button aria-label={t("closeLocation")} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={closeLocation} type="button"><StoreIcon className="size-5" name="close" /></button></div>
          <button className="mt-6 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[#e9e5dd] bg-white px-4 text-left transition hover:bg-tipsy-surface disabled:cursor-wait disabled:opacity-70" disabled={isRequestingLocation} onClick={() => void requestCurrentLocation()} type="button"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tipsy-surface text-tipsy-ink"><StoreIcon className="size-5" name="current-location" /></span><span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-tipsy-ink">{isRequestingLocation ? "Getting your location…" : "Use current location"}</span><span className="mt-0.5 block text-[13px] text-tipsy-muted">Allow location access when your browser asks.</span></span><StoreIcon className="size-4 text-tipsy-ink" name="arrow-right" /></button>
          {locationError ? <p className="mt-3 text-sm leading-5 text-red-700" role="status">{locationError}</p> : null}
        </div> : null}
        {locationStep === "confirm" && pendingLocation ? <div className="location-state-panel" key="confirm"><div className="flex items-start justify-between gap-4"><button aria-label="Get location again" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={() => setLocationStep("select")} type="button"><StoreIcon className="size-5" name="arrow-left" /></button><button aria-label={t("closeLocation")} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={closeLocation} type="button"><StoreIcon className="size-5" name="close" /></button></div><p className="mt-6 text-[15px] text-tipsy-muted">Current location</p><h2 className="mt-2 text-[28px] font-bold tracking-[-0.055em] text-tipsy-ink">Deliver here?</h2><div className="mt-6 flex items-center gap-3 rounded-2xl bg-tipsy-surface p-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-tipsy-ink"><StoreIcon className="size-5" name="location" /></span><span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold text-tipsy-ink">{pendingLocation.addressLine}</span><span className="mt-0.5 block text-[13px] text-tipsy-muted">Delivery area: {pendingLocation.area}</span></span></div><p className="mt-3 text-[13px] leading-5 text-tipsy-muted">Need to guide the rider? You can add a hostel, building or room number at checkout.</p><button className="mt-6 h-13 w-full rounded-xl bg-tipsy-amber-500 px-5 text-[16px] font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300" onClick={() => chooseLocation(pendingLocation)} type="button">Confirm and continue</button><button className="mt-4 h-12 w-full rounded-xl border border-[#ded9d0] text-sm font-semibold underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 transition hover:bg-tipsy-surface" onClick={() => setLocationStep("select")} type="button">Get current location again</button></div> : null}
        {locationStep === "saved" ? <div className="location-state-panel py-5 text-center" key="saved" role="status"><div className="flex justify-end"><button aria-label={t("closeLocation")} className="flex size-11 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={continueAfterSaving} type="button"><StoreIcon className="size-5" name="close" /></button></div><span className="mx-auto mt-3 flex size-16 items-center justify-center rounded-full bg-[#2ba84a] text-white shadow-[0_0_0_10px_#eff8f0]"><StoreIcon className="size-9" name="check" /></span><h2 className="mt-7 text-[28px] font-bold tracking-[-0.055em] text-tipsy-ink">Delivery location saved</h2><p className="mt-4 text-[17px] font-semibold text-tipsy-ink">{location?.addressLine}</p><p className="mt-1 text-[14px] text-tipsy-muted">Delivery area: {location?.area}</p><button className="mt-8 h-13 w-full rounded-xl bg-tipsy-amber-500 px-5 text-[16px] font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300" onClick={continueAfterSaving} type="button">Continue shopping</button><button className="mt-4 text-sm font-semibold underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 transition hover:text-tipsy-muted" onClick={() => setLocationStep("select")} type="button">Update current location</button></div> : null}
      </section>
    </div>
  ) : null;

  return (
    <>
      <header className="sticky top-0 z-99 bg-tipsy-canvas/95 backdrop-blur">
        <div className="bg-[#171614] text-white"><div className="mx-auto flex h-12 max-w-[1440px] items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8"><div className="flex min-w-0 items-center gap-3 sm:gap-5"><StoreIcon className="size-5 shrink-0 text-tipsy-amber-500" name="location" /><span className="hidden text-sm text-white/55 sm:block">Delivery location</span><span className="hidden h-6 w-px bg-white/35 sm:block" /><strong className="truncate text-[13px] font-semibold text-white sm:text-base">{location?.addressLine ?? t("chooseLocationShort")}</strong></div><button className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-semibold text-tipsy-amber-500 underline decoration-1 underline-offset-4 transition hover:text-tipsy-amber-300 sm:text-base" onClick={openLocation} type="button">Update location <StoreIcon className="size-4 sm:size-5" name="arrow-right" /></button></div></div>
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center gap-3 px-4 sm:h-[72px] sm:px-6 lg:px-8">
          <a aria-label={t("homeLink")} className="shrink-0 text-[26px] font-extrabold tracking-[-0.08em] text-tipsy-ink sm:text-2xl" href="#top">tipsy<span className="text-tipsy-amber-500">.</span>theoryy</a>
          <SearchBar className="hidden min-w-0 flex-1 md:block" onSearchChange={onSearchChange} query={query} />
          <button aria-expanded={isLocationOpen} aria-haspopup="dialog" className="hidden items-center gap-2 rounded-xl px-2 py-1 text-start transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tipsy-amber-500 lg:flex" onClick={openLocation} type="button"><StoreIcon className="size-5 text-tipsy-amber-700" name="location" /><span className="leading-4"><span className="block text-[11px] text-tipsy-muted">{t("deliverTo")}</span><span className="text-xs font-semibold text-tipsy-ink">{location?.addressLine ?? t("chooseLocationShort")}</span></span><StoreIcon className="size-3 text-tipsy-muted" name="arrow" /></button>
          <Link aria-label={t("account")} className="hidden items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-tipsy-ink transition hover:bg-white sm:flex" href="/account"><StoreIcon className="size-5" name="user" /><span className="hidden xl:block">{t("account")}</span></Link>
          <button aria-label={t("cart", { count: cartCount })} className="relative flex size-12 shrink-0 items-center justify-center rounded-xl border border-tipsy-line bg-white text-tipsy-ink transition hover:bg-tipsy-amber-100" onClick={onCartOpen} type="button"><StoreIcon className="size-5" name="bag" />{cartCount ? <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-tipsy-amber-500 text-[11px] font-bold">{cartCount}</span> : null}</button>
        </div>
        <div className="bg-tipsy-canvas md:hidden"><SearchBar className="mx-4 pb-2" onSearchChange={onSearchChange} query={query} /></div>
        <nav aria-label={t("primaryNavigation")} className="border-b border-tipsy-line/80 bg-tipsy-canvas"><div className="mx-auto flex max-w-[1440px] items-center gap-5 overflow-x-auto px-4 py-1.5 text-sm font-semibold no-scrollbar sm:px-6 sm:py-3 lg:px-8">{navigation.map((item) => <button className={`relative min-h-11 shrink-0 py-1 transition ${selectedCategory === item.id ? "text-tipsy-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-tipsy-amber-500 sm:after:-bottom-3" : "text-tipsy-muted hover:text-tipsy-ink"}`} key={item.id} onClick={() => onCategorySelect(item.id)} type="button">{item.label}</button>)}<button className="min-h-11 shrink-0 py-1 text-tipsy-muted transition hover:text-tipsy-ink" onClick={() => onCategorySelect("all")} type="button">{t("navigation.offers")}</button></div></nav>
      </header>
      {savedLocation ? <div aria-live="polite" className="location-saved-toast fixed left-1/2 top-5 z-[100000] flex w-[calc(100%-2rem)] max-w-sm items-center gap-3 rounded-2xl bg-tipsy-ink px-4 py-3 text-white shadow-2xl sm:w-auto" role="status"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tipsy-amber-500 text-tipsy-ink"><StoreIcon className="size-5" name="check" /></span><span><span className="block text-sm font-bold">{t("locationPicker.saved")}</span><span className="mt-0.5 block text-xs text-white/70">{t("locationPicker.savedTo", { location: savedLocation })}</span></span></div> : null}
      {isHydrated && isLocationOpen && typeof document !== "undefined" ? createPortal(locationDialog, document.body) : null}
    </>
  );
}
