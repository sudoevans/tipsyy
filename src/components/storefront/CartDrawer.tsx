"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import BeverageImage from "./BeverageImage";
import { formatPrice } from "./currency";
import type { StoreProduct } from "./data";
import StoreIcon from "./StoreIcon";
import {
  readDeliveryDetails,
  saveCartForCheckout,
  saveCouponCode,
} from "./cartStorage";

interface CartDrawerProps {
  items: Array<{ product: StoreProduct; quantity: number }>;
  onClose: () => void;
  onCheckout: () => void;
  onQuantityChange: (productId: string, quantity: number) => void;
}

async function requestCartQuote(
  items: CartDrawerProps["items"],
  code?: string,
) {
  const location = readDeliveryDetails();
  const response = await fetch("/api/v1/cart/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map(({ product, quantity }) => ({
        productSlug: product.id,
        quantity,
      })),
      delivery: location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
          }
        : undefined,
      couponCode: code || undefined,
    }),
  });
  const payload = (await response.json()) as {
    data?: { deliveryFee: number; discount: number };
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message ?? "That promo code is not valid.");
  if (!payload.data) throw new Error("That promo code is not valid.");
  return payload.data;
}

export default function CartDrawer({
  items,
  onCheckout,
  onClose,
  onQuantityChange,
}: CartDrawerProps) {
  const router = useRouter();
  const t = useTranslations("storefront");
  const [isVisible, setIsVisible] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    amount: number;
  } | null>(null);
  const [quotedDeliveryFee, setQuotedDeliveryFee] = useState(0);
  const [locationRevision, setLocationRevision] = useState(0);
  const [promoFeedback, setPromoFeedback] = useState<{
    isError: boolean;
    message: string;
  } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  const deliveryFee = items.length ? quotedDeliveryFee : 0;
  const promoDiscount = appliedPromo?.amount ?? 0;
  const total = subtotal + deliveryFee - promoDiscount;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => {
      cancelAnimationFrame(frame);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const dismiss = () => {
    if (closeTimer.current) return;
    setIsVisible(false);
    closeTimer.current = setTimeout(onClose, 220);
  };

  const viewCart = () => {
    if (closeTimer.current) return;
    setIsVisible(false);
    closeTimer.current = setTimeout(() => router.push("/cart"), 220);
  };

  useEffect(() => {
    const onLocationChange = () =>
      setLocationRevision((revision) => revision + 1);
    window.addEventListener(
      "tipsy:delivery-location-changed",
      onLocationChange,
    );
    return () =>
      window.removeEventListener(
        "tipsy:delivery-location-changed",
        onLocationChange,
      );
  }, []);

  useEffect(() => {
    if (!items.length) return;
    let active = true;
    void requestCartQuote(items)
      .then((result) => {
        if (active) setQuotedDeliveryFee(Number(result.deliveryFee));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [items, locationRevision]);

  const applyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    try {
      const result = await requestCartQuote(items, code);
      setQuotedDeliveryFee(Number(result.deliveryFee));
      setAppliedPromo({ code, amount: result.discount });
      saveCouponCode(code);
      saveCartForCheckout(
        Object.fromEntries(
          items.map(({ product, quantity }) => [product.id, quantity]),
        ),
      );
      setPromoFeedback({
        isError: false,
        message: `${code} applied — ${formatPrice(result.discount)} off.`,
      });
    } catch (error) {
      setAppliedPromo(null);
      saveCouponCode("");
      saveCartForCheckout(
        Object.fromEntries(
          items.map(({ product, quantity }) => [product.id, quantity]),
        ),
      );
      setPromoFeedback({
        isError: true,
        message:
          error instanceof Error
            ? error.message
            : "That promo code is not valid.",
      });
    }
  };

  return (
    <div
      aria-label={t("cartDrawerTitle")}
      aria-modal="true"
      className={`fixed inset-0 z-99999 flex justify-end bg-tipsy-ink/45 transition-opacity duration-200 ease-out ${isVisible ? "opacity-100" : "opacity-0"}`}
      role="dialog"
    >
      <button
        aria-label={t("closeCart")}
        className="absolute inset-0"
        onClick={dismiss}
        type="button"
      />
      <aside
        className={`relative flex h-full w-full max-w-[430px] flex-col border-l border-tipsy-line bg-white shadow-[-8px_0_28px_rgba(21,19,15,0.08)] transition-transform duration-[220ms] ease-out ${isVisible ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center gap-3 border-b border-tipsy-line px-5 py-4 sm:px-6">
          <button
            aria-label={t("closeCart")}
            className="flex size-10 shrink-0 items-center justify-center bg-tipsy-surface text-tipsy-muted transition hover:bg-tipsy-amber-100 hover:text-tipsy-ink"
            onClick={dismiss}
            type="button"
          >
            <StoreIcon className="size-5 rotate-90" name="arrow" />
          </button>
          <div>
            <h2 className="text-lg font-bold tracking-[-0.03em] text-tipsy-ink">
              {t("cartDrawerTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-tipsy-muted">
              {t("cartItems", {
                count: items.reduce((sum, item) => sum + item.quantity, 0),
              })}
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6">
          {items.length ? (
            items.map(({ product, quantity }) => {
              const productName = product.name ?? product.id;
              return (
                <div
                  className="flex gap-4 border-b border-tipsy-line py-5"
                  key={product.id}
                >
                  <div className="relative size-18 shrink-0 overflow-hidden rounded-lg bg-tipsy-surface">
                    <BeverageImage
                      alt=""
                      className="object-contain p-1.5"
                      sizes="72px"
                      src={product.imageUrl}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm leading-5 font-bold text-tipsy-ink">
                          {productName}
                        </h3>
                        <p className="mt-1 text-xs text-tipsy-muted">
                          {product.size}
                        </p>
                      </div>
                      <button
                        aria-label={t("removeProduct", {
                          product: productName,
                        })}
                        className="shrink-0 p-1 text-tipsy-muted transition hover:text-tipsy-ink"
                        onClick={() => onQuantityChange(product.id, 0)}
                        type="button"
                      >
                        <StoreIcon className="size-4" name="trash" />
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-tipsy-ink">
                      {t("cartBottleLabel")}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="flex h-9 items-center bg-tipsy-surface px-1">
                        <button
                          aria-label={t("removeOne", {
                            product: productName,
                          })}
                          className="flex size-8 items-center justify-center text-tipsy-muted transition hover:bg-white hover:text-tipsy-ink"
                          onClick={() =>
                            onQuantityChange(product.id, quantity - 1)
                          }
                          type="button"
                        >
                          <StoreIcon className="size-4" name="minus" />
                        </button>
                        <span className="w-7 text-center text-xs font-semibold text-tipsy-ink">
                          {quantity}
                        </span>
                        <button
                          aria-label={t("addProduct", {
                            product: productName,
                          })}
                          className="flex size-8 items-center justify-center text-tipsy-muted transition hover:bg-white hover:text-tipsy-ink"
                          onClick={() =>
                            onQuantityChange(product.id, quantity + 1)
                          }
                          type="button"
                        >
                          <StoreIcon className="size-4" name="plus" />
                        </button>
                      </div>
                      <strong className="text-sm text-tipsy-ink">
                        {formatPrice(product.price * quantity)}
                      </strong>
                    </div>
                    <button
                      className="mt-2 inline-flex items-center gap-1 text-xs text-tipsy-muted transition hover:text-tipsy-ink"
                      type="button"
                    >
                      <StoreIcon className="size-3.5" name="heart" />
                      {t("saveForLater")}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-12 text-center text-sm text-tipsy-muted">
              {t("emptyCart")}
            </p>
          )}
        </div>
        <div className="border-t border-tipsy-line bg-white px-5 py-4 sm:px-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-tipsy-ink">
                {t("subtotal")}{" "}
                <span className="font-normal text-tipsy-muted">
                  {t("cartItems", {
                    count: items.reduce((sum, item) => sum + item.quantity, 0),
                  })}
                </span>
              </p>
              <p className="mt-1 text-xs leading-4 text-tipsy-muted">
                {t("cartPriceNote")}
              </p>
            </div>
            <strong className="text-lg font-bold tracking-[-0.03em] text-tipsy-ink">
              {formatPrice(total)}
            </strong>
          </div>
          {appliedPromo ? (
            <div className="mt-3 flex items-center justify-between text-xs text-tipsy-muted">
              <span>Promo · {appliedPromo.code}</span>
              <strong className="text-tipsy-ink">
                −{formatPrice(promoDiscount)}
              </strong>
            </div>
          ) : null}
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void applyPromo();
            }}
          >
            <div className="flex h-11 overflow-hidden rounded-xl border border-tipsy-line">
              <input
                aria-label={t("promoCode")}
                className="min-w-0 flex-1 px-3 text-sm uppercase outline-none placeholder:text-tipsy-muted placeholder:normal-case"
                onChange={(event) => {
                  setPromoCode(event.target.value);
                  setPromoFeedback(null);
                }}
                placeholder={t("promoCode")}
                value={promoCode}
              />
              <button
                className="w-20 bg-tipsy-surface text-sm font-semibold text-tipsy-muted transition hover:bg-tipsy-amber-100 hover:text-tipsy-ink"
                type="submit"
              >
                {t("promoAdd")}
              </button>
            </div>
            {promoFeedback ? (
              <p
                className={`mt-2 text-xs font-medium ${promoFeedback.isError ? "text-red-700" : "text-tipsy-olive"}`}
                role="status"
              >
                {promoFeedback.message}
              </p>
            ) : null}
          </form>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              className="h-11 rounded-xl border border-tipsy-line px-3 text-sm font-semibold text-tipsy-ink transition hover:bg-tipsy-surface"
              onClick={viewCart}
              type="button"
            >
              {t("viewCart")}
            </button>
            <button
              className="h-11 rounded-xl bg-tipsy-amber-500 px-3 text-sm font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!items.length}
              onClick={onCheckout}
              type="button"
            >
              {t("checkout")}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
