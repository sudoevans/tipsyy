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
import Image from "next/image";
import { useCustomerSession } from "./CustomerSession";

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
  const { authenticated } = useCustomerSession();
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
    if (!isLocationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLocationOpen(false);
        setLocationError(null);
        setLocationStep("select");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isLocationOpen]);

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
    <div aria-label={t("chooseLocation")} aria-modal="true" className="fixed inset-0 z-[99999] flex min-h-dvh items-end justify-center overflow-y-auto bg-tipsy-ink/45 p-0 sm:items-center sm:p-6" role="dialog">
      <button aria-label={t("closeLocation")} className="absolute inset-0 cursor-default" onClick={closeLocation} type="button" />
      <section className="relative my-auto max-h-[min(88dvh,42rem)] w-full overflow-y-auto overscroll-contain rounded-t-[24px] border border-[#e9e5dd] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_10px_30px_rgba(21,19,15,0.12)] sm:max-h-[calc(100dvh-3rem)] sm:max-w-[560px] sm:rounded-[22px] sm:p-6">
        {locationStep === "select" ? <div className="location-state-panel" key="select">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-tipsy-muted">Delivery location</p><h2 className="mt-2 text-[25px] font-bold leading-tight tracking-[-0.045em] text-tipsy-ink sm:text-[32px]">Set your delivery location</h2><p className="mt-2 max-w-md text-sm leading-5 text-tipsy-muted">Use your phone’s current location. We’ll calculate delivery by distance.</p></div><button aria-label={t("closeLocation")} className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={closeLocation} type="button"><StoreIcon className="size-5" name="close" /></button></div>
          <button aria-live="polite" className="mt-5 flex min-h-[68px] w-full items-center gap-3 rounded-2xl border border-[#e9e5dd] bg-white px-3 text-left transition hover:bg-tipsy-surface disabled:cursor-wait disabled:bg-tipsy-surface/60 sm:px-4" disabled={isRequestingLocation} onClick={() => void requestCurrentLocation()} type="button"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tipsy-surface text-tipsy-ink">{isRequestingLocation ? <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-tipsy-ink/20 border-t-tipsy-ink" /> : <StoreIcon className="size-5" name="current-location" />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-tipsy-ink">{isRequestingLocation ? "Finding your location…" : "Use current location"}</span><span className="mt-1 block text-xs leading-4 text-tipsy-muted">{isRequestingLocation ? "This may take a few seconds." : "Allow location access when your browser asks."}</span></span>{!isRequestingLocation ? <StoreIcon className="size-4 shrink-0 text-tipsy-ink" name="arrow-right" /> : null}</button>
          {locationError ? <p className="mt-3 text-sm leading-5 text-red-700" role="status">{locationError}</p> : null}
        </div> : null}
        {locationStep === "confirm" && pendingLocation ? <div className="location-state-panel" key="confirm"><div className="flex items-start justify-between gap-4"><button aria-label="Get location again" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={() => setLocationStep("select")} type="button"><StoreIcon className="size-5" name="arrow-left" /></button><button aria-label={t("closeLocation")} className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={closeLocation} type="button"><StoreIcon className="size-5" name="close" /></button></div><p className="mt-5 text-sm text-tipsy-muted">Current location</p><h2 className="mt-1 text-[26px] font-bold tracking-[-0.045em] text-tipsy-ink">Deliver here?</h2><div className="mt-4 flex items-center gap-3 rounded-2xl bg-tipsy-surface p-3 sm:p-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-tipsy-ink"><StoreIcon className="size-5" name="location" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-tipsy-ink">{pendingLocation.addressLine}</span><span className="mt-0.5 block text-xs leading-4 text-tipsy-muted">We’ll use your precise location to calculate delivery.</span></span></div>{typeof pendingLocation.chargedKilometres === "number" && typeof pendingLocation.ratePerKm === "number" && typeof pendingLocation.feeKsh === "number" ? <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-[#e9e5dd] px-3 py-3 text-sm"><span className="text-tipsy-muted">{pendingLocation.chargedKilometres} km × KSh {pendingLocation.ratePerKm}/km</span><strong className="shrink-0 text-tipsy-ink">KSh {Math.round(pendingLocation.feeKsh).toLocaleString("en-KE")}</strong></div> : null}<p className="mt-3 text-xs leading-5 text-tipsy-muted">Need a hostel or room number? You can add it at checkout.</p><button className="mt-5 min-h-12 w-full rounded-xl bg-tipsy-amber-500 px-5 text-sm font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300" onClick={() => chooseLocation(pendingLocation)} type="button">Confirm delivery location</button><button className="mt-2 min-h-11 w-full rounded-xl text-sm font-semibold text-tipsy-muted transition hover:bg-tipsy-surface hover:text-tipsy-ink" onClick={() => setLocationStep("select")} type="button">Try again</button></div> : null}
        {locationStep === "saved" ? <div className="location-state-panel py-5 text-center" key="saved" role="status"><div className="flex justify-end"><button aria-label={t("closeLocation")} className="flex size-11 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={continueAfterSaving} type="button"><StoreIcon className="size-5" name="close" /></button></div><span className="mx-auto mt-3 flex size-16 items-center justify-center rounded-full bg-[#2ba84a] text-white shadow-[0_0_0_10px_#eff8f0]"><StoreIcon className="size-9" name="check" /></span><h2 className="mt-7 text-[28px] font-bold tracking-[-0.055em] text-tipsy-ink">Delivery location saved</h2><p className="mt-4 text-[17px] font-semibold text-tipsy-ink">{location?.addressLine}</p>{typeof location?.distanceKm === "number" && typeof location.feeKsh === "number" ? <p className="mt-1 text-[14px] text-tipsy-muted">About {location.distanceKm.toFixed(1)} km away · estimated delivery KSh {Math.round(location.feeKsh).toLocaleString("en-KE")}</p> : null}<button className="mt-8 h-13 w-full rounded-xl bg-tipsy-amber-500 px-5 text-[16px] font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300" onClick={continueAfterSaving} type="button">Continue shopping</button><button className="mt-4 text-sm font-semibold underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 transition hover:text-tipsy-muted" onClick={() => setLocationStep("select")} type="button">Update current location</button></div> : null}
      </section>
    </div>
  ) : null;

  return (
    <>
      <header className="sticky top-0 z-99 bg-tipsy-canvas/95 backdrop-blur">
        <div className="bg-[#171614] text-white"><div className="mx-auto flex h-12 max-w-[1440px] items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8"><div className="flex min-w-0 items-center gap-3 sm:gap-5"><StoreIcon className="size-5 shrink-0 text-tipsy-amber-500" name="location" /><span className="hidden text-sm text-white/55 sm:block">Delivery location</span><span className="hidden h-6 w-px bg-white/35 sm:block" /><strong className="truncate text-[13px] font-semibold text-white sm:text-base">{location?.addressLine ?? t("chooseLocationShort")}</strong></div><button className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-semibold text-tipsy-amber-500 underline decoration-1 underline-offset-4 transition hover:text-tipsy-amber-300 sm:text-base" onClick={openLocation} type="button">Update location <StoreIcon className="size-4 sm:size-5" name="arrow-right" /></button></div></div>
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center gap-3 px-4 sm:h-[72px] sm:px-6 lg:px-8">
          <a aria-label={t("homeLink")} className="relative h-14 w-24 shrink-0 sm:h-16 sm:w-28" href="#top"><Image alt="Tipsy Theoryy" className="object-contain object-left" fill priority sizes="112px" src="/images/logo/tipsyy-logo.svg" unoptimized /></a>
          <SearchBar className="hidden min-w-0 flex-1 md:block" onSearchChange={onSearchChange} query={query} />
          <button aria-expanded={isLocationOpen} aria-haspopup="dialog" className="hidden items-center gap-2 rounded-xl px-2 py-1 text-start transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tipsy-amber-500 lg:flex" onClick={openLocation} type="button"><StoreIcon className="size-5 text-tipsy-amber-700" name="location" /><span className="leading-4"><span className="block text-[11px] text-tipsy-muted">{t("deliverTo")}</span><span className="text-xs font-semibold text-tipsy-ink">{location?.addressLine ?? t("chooseLocationShort")}</span></span><StoreIcon className="size-3 text-tipsy-muted" name="arrow" /></button>
          <Link aria-label={authenticated ? t("account") : "Log in / Sign up"} className="hidden items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-tipsy-ink transition hover:bg-white sm:flex" href={authenticated ? "/account" : "/signin"}><StoreIcon className="size-5" name="user" /><span className="hidden xl:block">{authenticated ? t("account") : "Log in / Sign up"}</span></Link>
          <button aria-label={t("cart", { count: cartCount })} className="relative ml-auto flex size-12 shrink-0 items-center justify-center rounded-xl border border-tipsy-line bg-white text-tipsy-ink transition hover:bg-tipsy-amber-100 sm:ml-0" onClick={onCartOpen} type="button"><StoreIcon className="size-5" name="bag" />{cartCount ? <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-tipsy-amber-500 text-[11px] font-bold">{cartCount}</span> : null}</button>
        </div>
        <div className="bg-tipsy-canvas md:hidden"><SearchBar className="mx-4 pb-2" onSearchChange={onSearchChange} query={query} /></div>
        <nav aria-label={t("primaryNavigation")} className="border-b border-tipsy-line/80 bg-tipsy-canvas"><div className="mx-auto flex max-w-[1440px] items-center gap-5 overflow-x-auto px-4 py-1.5 text-sm font-semibold no-scrollbar sm:px-6 sm:py-3 lg:px-8">{navigation.map((item) => <button className={`relative min-h-11 shrink-0 py-1 transition ${selectedCategory === item.id ? "text-tipsy-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-tipsy-amber-500 sm:after:-bottom-3" : "text-tipsy-muted hover:text-tipsy-ink"}`} key={item.id} onClick={() => onCategorySelect(item.id)} type="button">{item.label}</button>)}<button className="min-h-11 shrink-0 py-1 text-tipsy-muted transition hover:text-tipsy-ink" onClick={() => onCategorySelect("all")} type="button">{t("navigation.offers")}</button></div></nav>
      </header>
      {savedLocation ? <div aria-live="polite" className="location-saved-toast fixed left-1/2 top-5 z-[100000] flex w-[calc(100%-2rem)] max-w-sm items-center gap-3 rounded-2xl bg-tipsy-ink px-4 py-3 text-white shadow-2xl sm:w-auto" role="status"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tipsy-amber-500 text-tipsy-ink"><StoreIcon className="size-5" name="check" /></span><span><span className="block text-sm font-bold">{t("locationPicker.saved")}</span><span className="mt-0.5 block text-xs text-white/70">{t("locationPicker.savedTo", { location: savedLocation })}</span></span></div> : null}
      {isHydrated && isLocationOpen && typeof document !== "undefined" ? createPortal(locationDialog, document.body) : null}
    </>
  );
}
