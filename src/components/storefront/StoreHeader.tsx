"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { CategoryId } from "./data";
import SearchBar from "./SearchBar";
import { readDeliveryLocation, saveDeliveryLocation } from "./cartStorage";
import StoreIcon from "./StoreIcon";

interface StoreHeaderProps {
  cartCount: number;
  onCartOpen: () => void;
  onCategorySelect: (category: CategoryId | "all") => void;
  onSearchChange: (query: string) => void;
  query: string;
  selectedCategory: CategoryId | "all";
}

interface DetectedLocation {
  attribution: string;
  name: string;
}

interface ReverseGeocodeResponse {
  address?: Record<string, string | undefined>;
  display_name?: string;
}

interface DeliveryAreaOption {
  detail: string;
  input: boolean;
  name: string;
  popular: boolean;
}

interface ServiceabilityResult {
  serviceable: boolean;
  area: { name: string; secondary_name: string | null } | null;
}

type LocationModalStep = "confirm" | "saved" | "select";

const reverseGeocodeCache = new Map<string, DetectedLocation>();

function readableLocation(response: ReverseGeocodeResponse) {
  const address = response.address ?? {};
  const area = address.neighbourhood || address.suburb || address.village || address.town || address.city_district || address.city || address.county;
  const town = address.city || address.town || address.village || address.county;
  const values = [area, town].filter((value, index, items) => Boolean(value) && items.indexOf(value) === index);

  return values.join(", ") || response.display_name?.split(",").slice(0, 2).join(",").trim() || null;
}

function reverseGeocode(latitude: number, longitude: number) {
  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  return new Promise<DetectedLocation>((resolve, reject) => {
    const callbackName = `tipsyTheoryyReverseGeocode${Date.now()}`;
    const callbackHost = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => cleanup(new Error("Reverse geocoding timed out")), 8000);

    const cleanup = (error?: Error, result?: DetectedLocation) => {
      window.clearTimeout(timeout);
      script.remove();
      delete callbackHost[callbackName];
      if (error) reject(error); else if (result) resolve(result);
    };

    callbackHost[callbackName] = (response: ReverseGeocodeResponse) => {
      const name = readableLocation(response);
      if (!name) {
        cleanup(new Error("No readable location returned"));
        return;
      }

      const result = { name, attribution: "© OpenStreetMap contributors" };
      reverseGeocodeCache.set(cacheKey, result);
      cleanup(undefined, result);
    };

    script.onerror = () => cleanup(new Error("Reverse geocoding request failed"));
    script.src = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${latitude}&lon=${longitude}&json_callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

export default function StoreHeader({ cartCount, onCartOpen, onCategorySelect, onSearchChange, query, selectedCategory }: StoreHeaderProps) {
  const t = useTranslations("storefront");
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [location, setLocation] = useState<string | null>(null);
  const [enteredLocation, setEnteredLocation] = useState("");
  const [pendingLocation, setPendingLocation] = useState<string | null>(null);
  const [locationStep, setLocationStep] = useState<LocationModalStep>("select");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [isCheckingService, setIsCheckingService] = useState(false);
  const [savedLocation, setSavedLocation] = useState<string | null>(null);
  const [deliveryAreas, setDeliveryAreas] = useState<DeliveryAreaOption[]>([]);
  const commonDeliveryAreas = deliveryAreas.slice(0, 4);
  const searchQuery = enteredLocation.trim().toLocaleLowerCase();
  const suggestedAreas = searchQuery ? deliveryAreas.filter((area) => `${area.name} ${area.detail}`.toLocaleLowerCase().includes(searchQuery)) : commonDeliveryAreas;
  const inputSuggestion = searchQuery ? { detail: "Custom delivery address", input: true, name: enteredLocation.trim(), popular: false } : null;
  const displayedAreas = inputSuggestion ? [inputSuggestion, ...suggestedAreas.filter((area) => area.name.toLocaleLowerCase() !== searchQuery)] : suggestedAreas;
  const pendingArea = deliveryAreas.find((area) => area.name === pendingLocation);
  const pendingLocationDetail = pendingArea?.detail ?? "Selected delivery address";
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
      const savedLocation = readDeliveryLocation() || null;
      setLocation(savedLocation);
      setPendingLocation(savedLocation);
      setIsLocationOpen(!savedLocation);
      setIsHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/delivery-areas", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { data?: Array<{ name: string; secondary_name: string | null }> };
        if (!response.ok || !payload.data) throw new Error("Delivery areas could not be loaded.");
        setDeliveryAreas(payload.data.map((area, index) => ({
          detail: area.secondary_name ?? "Karatina delivery area",
          input: false,
          name: area.name,
          popular: index === 0,
        })));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLocationError(error instanceof Error ? error.message : "Delivery areas could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!savedLocation) return;

    const timeout = window.setTimeout(() => setSavedLocation(null), 4600);
    return () => window.clearTimeout(timeout);
  }, [savedLocation]);

  const closeLocation = () => {
    setIsLocationOpen(false);
    setLocationError(null);
    setEnteredLocation("");
    setPendingLocation(location);
    setLocationStep("select");
  };

  const openLocation = () => {
    setLocationError(null);
    setEnteredLocation("");
    setPendingLocation(location);
    setLocationStep("select");
    setIsLocationOpen(true);
  };

  const chooseLocation = (nextLocation: string) => {
    setLocation(nextLocation);
    saveDeliveryLocation(nextLocation);
    setPendingLocation(nextLocation);
    setEnteredLocation("");
    setLocationError(null);
    setLocationStep("saved");
  };

  const checkServiceability = async (body: { name: string } | { latitude: number; longitude: number }) => {
    const response = await fetch("/api/v1/delivery-areas/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const rawPayload = await response.text();
    let payload: { data?: ServiceabilityResult; error?: { message?: string } };
    try {
      payload = JSON.parse(rawPayload) as { data?: ServiceabilityResult; error?: { message?: string } };
    } catch {
      throw new Error("We could not check that delivery area. Please try again.");
    }
    if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "We could not check that delivery area.");
    return payload.data;
  };

  const confirmLocation = async () => {
    if (!pendingLocation || isCheckingService) return;
    setIsCheckingService(true);
    setLocationError(null);
    try {
      const result = await checkServiceability({ name: pendingLocation });
      if (!result.serviceable || !result.area) {
        setLocationStep("select");
        setLocationError("We do not currently deliver to that location. Choose one of the available Karatina delivery areas.");
        return;
      }
      chooseLocation(result.area.name);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "We could not check that delivery area.");
    } finally {
      setIsCheckingService(false);
    }
  };

  const continueAfterSaving = () => {
    if (location) setSavedLocation(location);
    closeLocation();
  };

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError(t("locationPicker.unavailable"));
      return;
    }

    setIsRequestingLocation(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const detected = await reverseGeocode(position.coords.latitude, position.coords.longitude);
          const serviceability = await checkServiceability({ latitude: position.coords.latitude, longitude: position.coords.longitude });
          if (!serviceability.serviceable || !serviceability.area) {
            setLocationError(`${detected.name} is outside our current delivery area.`);
            return;
          }
          setPendingLocation(serviceability.area.name);
          setLocationStep("confirm");
        } catch {
          setLocationError(t("locationPicker.lookupFailed"));
        } finally {
          setIsRequestingLocation(false);
        }
      },
      () => {
        setIsRequestingLocation(false);
        setLocationError(t("locationPicker.permissionDenied"));
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    );
  };

  const locationDialog = isLocationOpen ? (
    <div aria-label={t("chooseLocation")} aria-modal="true" className="fixed inset-0 z-[99999] flex min-h-dvh items-center justify-center overflow-y-auto bg-tipsy-ink/35 p-5 sm:p-6" role="dialog">
      <button aria-label={t("closeLocation")} className="absolute inset-0 cursor-default" onClick={closeLocation} type="button" />
      <section className="relative my-auto w-full max-w-[600px] rounded-[20px] border border-[#e9e5dd] bg-white p-4 shadow-[0_10px_30px_rgba(21,19,15,0.07)] sm:rounded-[22px] sm:p-6">
        {locationStep === "select" ? <div className="location-state-panel" key="select">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[15px] text-tipsy-muted">Delivery location</p><h2 className="mt-2 text-[27px] font-bold tracking-[-0.055em] text-tipsy-ink sm:text-[34px]">Where should we deliver to?</h2><p className="mt-2 text-[14px] leading-5 text-tipsy-muted sm:text-[15px]">Search, use your current location, or choose a common delivery area.</p></div><button aria-label={t("closeLocation")} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={closeLocation} type="button"><StoreIcon className="size-5" name="close" /></button></div>
          <div className="mt-6"><label className="relative block" htmlFor="delivery-location-search"><StoreIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-tipsy-ink" name="search" /><input autoFocus className="h-14 w-full rounded-2xl border border-[#ded9d0] bg-white py-3 pl-12 pr-12 text-[16px] font-medium text-tipsy-ink outline-none transition placeholder:text-tipsy-muted focus:border-tipsy-amber-500 focus:ring-2 focus:ring-tipsy-amber-100" id="delivery-location-search" onChange={(event) => { setEnteredLocation(event.target.value); setLocationError(null); }} placeholder="Search area, estate or landmark" value={enteredLocation} />{enteredLocation ? <button aria-label="Clear location search" className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-tipsy-muted transition hover:bg-tipsy-surface hover:text-tipsy-ink" onClick={() => setEnteredLocation("")} type="button"><StoreIcon className="size-4" name="close" /></button> : null}</label>
            <div className="mt-3 overflow-hidden rounded-2xl border border-[#e9e5dd]" role="listbox">{!searchQuery ? <p className="px-4 pb-1 pt-3 text-[12px] font-semibold text-tipsy-muted">Popular delivery areas</p> : null}{displayedAreas.map((area) => <button aria-selected={pendingLocation === area.name} className={`flex w-full items-center gap-3 border-t border-[#eeeae3] px-4 py-3 text-left transition first:border-t-0 ${pendingLocation === area.name ? "bg-tipsy-amber-50" : "bg-white hover:bg-tipsy-surface"}`} key={`${area.input ? "typed" : "area"}-${area.name}`} onClick={() => { setPendingLocation(area.name); setLocationStep("confirm"); }} role="option" type="button"><span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${pendingLocation === area.name ? "bg-tipsy-amber-500 text-tipsy-ink" : "bg-tipsy-surface text-tipsy-ink"}`}><StoreIcon className="size-5" name="location" /></span><span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-tipsy-ink">{area.input ? <>Use “{area.name}” as delivery address</> : area.name}</span><span className="mt-0.5 block text-[13px] text-tipsy-muted">{area.detail}</span></span>{area.popular ? <span className="rounded-full bg-tipsy-amber-500 px-2.5 py-1 text-[11px] font-semibold text-tipsy-ink">Popular</span> : null}</button>)}</div>
            <button className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[#e9e5dd] bg-white px-4 text-left transition hover:bg-tipsy-surface disabled:cursor-wait disabled:opacity-70" disabled={isRequestingLocation} onClick={requestCurrentLocation} type="button"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tipsy-surface text-tipsy-ink"><StoreIcon className="size-5" name="current-location" /></span><span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-tipsy-ink">{isRequestingLocation ? t("locationPicker.requesting") : t("locationPicker.useCurrent")}</span><span className="mt-0.5 block text-[13px] text-tipsy-muted">Detect your location automatically</span></span><StoreIcon className="size-4 text-tipsy-ink" name="arrow-right" /></button>
            {locationError ? <p className="mt-3 text-sm leading-5 text-red-700" role="status">{locationError}</p> : null}
            <button className="mt-6 h-13 w-full rounded-xl bg-tipsy-amber-500 px-5 text-[16px] font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300 disabled:cursor-not-allowed disabled:opacity-45" disabled={!pendingLocation} onClick={() => setLocationStep("confirm")} type="button">Confirm delivery location</button>
          </div>
        </div> : null}
        {locationStep === "confirm" ? <div className="location-state-panel" key="confirm"><div className="flex items-start justify-between gap-4"><button aria-label="Choose another location" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={() => setLocationStep("select")} type="button"><StoreIcon className="size-5" name="arrow-left" /></button><button aria-label={t("closeLocation")} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={closeLocation} type="button"><StoreIcon className="size-5" name="close" /></button></div><p className="mt-6 text-[15px] text-tipsy-muted">Confirm delivery location</p><h2 className="mt-2 text-[28px] font-bold tracking-[-0.055em] text-tipsy-ink">Deliver to this address?</h2><p className="mt-2 text-[14px] leading-5 text-tipsy-muted">Please confirm this is where you want us to deliver.</p><div className="mt-6 flex items-center gap-3 rounded-2xl bg-tipsy-surface p-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-tipsy-ink"><StoreIcon className="size-5" name="location" /></span><span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold text-tipsy-ink">{pendingLocation}</span><span className="mt-0.5 block text-[13px] text-tipsy-muted">{pendingLocationDetail}</span></span><button className="rounded-xl border border-[#ded9d0] bg-white px-3 py-2 text-sm font-semibold underline decoration-tipsy-amber-500 decoration-2 underline-offset-4" onClick={() => setLocationStep("select")} type="button">Edit</button></div>{locationError ? <p className="mt-3 text-sm text-red-700">{locationError}</p> : null}<button className="mt-6 h-13 w-full rounded-xl bg-tipsy-amber-500 px-5 text-[16px] font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300 disabled:cursor-wait disabled:opacity-60" disabled={isCheckingService} onClick={() => void confirmLocation()} type="button">{isCheckingService ? "Checking delivery area…" : "Confirm and continue"}</button><div className="my-5 flex items-center gap-3 text-xs text-tipsy-muted"><span className="h-px flex-1 bg-[#e9e5dd]" />or<span className="h-px flex-1 bg-[#e9e5dd]" /></div><button className="h-12 w-full rounded-xl border border-[#ded9d0] text-sm font-semibold underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 transition hover:bg-tipsy-surface" onClick={() => setLocationStep("select")} type="button">Choose a different location</button></div> : null}
        {locationStep === "saved" ? <div className="location-state-panel py-5 text-center" key="saved" role="status"><div className="flex justify-end"><button aria-label={t("closeLocation")} className="flex size-11 items-center justify-center rounded-xl border border-[#e9e5dd] bg-white text-tipsy-ink transition hover:bg-tipsy-surface" onClick={continueAfterSaving} type="button"><StoreIcon className="size-5" name="close" /></button></div><span className="mx-auto mt-3 flex size-16 items-center justify-center rounded-full bg-[#2ba84a] text-white shadow-[0_0_0_10px_#eff8f0]"><StoreIcon className="size-9" name="check" /></span><h2 className="mt-7 text-[28px] font-bold tracking-[-0.055em] text-tipsy-ink">Delivery location saved</h2><p className="mt-4 text-[17px] font-semibold text-tipsy-ink">{location}</p><p className="mt-1 text-[14px] text-tipsy-muted">{pendingLocationDetail}</p><button className="mt-8 h-13 w-full rounded-xl bg-tipsy-amber-500 px-5 text-[16px] font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300" onClick={continueAfterSaving} type="button">Continue shopping</button><button className="mt-4 text-sm font-semibold underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 transition hover:text-tipsy-muted" onClick={() => setLocationStep("select")} type="button">Edit location</button></div> : null}
      </section>
    </div>
  ) : null;

  return (
    <>
      <header className="sticky top-0 z-99 bg-tipsy-canvas/95 backdrop-blur">
        <div className="bg-[#171614] text-white"><div className="mx-auto flex h-12 max-w-[1440px] items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8"><div className="flex min-w-0 items-center gap-3 sm:gap-5"><StoreIcon className="size-5 shrink-0 text-tipsy-amber-500" name="location" /><span className="hidden text-sm text-white/55 sm:block">Delivery location</span><span className="hidden h-6 w-px bg-white/35 sm:block" /><strong className="truncate text-[13px] font-semibold text-white sm:text-base">{location ?? t("chooseLocationShort")}</strong></div><button className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-semibold text-tipsy-amber-500 underline decoration-1 underline-offset-4 transition hover:text-tipsy-amber-300 sm:text-base" onClick={openLocation} type="button">Change location <StoreIcon className="size-4 sm:size-5" name="arrow-right" /></button></div></div>
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center gap-3 px-4 sm:h-[72px] sm:px-6 lg:px-8">
          <a aria-label={t("homeLink")} className="shrink-0 text-[26px] font-extrabold tracking-[-0.08em] text-tipsy-ink sm:text-2xl" href="#top">tipsy<span className="text-tipsy-amber-500">.</span>theoryy</a>
          <SearchBar className="hidden min-w-0 flex-1 md:block" onSearchChange={onSearchChange} query={query} />
          <button aria-expanded={isLocationOpen} aria-haspopup="dialog" className="hidden items-center gap-2 rounded-xl px-2 py-1 text-start transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tipsy-amber-500 lg:flex" onClick={openLocation} type="button"><StoreIcon className="size-5 text-tipsy-amber-700" name="location" /><span className="leading-4"><span className="block text-[11px] text-tipsy-muted">{t("deliverTo")}</span><span className="text-xs font-semibold text-tipsy-ink">{location ?? t("chooseLocationShort")}</span></span><StoreIcon className="size-3 text-tipsy-muted" name="arrow" /></button>
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
