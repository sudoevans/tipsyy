"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import BeverageImage from "./BeverageImage";
import PostPurchaseAccount from "./PostPurchaseAccount";
import {
  clearCartForCheckout,
  readCheckoutDetails,
  readCouponCode,
  readDeliveryDetails,
  readDeliveryLocation,
  restoreCartForCheckout,
  saveCheckoutDetails,
  saveDeliveryLocation,
} from "./cartStorage";
import { getCurrentDeliveryLocation } from "./deliveryLocation";
import { formatPrice } from "./currency";
import StoreIcon from "./StoreIcon";
import useCatalogProducts from "./useCatalogProducts";

type CheckoutStep =
  "details" | "payment" | "waiting" | "failed" | "complete" | "tracking";
type MobileCheckoutView = "details" | "summary";
type CheckoutToast = { description?: string; title: string };
type PaymentFailureKind = "cancelled" | "timed_out" | "failed";
interface PaymentReceipt {
  code: string;
  paidAt: string;
}

interface CheckoutLineItem {
  productSlug: string;
  name: string;
  imageUrl: string | null;
  size: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface CheckoutSession {
  accessToken: string;
  deliveryFee: number;
  discount: number;
  orderNumber: string;
  paymentId: string;
  paymentInitiated: boolean;
  subtotal: number;
  total: number;
  items?: CheckoutLineItem[];
  paymentInitiatedAt?: string;
}

interface OrderSnapshot {
  orderNumber: string;
  status: string;
  payment: { status: string; receipt: string | null; paidAt: string | null };
  totals: {
    subtotal: number;
    discount: number;
    deliveryFee: number;
    total: number;
  };
  reservationExpiresAt?: string | null;
}

function paymentFailureKind(
  snapshot: Pick<OrderSnapshot, "status" | "payment">,
): PaymentFailureKind | null {
  if (
    snapshot.payment.status === "CANCELLED" ||
    snapshot.status === "PAYMENT_CANCELLED"
  )
    return "cancelled";
  if (snapshot.payment.status === "TIMED_OUT") return "timed_out";
  if (
    snapshot.payment.status === "FAILED" ||
    snapshot.status === "PAYMENT_FAILED"
  )
    return "failed";
  return null;
}

function cartMatchesCheckoutSession(
  cart: Record<string, number>,
  orderItems: CheckoutLineItem[] | undefined,
) {
  if (!orderItems?.length) return false;
  const expected = new Map(
    orderItems.map((item) => [item.productSlug, item.quantity]),
  );
  const actual = Object.entries(cart).filter(([, quantity]) => quantity > 0);
  return (
    actual.length === expected.size &&
    actual.every(([slug, quantity]) => expected.get(slug) === quantity)
  );
}

const CHECKOUT_SESSION_KEY = "tipsy-theoryy-active-order";
const STOCK_ISSUE_STORAGE_KEY = "tipsy-theoryy-stock-issue";

class CheckoutRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "CheckoutRequestError";
  }
}

async function responseData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !payload.data)
    throw new CheckoutRequestError(
      payload.error?.message ?? "The request could not be completed.",
      payload.error?.code,
    );
  return payload.data;
}

function OrderTracking({
  location,
  orderNumber,
  orderStatus,
}: {
  location: string;
  orderNumber: string;
  orderStatus: string;
}) {
  const preparing = [
    "CONFIRMED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "RIDER_ASSIGNED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ].includes(orderStatus);
  const riderActive = [
    "RIDER_ASSIGNED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ].includes(orderStatus);
  const steps = [
    {
      description: "Your payment and order are confirmed.",
      name: "Order confirmed",
      status: "complete" as const,
    },
    {
      description: "The store is packing your drinks.",
      name: "Preparing your drinks",
      status: preparing ? ("complete" as const) : ("active" as const),
    },
    {
      description: "We’ll notify you when your rider leaves the store.",
      name: "Rider on the way",
      status: riderActive
        ? ("complete" as const)
        : preparing
          ? ("active" as const)
          : ("upcoming" as const),
    },
  ];

  return (
    <div>
      <p className="text-[13px] font-semibold text-tipsy-amber-700">
        Order #{orderNumber}
      </p>
      <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.035em]">
        Preparing your order
      </h1>
      <p className="mt-2 text-[14px] leading-5 text-tipsy-muted">
        We’ll notify you when a rider is on the way to{" "}
        {location || "your delivery area"}.
      </p>
      <ol className="mt-6 max-w-md">
        {steps.map((step, index) => (
          <li className="flex" key={step.name}>
            <div className="flex w-6 shrink-0 flex-col items-center">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full ${step.status === "complete" ? "bg-tipsy-amber-500 text-tipsy-ink" : step.status === "active" ? "border-2 border-tipsy-ink bg-white" : "border border-[#ded9d0] bg-white"}`}
              >
                {step.status === "complete" ? (
                  <StoreIcon className="size-3.5" name="check" />
                ) : step.status === "active" ? (
                  <span className="size-2 rounded-full bg-tipsy-ink" />
                ) : null}
              </span>
              {index < steps.length - 1 ? (
                <span
                  className={`my-1.5 w-px grow ${step.status === "complete" ? "bg-tipsy-amber-500" : "bg-[#ded9d0]"}`}
                />
              ) : null}
            </div>
            <div className="min-w-0 pb-6 pl-3">
              <p className="text-[14px] font-semibold text-tipsy-ink">
                {step.name}
              </p>
              <p className="mt-1 text-[13px] leading-5 text-tipsy-muted">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const surfaceClass = "rounded-2xl border border-[#e9e5dd] bg-white shadow-none";
const SUMMARY_PAGE_SIZE = 3;
const MOBILE_SUMMARY_PAGE_SIZE = 2;

function formatKenyanPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("254")) {
    const subscriber = digits.slice(3, 12);
    return [
      "+254",
      subscriber.slice(0, 3),
      subscriber.slice(3, 6),
      subscriber.slice(6, 9),
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (digits.startsWith("0")) {
    const national = digits.slice(0, 10);
    return [national.slice(0, 4), national.slice(4, 7), national.slice(7, 10)]
      .filter(Boolean)
      .join(" ");
  }

  const subscriber = digits.slice(0, 9);
  return [
    subscriber.slice(0, 3),
    subscriber.slice(3, 6),
    subscriber.slice(6, 9),
  ]
    .filter(Boolean)
    .join(" ");
}

export default function CheckoutExperience() {
  const router = useRouter();
  const { isLoading: isCatalogLoading, products } = useCatalogProducts();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCoordinates, setDeliveryCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("details");
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [confirmationCodeError, setConfirmationCodeError] = useState("");
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState<PaymentReceipt | null>(
    null,
  );
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [summaryPage, setSummaryPage] = useState(0);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [isMobileSummaryOpen, setIsMobileSummaryOpen] = useState(false);
  const [mobileCheckoutView, setMobileCheckoutView] =
    useState<MobileCheckoutView>("summary");
  const [isAdvancingToPayment, setIsAdvancingToPayment] = useState(false);
  const mobileDetailsFormRef = useRef<HTMLFormElement>(null);
  const [isSendingPayment, setIsSendingPayment] = useState(false);
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);
  const [toast, setToast] = useState<CheckoutToast | null>(null);
  const [checkoutSession, setCheckoutSession] =
    useState<CheckoutSession | null>(null);
  const [orderSnapshot, setOrderSnapshot] = useState<OrderSnapshot | null>(
    null,
  );
  const [paymentFailure, setPaymentFailure] =
    useState<PaymentFailureKind | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [deliveryQuote, setDeliveryQuote] = useState({
    fee: 0,
    distanceKm: null as number | null,
    ratePerKm: 0,
  });

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        const restored = await restoreCartForCheckout();
        if (!active) return;
        setCart(restored);
        setIsReady(true);
        const savedLocation = readDeliveryDetails();
        setDeliveryLocation(savedLocation?.area ?? readDeliveryLocation());
        setDeliveryAddress(savedLocation?.addressLine ?? "");
        setDeliveryCoordinates(
          savedLocation &&
            Number.isFinite(savedLocation.latitude) &&
            Number.isFinite(savedLocation.longitude)
            ? {
                latitude: savedLocation.latitude,
                longitude: savedLocation.longitude,
              }
            : null,
        );
        setDeliveryInstructions(savedLocation?.instructions ?? "");
        const savedDetails = readCheckoutDetails();
        setCustomer({
          ...savedDetails,
          phone: formatKenyanPhone(savedDetails.phone),
        });

        try {
          const storedOrder = window.localStorage.getItem(CHECKOUT_SESSION_KEY);
          if (!storedOrder) return;
          const session = JSON.parse(storedOrder) as CheckoutSession;
          const response = await fetch(
            `/api/v1/orders/${encodeURIComponent(session.orderNumber)}`,
            {
              headers: { Authorization: `Bearer ${session.accessToken}` },
              cache: "no-store",
            },
          );
          const snapshot = await responseData<OrderSnapshot>(response);
          if (!active) return;

          // A new cart must never inherit an unrelated M-Pesa order. Only
          // restore a payment session when its reserved items still match the
          // cart the shopper opened checkout with.
          if (!cartMatchesCheckoutSession(restored, session.items)) {
            window.localStorage.removeItem(CHECKOUT_SESSION_KEY);
            return;
          }

          const reservationIsActive =
            !snapshot.reservationExpiresAt ||
            new Date(snapshot.reservationExpiresAt).getTime() > Date.now();
          if (snapshot.payment.status === "SUCCEEDED") {
            clearCartForCheckout();
            setCart({});
            window.localStorage.removeItem(CHECKOUT_SESSION_KEY);
            return;
          }
          if (snapshot.status === "PENDING_PAYMENT" && reservationIsActive) {
            setCheckoutSession(session);
            setOrderSnapshot(snapshot);
            setStep(session.paymentInitiated ? "waiting" : "payment");
            return;
          }
          const failure = paymentFailureKind(snapshot);
          if (failure) {
            setCheckoutSession(session);
            setOrderSnapshot(snapshot);
            setPaymentFailure(failure);
            setStep("failed");
            return;
          }
          window.localStorage.removeItem(CHECKOUT_SESSION_KEY);
        } catch {
          window.localStorage.removeItem(CHECKOUT_SESSION_KEY);
        }
      })();
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (isReady) saveCheckoutDetails(customer);
  }, [customer, isReady]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const items = useMemo(
    () =>
      products
        .filter((product) => cart[product.id])
        .map((product) => ({ product, quantity: cart[product.id] })),
    [cart, products],
  );

  useEffect(() => {
    if (!deliveryCoordinates || items.length === 0) {
      return;
    }
    let active = true;
    void fetch("/api/v1/cart/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map(({ product, quantity }) => ({
          productSlug: product.id,
          quantity,
        })),
        delivery: deliveryCoordinates,
        couponCode: readCouponCode() || undefined,
      }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: {
            deliveryFee: number;
            deliveryDistanceKm: number | null;
            deliveryRatePerKm: number | null;
          };
        };
        if (!response.ok || !payload.data)
          throw new Error("Delivery quote unavailable");
        if (active)
          setDeliveryQuote({
            fee: payload.data.deliveryFee,
            distanceKm: payload.data.deliveryDistanceKm,
            ratePerKm: payload.data.deliveryRatePerKm ?? 0,
          });
      })
      .catch(() => {
        if (active)
          setDeliveryQuote({ fee: 0, distanceKm: null, ratePerKm: 0 });
      });
    return () => {
      active = false;
    };
  }, [cart, deliveryCoordinates, items]);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const clientSubtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  const subtotal = checkoutSession?.subtotal ?? clientSubtotal;
  const deliveryFee =
    checkoutSession?.deliveryFee ??
    (items.length && deliveryCoordinates ? deliveryQuote.fee : 0);
  const total = checkoutSession?.total ?? subtotal + deliveryFee;
  const failedPaymentCopy =
    paymentFailure === "cancelled"
      ? {
          title: "Payment cancelled",
          description:
            "You cancelled the M-Pesa prompt. Nothing has been charged.",
        }
      : paymentFailure === "timed_out"
        ? {
            title: "Payment timed out",
            description: "The M-Pesa prompt expired. Nothing has been charged.",
          }
        : {
            title: "Payment unsuccessful",
            description:
              "Your M-Pesa payment was declined or could not be completed. Nothing has been charged.",
          };
  const stepIndex =
    step === "details"
      ? 1
      : step === "payment" || step === "waiting" || step === "failed"
        ? 2
        : 3;
  const mobileStepIndex =
    step === "details"
      ? 1
      : step === "payment" || step === "waiting" || step === "failed"
        ? 2
        : 3;
  const checkoutColumnLayout = "xl:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]";
  const summaryItems = isSummaryExpanded
    ? items
    : items.slice(0, SUMMARY_PAGE_SIZE);
  const mobileSummaryPageCount = Math.max(
    1,
    Math.ceil(items.length / MOBILE_SUMMARY_PAGE_SIZE),
  );
  const currentMobileSummaryPage = Math.min(
    summaryPage,
    mobileSummaryPageCount - 1,
  );
  const mobileSummaryItems = items.slice(
    currentMobileSummaryPage * MOBILE_SUMMARY_PAGE_SIZE,
    (currentMobileSummaryPage + 1) * MOBILE_SUMMARY_PAGE_SIZE,
  );

  useEffect(() => {
    if (step !== "waiting" || !checkoutSession) return;
    let cancelled = false;
    let timeout: number | undefined;
    const initiatedAt = checkoutSession.paymentInitiatedAt
      ? new Date(checkoutSession.paymentInitiatedAt).getTime()
      : Date.now();
    const remainingPromptTime = Math.max(
      0,
      30_000 - (Date.now() - initiatedAt),
    );
    const inactivityTimeout = window.setTimeout(() => {
      if (cancelled) return;
      void (async () => {
        try {
          await responseData(
            await fetch("/api/v1/payments/mpesa/cancel", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderNumber: checkoutSession.orderNumber,
                accessToken: checkoutSession.accessToken,
                reason: "TIMED_OUT",
              }),
            }),
          );
          if (cancelled) return;
          setPaymentFailure("timed_out");
          setStep("failed");
          setToast({
            title: "Payment timed out",
            description:
              "The M-Pesa prompt expired after 30 seconds of inactivity.",
          });
        } catch {
          // A callback may have settled the payment at the same time; the next
          // status poll is the source of truth in that race.
        }
      })();
    }, remainingPromptTime);
    const poll = async () => {
      try {
        const snapshot = await responseData<OrderSnapshot>(
          await fetch(
            `/api/v1/orders/${encodeURIComponent(checkoutSession.orderNumber)}`,
            {
              headers: {
                Authorization: `Bearer ${checkoutSession.accessToken}`,
              },
              cache: "no-store",
            },
          ),
        );
        if (cancelled) return;
        setOrderSnapshot(snapshot);
        if (snapshot.payment.status === "SUCCEEDED") {
          setPaymentReceipt({
            code: snapshot.payment.receipt ?? "—",
            paidAt: snapshot.payment.paidAt
              ? new Intl.DateTimeFormat("en-KE", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(snapshot.payment.paidAt))
              : "—",
          });
          clearCartForCheckout();
          window.localStorage.removeItem(CHECKOUT_SESSION_KEY);
          setCart({});
          setStep("complete");
          setToast({
            title: "Payment confirmed",
            description: `Order ${snapshot.orderNumber} is confirmed.`,
          });
          return;
        }
        const failure = paymentFailureKind(snapshot);
        if (failure) {
          setPaymentFailure(failure);
          setStep("failed");
          setToast({
            title:
              failure === "cancelled"
                ? "Payment cancelled"
                : "Payment wasn’t completed",
            description: "Your reserved stock has been released.",
          });
          return;
        }
      } catch (error) {
        if (!cancelled)
          setToast({
            title: "Still checking payment",
            description:
              error instanceof Error
                ? error.message
                : "We’ll try again shortly.",
          });
      }
      if (!cancelled) timeout = window.setTimeout(poll, 2500);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
      window.clearTimeout(inactivityTimeout);
    };
  }, [checkoutSession, step]);

  const persistCheckoutSession = (session: CheckoutSession) => {
    setCheckoutSession(session);
    window.localStorage.setItem(CHECKOUT_SESSION_KEY, JSON.stringify(session));
  };

  const requestPayment = async () => {
    if (!checkoutSession || isSendingPayment) return;
    setIsIssueOpen(false);
    setConfirmationCode("");
    setConfirmationCodeError("");
    setIsSendingPayment(true);
    try {
      const result = await responseData<{ customerMessage?: string }>(
        await fetch("/api/v1/payments/mpesa/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderNumber: checkoutSession.orderNumber,
            accessToken: checkoutSession.accessToken,
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      );
      persistCheckoutSession({
        ...checkoutSession,
        paymentInitiated: true,
        paymentInitiatedAt: new Date().toISOString(),
      });
      setStep("waiting");
      setToast({
        title: "M-Pesa prompt sent",
        description:
          result.customerMessage ?? "Approve the payment prompt on your phone.",
      });
    } catch (error) {
      setToast({
        title: "M-Pesa prompt not sent",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSendingPayment(false);
    }
  };

  const cancelPendingPayment = async (
    reason: "CANCELLED" | "TIMED_OUT" = "CANCELLED",
  ) => {
    if (!checkoutSession || isCancellingPayment) return;
    setIsCancellingPayment(true);
    try {
      await responseData(
        await fetch("/api/v1/payments/mpesa/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderNumber: checkoutSession.orderNumber,
            accessToken: checkoutSession.accessToken,
            reason,
          }),
        }),
      );
      setPaymentFailure(reason === "TIMED_OUT" ? "timed_out" : "cancelled");
      setStep("failed");
      setToast({
        title:
          reason === "TIMED_OUT" ? "Payment timed out" : "Payment cancelled",
        description:
          reason === "TIMED_OUT"
            ? "The M-Pesa prompt expired after 30 seconds of inactivity."
            : "Your M-Pesa payment was cancelled and the stock has been released.",
      });
    } catch (error) {
      setToast({
        title: "Couldn’t cancel payment",
        description:
          error instanceof Error
            ? error.message
            : "Please wait for the M-Pesa response.",
      });
    } finally {
      setIsCancellingPayment(false);
    }
  };

  const updateCurrentLocation = async () => {
    if (isRequestingLocation) return;
    setIsRequestingLocation(true);
    try {
      const current = await getCurrentDeliveryLocation(deliveryInstructions);
      setDeliveryLocation(current.area);
      setDeliveryAddress(current.addressLine);
      setDeliveryCoordinates({
        latitude: current.latitude,
        longitude: current.longitude,
      });
      saveDeliveryLocation({ ...current, instructions: deliveryInstructions });
      setToast({ title: "Current location updated" });
    } catch (error) {
      setToast({
        title: "Couldn’t get current location",
        description:
          error instanceof Error
            ? error.message
            : "Allow location access and try again.",
      });
    } finally {
      setIsRequestingLocation(false);
    }
  };

  const continueToPayment = async () => {
    if (isAdvancingToPayment) return;
    if (!deliveryCoordinates || !deliveryLocation || !deliveryAddress) {
      setToast({
        title: "Add your current location",
        description: "Use current location before continuing to payment.",
      });
      return;
    }
    setIsAdvancingToPayment(true);
    try {
      saveDeliveryLocation({
        area: deliveryLocation,
        addressLine: deliveryAddress,
        latitude: deliveryCoordinates.latitude,
        longitude: deliveryCoordinates.longitude,
        instructions: deliveryInstructions.trim(),
      });
      const created = await responseData<CheckoutSession>(
        await fetch("/api/v1/checkout/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map(({ product, quantity }) => ({
              productSlug: product.id,
              quantity,
            })),
            customer,
            delivery: {
              area: deliveryLocation,
              addressLine: deliveryAddress,
              latitude: deliveryCoordinates.latitude,
              longitude: deliveryCoordinates.longitude,
              instructions: deliveryInstructions.trim() || undefined,
            },
            couponCode: readCouponCode() || undefined,
          }),
        }),
      );
      persistCheckoutSession({ ...created, paymentInitiated: false });
      setStep("payment");
      setMobileCheckoutView("details");
    } catch (error) {
      if (
        error instanceof CheckoutRequestError &&
        ["INSUFFICIENT_STOCK", "CART_ITEM_UNAVAILABLE"].includes(
          error.code ?? "",
        )
      ) {
        window.sessionStorage.setItem(STOCK_ISSUE_STORAGE_KEY, "1");
        router.push("/cart");
        return;
      }
      setToast({
        title: "Checkout needs attention",
        description:
          error instanceof Error
            ? error.message
            : "Please review your details.",
      });
    } finally {
      setIsAdvancingToPayment(false);
    }
  };

  const retryPayment = () => {
    window.localStorage.removeItem(CHECKOUT_SESSION_KEY);
    setCheckoutSession(null);
    setOrderSnapshot(null);
    setPaymentFailure(null);
    void continueToPayment();
  };

  const cancelCheckout = () => {
    window.localStorage.removeItem(CHECKOUT_SESSION_KEY);
    router.push("/");
  };

  const reportPaymentIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = confirmationCode.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z0-9]{8,20}$/.test(code)) {
      setConfirmationCodeError(
        "Enter the receipt code from your M-Pesa message.",
      );
      return;
    }

    if (!checkoutSession) return;
    setIsCheckingCode(true);
    try {
      await responseData<{ id: string; status: string }>(
        await fetch("/api/v1/payments/mpesa/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderNumber: checkoutSession.orderNumber,
            accessToken: checkoutSession.accessToken,
            receipt: code,
          }),
        }),
      );
      setToast({
        title: "Payment reported",
        description:
          "Our support team will review the M-Pesa receipt for this order.",
      });
      setIsIssueOpen(false);
      setConfirmationCode("");
    } catch (error) {
      setConfirmationCodeError(
        error instanceof Error
          ? error.message
          : "We could not submit that payment report.",
      );
    } finally {
      setIsCheckingCode(false);
    }
  };

  if (!isReady || isCatalogLoading)
    return <main className="min-h-screen bg-tipsy-canvas" />;

  if (!items.length && step !== "complete" && step !== "tracking") {
    return (
      <main className="grid min-h-screen place-items-center bg-tipsy-canvas px-4 text-center text-tipsy-ink">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.05em]">
            Your cart is empty
          </h1>
          <p className="mt-3 text-sm text-tipsy-muted">
            Add drinks to your cart before checking out.
          </p>
          <Link
            className="mt-6 inline-flex rounded-xl bg-tipsy-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-tipsy-amber-700"
            href="/"
          >
            Continue shopping
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`min-h-dvh bg-[#faf9f6] text-tipsy-ink ${step === "payment" || step === "details" ? "pb-[84px]" : "pb-5"} sm:pb-0`}
    >
      <div className="bg-[#171614] text-white">
        <div className="mx-auto flex h-12 max-w-[1120px] items-center justify-between gap-4 px-4 sm:h-16 sm:px-7">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <StoreIcon
              className="size-5 shrink-0 text-tipsy-amber-500"
              name="location"
            />
            <span className="hidden text-sm text-white/55 sm:block">
              Delivery location
            </span>
            <span className="hidden h-6 w-px bg-white/35 sm:block" />
            <strong className="truncate text-[13px] font-semibold text-white sm:text-base">
              {deliveryAddress || "Add your current location"}
            </strong>
          </div>
          <button
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-semibold text-tipsy-amber-500 underline decoration-1 underline-offset-4 transition hover:text-tipsy-amber-300 sm:text-base"
            onClick={() => void updateCurrentLocation()}
            disabled={isRequestingLocation}
            type="button"
          >
            {isRequestingLocation ? "Getting location…" : "Update location"}{" "}
            <StoreIcon className="size-4 sm:size-5" name="arrow-right" />
          </button>
        </div>
      </div>
      <header className="hidden border-b border-[#e9e5dd] bg-white sm:block">
        <div className="mx-auto flex h-[86px] max-w-[1120px] items-center justify-between px-4 sm:px-7">
          <Link
            aria-label="Tipsy Theoryy home"
            className="text-[26px] font-bold tracking-[-0.075em]"
            href="/"
          >
            tipsy<span className="text-tipsy-amber-500">.</span>theoryy
          </Link>
          <span className="inline-flex items-center gap-2.5 text-[15px] text-tipsy-muted">
            <StoreIcon className="size-[18px] text-tipsy-ink" name="lock" />
            Secure checkout
          </span>
        </div>
      </header>
      <div
        className={`sm:hidden [&_h1]:text-[24px] [&_h1]:leading-[1.1] [&_h1]:tracking-[-0.04em] ${step === "details" ? "[&_form>button:last-child]:hidden [&_section>button:last-child]:hidden" : ""}`}
      >
        <div className="mx-auto max-w-md px-4 py-4">
          <div className="flex items-center">
            <button
              aria-label="Back"
              className="flex size-11 items-center justify-center rounded-xl text-tipsy-ink transition active:bg-tipsy-surface"
              onClick={() => {
                if (step === "details" && mobileCheckoutView === "details")
                  setMobileCheckoutView("summary");
                else if (step === "payment") {
                  setStep("details");
                  setMobileCheckoutView("details");
                } else window.history.back();
              }}
              type="button"
            >
              <StoreIcon className="size-7" name="arrow-left" />
            </button>
          </div>
          <ol
            className="relative mt-5 grid grid-cols-3 gap-2 before:absolute before:top-[18px] before:right-[16.66%] before:left-[16.66%] before:h-px before:bg-[#ded9d0]"
            aria-label="Checkout progress"
          >
            {[
              { label: "Delivery", index: 1 },
              { label: "Pay", index: 2 },
              { label: "Done", index: 3 },
            ].map(({ label, index }) => {
              const complete = mobileStepIndex > index;
              const current = mobileStepIndex === index;
              return (
                <li
                  className="relative flex flex-col items-center text-center"
                  key={label}
                >
                  <span
                    className={`z-1 flex size-9 items-center justify-center rounded-full text-[14px] font-semibold ${complete ? "bg-tipsy-ink text-white" : current ? "bg-tipsy-amber-500 text-tipsy-ink" : "bg-tipsy-surface text-tipsy-ink"}`}
                  >
                    {complete ? (
                      <StoreIcon className="size-4" name="check" />
                    ) : (
                      index
                    )}
                  </span>
                  <span
                    className={`mt-1.5 text-[14px] ${current || complete ? "font-semibold text-tipsy-ink" : "text-tipsy-muted"}`}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>

          {step === "details" && mobileCheckoutView === "summary" ? (
            <section className={`${surfaceClass} checkout-step-enter mt-6 p-4`}>
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-[29px] leading-none font-bold tracking-[-0.055em]">
                  Order summary
                </h1>
                <span className="pt-1 text-[14px] text-tipsy-muted">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="mt-4 divide-y divide-[#e2ded6]">
                {mobileSummaryItems.map(({ product, quantity }) => (
                  <div
                    className="flex min-w-0 items-center gap-2.5 py-3 first:pt-0"
                    key={product.id}
                  >
                    <div className="relative size-[52px] shrink-0 overflow-hidden rounded-lg bg-tipsy-surface">
                      <BeverageImage
                        alt=""
                        className="object-contain p-1"
                        sizes="52px"
                        src={product.imageUrl}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[14px] font-semibold">
                        {product.name ?? product.id}
                      </p>
                      <p className="mt-0.5 text-[12px] text-tipsy-muted">
                        {quantity} × {formatPrice(product.price)}
                      </p>
                    </div>
                    <strong className="text-[14px] whitespace-nowrap">
                      {formatPrice(product.price * quantity)}
                    </strong>
                  </div>
                ))}
              </div>
              {mobileSummaryPageCount > 1 ? (
                <nav
                  aria-label="Order summary pages"
                  className="mt-3 flex items-center justify-between text-[11px] text-tipsy-muted"
                >
                  <span>
                    Items{" "}
                    {currentMobileSummaryPage * MOBILE_SUMMARY_PAGE_SIZE + 1}–
                    {Math.min(
                      (currentMobileSummaryPage + 1) * MOBILE_SUMMARY_PAGE_SIZE,
                      items.length,
                    )}{" "}
                    of {items.length}
                  </span>
                  <div className="flex gap-2">
                    <button
                      aria-label="Previous items"
                      className="flex size-7 items-center justify-center rounded-lg border border-[#ded9d0] disabled:opacity-35"
                      disabled={currentMobileSummaryPage === 0}
                      onClick={() =>
                        setSummaryPage((page) => Math.max(0, page - 1))
                      }
                      type="button"
                    >
                      <StoreIcon className="size-3.5" name="arrow-left" />
                    </button>
                    <button
                      aria-label="Next items"
                      className="flex size-7 items-center justify-center rounded-lg border border-[#ded9d0] disabled:opacity-35"
                      disabled={
                        currentMobileSummaryPage === mobileSummaryPageCount - 1
                      }
                      onClick={() =>
                        setSummaryPage((page) =>
                          Math.min(mobileSummaryPageCount - 1, page + 1),
                        )
                      }
                      type="button"
                    >
                      <StoreIcon className="size-3.5" name="arrow-right" />
                    </button>
                  </div>
                </nav>
              ) : null}
              <dl className="mt-4 grid gap-2.5 border-t border-[#e2ded6] pt-4 text-[14px]">
                <div className="flex justify-between text-tipsy-muted">
                  <dt>Subtotal</dt>
                  <dd>{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between text-tipsy-muted">
                  <dt>Delivery</dt>
                  <dd>{formatPrice(deliveryFee)}</dd>
                </div>
                <div className="border-t border-[#e2ded6] pt-4">
                  <dt className="text-tipsy-muted">Total to pay</dt>
                  <dd className="mt-1 text-[30px] leading-none font-bold tracking-[-0.055em]">
                    {formatPrice(total)}
                  </dd>
                </div>
              </dl>
              <button
                className="mt-5 h-12 w-full rounded-xl bg-tipsy-amber-500 text-[15px] font-semibold"
                onClick={() => setMobileCheckoutView("details")}
                type="button"
              >
                Continue to delivery
              </button>
            </section>
          ) : null}

          {step === "details" && mobileCheckoutView === "details" ? (
            <form
              ref={mobileDetailsFormRef}
              className={`${surfaceClass} checkout-step-enter mt-9 p-5`}
              onSubmit={(event) => {
                event.preventDefault();
                continueToPayment();
              }}
            >
              <p className="text-[14px] font-semibold tracking-[0.03em] text-tipsy-amber-700 uppercase">
                Delivery
              </p>
              <h1 className="mt-3 text-[34px] leading-none font-bold tracking-[-0.055em]">
                Delivery details
              </h1>
              <p className="mt-3 text-[15px] leading-5 text-tipsy-muted">
                We’ll use these details to send your M-Pesa prompt.
              </p>
              <div className="mt-7 grid gap-5">
                <label className="grid gap-2 text-[14px] font-semibold">
                  Name
                  <input
                    className="h-13 rounded-xl border border-[#ded9d0] bg-white px-4 text-[16px] font-medium outline-none focus:border-tipsy-amber-500 focus:ring-2 focus:ring-tipsy-amber-100"
                    onChange={(event) =>
                      setCustomer((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Name"
                    required
                    value={customer.name}
                  />
                </label>
                <label className="grid gap-2 text-[14px] font-semibold">
                  M-Pesa phone
                  <input
                    className="h-13 rounded-xl border border-[#ded9d0] bg-white px-4 text-[16px] font-medium outline-none focus:border-tipsy-amber-500 focus:ring-2 focus:ring-tipsy-amber-100"
                    inputMode="tel"
                    onChange={(event) =>
                      setCustomer((current) => ({
                        ...current,
                        phone: formatKenyanPhone(event.target.value),
                      }))
                    }
                    placeholder="0712 345 678"
                    required
                    value={customer.phone}
                  />
                </label>
              </div>
              <div className="mt-5 flex items-center gap-3 rounded-xl bg-tipsy-surface p-4">
                <StoreIcon className="size-5 shrink-0" name="location" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">
                    Current delivery location
                  </p>
                  <p className="mt-1 truncate text-[14px] text-tipsy-muted">
                    {deliveryAddress || "Location not set"}
                  </p>
                </div>
                <button
                  className="shrink-0 text-[13px] font-semibold underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 disabled:opacity-60"
                  disabled={isRequestingLocation}
                  onClick={() => void updateCurrentLocation()}
                  type="button"
                >
                  {isRequestingLocation ? "Locating…" : "Update"}
                </button>
              </div>
              {!deliveryCoordinates ? (
                <p className="mt-3 text-sm text-red-700">
                  Use current location to continue checkout.
                </p>
              ) : null}
              <label className="mt-4 grid gap-2 text-[14px] font-medium">
                Extra directions{" "}
                <span className="font-normal text-tipsy-muted">(optional)</span>
                <textarea
                  className="min-h-20 rounded-xl border border-[#d8d1c6] bg-white px-3 py-2.5 text-[15px] font-normal transition outline-none placeholder:text-tipsy-muted focus:border-tipsy-amber-500 focus:ring-2 focus:ring-tipsy-amber-100"
                  maxLength={500}
                  onChange={(event) =>
                    setDeliveryInstructions(event.target.value)
                  }
                  placeholder="e.g. Hostel name and room number"
                  value={deliveryInstructions}
                />
              </label>
              <button
                className="mt-7 h-13 w-full rounded-xl bg-tipsy-amber-500 text-[16px] font-semibold text-tipsy-ink disabled:opacity-70"
                disabled={isAdvancingToPayment}
                type="submit"
              >
                {isAdvancingToPayment
                  ? "Preparing payment…"
                  : "Continue to payment"}
              </button>
            </form>
          ) : null}

          {step === "payment" ? (
            <section className={`${surfaceClass} checkout-step-enter mt-9 p-5`}>
              <p className="text-[14px] font-semibold tracking-[0.03em] text-tipsy-amber-700 uppercase">
                M-Pesa payment
              </p>
              <h1 className="mt-3 text-[34px] leading-[1.06] font-bold tracking-[-0.055em]">
                Confirm on your phone
              </h1>
              <p className="mt-3 text-[16px] leading-6 text-tipsy-muted">
                We’ll send the payment prompt to{" "}
                <strong className="font-semibold text-tipsy-ink">
                  {customer.phone}
                </strong>
                .
              </p>
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-tipsy-surface p-4">
                <Image
                  alt="M-Pesa"
                  className="h-8 w-auto object-contain"
                  height={32}
                  src="/images/payment/mpesa.svg"
                  width={106}
                />
                <span className="h-8 w-px bg-[#d8d3ca]" />
                <span className="text-[15px] leading-5 font-semibold">
                  Secure M-Pesa checkout
                </span>
              </div>
              <div className="mt-5 flex items-end justify-between border-y border-[#e2ded6] py-4">
                <span className="text-[16px] text-tipsy-muted">
                  Total to pay
                </span>
                <strong className="text-[32px] leading-none font-bold tracking-[-0.055em] whitespace-nowrap">
                  {formatPrice(total)}
                </strong>
              </div>
              <button
                className="mt-5 inline-flex items-center gap-2 text-[14px] font-semibold text-tipsy-muted underline decoration-tipsy-amber-500 decoration-2 underline-offset-4"
                onClick={() => {
                  setStep("details");
                  setMobileCheckoutView("details");
                }}
                type="button"
              >
                <StoreIcon className="size-4" name="pencil" />
                Edit name or number
              </button>
            </section>
          ) : null}

          {step === "waiting" ? (
            <section
              className={`${surfaceClass} checkout-step-enter mt-9 p-6 text-center`}
            >
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-tipsy-surface">
                <span className="size-5 animate-spin rounded-full border-2 border-tipsy-line border-t-tipsy-ink" />
              </span>
              <h1 className="mt-5 text-[30px] font-bold tracking-[-0.05em]">
                Waiting for confirmation
              </h1>
              <p className="mt-3 text-[15px] leading-5 text-tipsy-muted">
                Approve the M-Pesa prompt on your phone. We’ll update this page
                when the result arrives.
              </p>
              <div className="mt-6 grid gap-3">
                <button
                  className="text-sm font-semibold underline decoration-tipsy-amber-500 decoration-2 underline-offset-4"
                  onClick={() => setIsIssueOpen(true)}
                  type="button"
                >
                  Report a payment issue
                </button>
                <button
                  className="text-sm font-semibold text-tipsy-muted underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 disabled:opacity-60"
                  disabled={isCancellingPayment}
                  onClick={() => void cancelPendingPayment()}
                  type="button"
                >
                  {isCancellingPayment
                    ? "Cancelling payment…"
                    : "Cancel payment"}
                </button>
              </div>
            </section>
          ) : null}
          {step === "failed" ? (
            <section
              className={`${surfaceClass} checkout-step-enter mt-9 p-6 text-center`}
            >
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-tipsy-surface">
                <StoreIcon className="size-6" name="close" />
              </span>
              <h1 className="mt-5 text-[30px] font-bold tracking-[-0.05em]">
                {failedPaymentCopy.title}
              </h1>
              <p className="mt-3 text-[15px] leading-5 text-tipsy-muted">
                {failedPaymentCopy.description}
              </p>
              <div className="mt-7 grid gap-3">
                <button
                  className="h-13 w-full rounded-xl bg-tipsy-amber-500 text-[16px] font-semibold"
                  onClick={retryPayment}
                  type="button"
                >
                  Retry payment
                </button>
                <button
                  className="h-11 text-[15px] font-semibold text-tipsy-muted underline decoration-tipsy-amber-500 decoration-2 underline-offset-4"
                  onClick={cancelCheckout}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </section>
          ) : null}
          {step === "complete" && checkoutSession ? (
            <section
              className={`${surfaceClass} checkout-step-enter mt-9 p-6 text-center`}
            >
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-tipsy-amber-500">
                <StoreIcon className="size-7" name="check" />
              </span>
              <h1 className="mt-5 text-[30px] font-bold tracking-[-0.05em]">
                Payment successful
              </h1>
              <p className="mt-3 text-[15px] leading-5 text-tipsy-muted">
                Your order is confirmed and is now being prepared.
              </p>
              <div className="mt-6 rounded-xl bg-tipsy-surface p-4 text-left text-[14px]">
                <div className="flex justify-between gap-4">
                  <span className="text-tipsy-muted">M-Pesa receipt</span>
                  <strong>{paymentReceipt?.code ?? "—"}</strong>
                </div>
                <div className="mt-3 flex justify-between gap-4">
                  <span className="text-tipsy-muted">Date & time</span>
                  <strong className="text-right">
                    {paymentReceipt?.paidAt ?? "—"}
                  </strong>
                </div>
                <div className="mt-3 flex justify-between gap-4">
                  <span className="text-tipsy-muted">Amount paid</span>
                  <strong>{formatPrice(total)}</strong>
                </div>
                <div className="mt-3 flex justify-between gap-4">
                  <span className="text-tipsy-muted">Order reference</span>
                  <strong>{checkoutSession.orderNumber}</strong>
                </div>
              </div>
              <PostPurchaseAccount
                accessToken={checkoutSession.accessToken}
                displayName={customer.name}
                onMessage={(title, description) =>
                  setToast({ title, description })
                }
                orderNumber={checkoutSession.orderNumber}
                phone={customer.phone}
                estimatedPoints={Math.floor(Math.max(0, checkoutSession.subtotal - checkoutSession.discount) / 10_000)}
              />
              <button
                className="mt-7 h-13 w-full rounded-xl bg-tipsy-amber-500 text-[16px] font-semibold"
                onClick={() => setStep("tracking")}
                type="button"
              >
                Track order
              </button>
            </section>
          ) : null}
          {step === "tracking" && checkoutSession ? (
            <section className={`${surfaceClass} checkout-step-enter mt-6 p-5`}>
              <OrderTracking
                location={deliveryAddress || deliveryLocation}
                orderNumber={checkoutSession.orderNumber}
                orderStatus={orderSnapshot?.status ?? "CONFIRMED"}
              />
            </section>
          ) : null}
        </div>
        {step === "payment" ? (
          <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-[#e2ded6] bg-white px-4 py-3">
            <div className="mx-auto flex max-w-md items-center gap-3">
              <div className="min-w-0 shrink-0">
                <span className="block text-[11px] font-semibold text-tipsy-muted">
                  Total to pay
                </span>
                <strong className="block text-[15px] tracking-[-0.03em] whitespace-nowrap">
                  {formatPrice(total)}
                </strong>
              </div>
              <button
                className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-tipsy-amber-500 px-3 text-[14px] font-semibold text-tipsy-ink disabled:cursor-wait disabled:opacity-70"
                disabled={isSendingPayment}
                onClick={() => void requestPayment()}
                type="button"
              >
                <StoreIcon className="size-4 shrink-0" name="bag" />
                <span className="truncate">
                  {isSendingPayment
                    ? "Sending prompt…"
                    : `Pay ${formatPrice(total)}`}
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {step === "details" ? (
        <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-[#e2ded6] bg-white/95 px-4 py-3 backdrop-blur-sm sm:hidden">
          <div className="mx-auto max-w-md">
            <button
              aria-busy={isAdvancingToPayment}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tipsy-amber-500 px-3 text-[14px] font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300 disabled:cursor-wait disabled:opacity-75"
              disabled={isAdvancingToPayment}
              onClick={() => {
                if (mobileCheckoutView === "summary")
                  setMobileCheckoutView("details");
                else mobileDetailsFormRef.current?.requestSubmit();
              }}
              type="button"
            >
              {isAdvancingToPayment ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-tipsy-ink/25 border-t-tipsy-ink" />
                  Preparing payment…
                </>
              ) : mobileCheckoutView === "summary" ? (
                "Continue to delivery"
              ) : (
                "Continue to payment"
              )}
            </button>
          </div>
        </div>
      ) : null}
      <div className="checkout-desktop mx-auto hidden max-w-[1150px] px-4 py-5 sm:block sm:px-7 sm:py-6 xl:[&_form_h1]:text-[27px] xl:[&_h1]:text-[30px] xl:[&_h1]:leading-tight xl:[&_h1]:font-semibold xl:[&_h1]:tracking-[-0.035em] xl:[&_h2]:font-semibold xl:[&_input]:h-12 xl:[&_input]:text-[15px] xl:[&_label]:text-[14px]">
        <Link
          className="inline-flex items-center gap-2 text-[14px] text-tipsy-muted transition hover:text-tipsy-ink"
          href="/"
        >
          <StoreIcon className="size-4" name="arrow-left" />
          Back
        </Link>
        <ol
          aria-label="Checkout progress"
          className="mt-5 grid max-w-[600px] grid-cols-3 gap-3"
        >
          {[
            { label: "Delivery", index: 1 },
            { label: "Payment", index: 2 },
            { label: "Confirmation", index: 3 },
          ].map(({ label, index }) => {
            const isComplete = stepIndex > index;
            const isCurrent = stepIndex === index;
            return (
              <li
                className="relative flex items-center justify-center gap-2.5 text-[14px]"
                key={label}
              >
                <span
                  className={`z-1 flex size-10 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold ${isComplete ? "bg-tipsy-ink text-white" : isCurrent ? "bg-tipsy-amber-500 text-tipsy-ink" : "border border-[#ded9d0] bg-white text-tipsy-muted"}`}
                >
                  {isComplete ? (
                    <StoreIcon className="size-4" name="check" />
                  ) : (
                    index
                  )}
                </span>
                <span
                  className={
                    isCurrent || isComplete
                      ? "font-semibold text-tipsy-ink"
                      : "text-tipsy-muted"
                  }
                >
                  {label}
                </span>
                {index < 3 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-5 left-[calc(50%+70px)] h-px w-9 bg-[#d8d3ca]"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
        <div
          className={`mt-4 grid grid-cols-1 gap-y-5 xl:items-start xl:gap-x-6 ${checkoutColumnLayout}`}
        >
          <aside className="hidden" aria-label="Checkout progress">
            <ol className="relative grid grid-cols-3 gap-2 text-[12px] before:absolute before:top-[18px] before:right-[16.66%] before:left-[16.66%] before:h-px before:bg-[#ded9d0] xl:hidden">
              {[
                { label: "Delivery", index: 1 },
                { label: "Pay", index: 2 },
                { label: "Done", index: 3 },
              ].map(({ label, index }) => {
                const isComplete = stepIndex > index;
                const isCurrent = stepIndex === index;
                return (
                  <li
                    className="relative flex flex-col items-center text-center"
                    key={label}
                  >
                    <span
                      className={`z-1 flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${isComplete ? "border border-tipsy-ink bg-white text-tipsy-ink" : isCurrent ? "bg-tipsy-amber-500 text-tipsy-ink" : "border border-[#ded9d0] bg-white text-tipsy-muted"}`}
                    >
                      {isComplete ? (
                        <StoreIcon className="size-3.5" name="check" />
                      ) : (
                        index
                      )}
                    </span>
                    <p className="mt-2 text-[13px] font-semibold text-tipsy-ink">
                      {label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-tipsy-muted">
                      {isComplete
                        ? "Complete"
                        : isCurrent
                          ? "In progress"
                          : "Next"}
                    </p>
                  </li>
                );
              })}
            </ol>
            <ol className="hidden text-[12px] xl:block">
              {[
                { label: "Delivery", index: 1 },
                { label: "Pay", index: 2 },
                { label: "Done", index: 3 },
              ].map(({ label, index }, progressIndex) => {
                const isComplete = stepIndex > index;
                const isCurrent = stepIndex === index;
                return (
                  <li className="flex gap-2.5" key={label}>
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${isComplete ? "border border-tipsy-ink bg-white text-tipsy-ink" : isCurrent ? "bg-tipsy-amber-500 text-tipsy-ink" : "border border-[#ded9d0] bg-white text-tipsy-muted"}`}
                      >
                        {isComplete ? (
                          <StoreIcon className="size-3.5" name="check" />
                        ) : (
                          index
                        )}
                      </span>
                      {progressIndex < 2 ? (
                        <span className="my-1.5 h-10 w-px bg-[#ded9d0]" />
                      ) : null}
                    </div>
                    <div className="min-w-0 pt-1 pb-7">
                      <p
                        className={`text-[15px] font-semibold ${isCurrent || isComplete ? "text-tipsy-ink" : "text-tipsy-ink"}`}
                      >
                        {label}
                      </p>
                      <p className="mt-0.5 hidden text-[12px] text-tipsy-muted sm:block">
                        {isComplete
                          ? "Complete"
                          : isCurrent
                            ? "In progress"
                            : "Next"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </aside>
          <section className="min-w-0 xl:col-span-1 xl:flex xl:self-stretch">
            {step === "details" ? (
              <form
                className={`${surfaceClass} checkout-step-enter p-5 sm:p-6`}
                onSubmit={(event) => {
                  event.preventDefault();
                  continueToPayment();
                }}
              >
                <h1 className="text-[27px] leading-tight font-semibold tracking-[-0.035em]">
                  Delivery details
                </h1>
                <p className="mt-2 text-[14px] leading-5 text-tipsy-muted">
                  We’ll use these details to send your M-Pesa prompt.
                </p>
                <div className="mt-6 grid gap-5">
                  <label className="grid gap-2.5 text-[14px] font-medium">
                    Name
                    <input
                      className="h-12 rounded-xl border border-[#d8d1c6] bg-white px-4 text-[15px] font-medium transition outline-none focus:border-tipsy-amber-500 focus:ring-2 focus:ring-tipsy-amber-100"
                      onChange={(event) =>
                        setCustomer((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Name"
                      required
                      value={customer.name}
                    />
                  </label>
                  <label className="grid gap-2.5 text-[14px] font-medium">
                    M-Pesa phone
                    <input
                      className="h-12 rounded-xl border border-[#d8d1c6] bg-white px-4 text-[15px] font-medium tracking-[0.01em] transition outline-none focus:border-tipsy-amber-500 focus:ring-2 focus:ring-tipsy-amber-100"
                      inputMode="tel"
                      onChange={(event) =>
                        setCustomer((current) => ({
                          ...current,
                          phone: formatKenyanPhone(event.target.value),
                        }))
                      }
                      placeholder="0712 345 678"
                      required
                      value={customer.phone}
                    />
                  </label>
                </div>
                <div className="mt-5 rounded-xl bg-tipsy-surface px-4 py-4">
                  <div className="flex items-center gap-3">
                    <StoreIcon className="size-5 shrink-0" name="location" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-tipsy-muted">
                        Current delivery location
                      </p>
                      <p className="mt-1 truncate text-[15px] font-semibold text-tipsy-ink">
                        {deliveryAddress || "Location not set"}
                      </p>
                    </div>
                    <button
                      aria-label="Update current location"
                      className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-tipsy-ink underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 disabled:opacity-60"
                      disabled={isRequestingLocation}
                      onClick={() => void updateCurrentLocation()}
                      type="button"
                    >
                      <StoreIcon
                        className="size-4"
                        name={
                          isRequestingLocation ? "current-location" : "pencil"
                        }
                      />
                      {isRequestingLocation ? "Locating…" : "Update"}
                    </button>
                  </div>
                  {!deliveryCoordinates ? (
                    <p className="mt-3 text-sm text-red-700">
                      Use current location to continue checkout.
                    </p>
                  ) : null}
                  <label className="mt-4 grid gap-2 text-[13px] font-medium text-tipsy-ink">
                    Extra directions{" "}
                    <span className="font-normal text-tipsy-muted">
                      (optional)
                    </span>
                    <textarea
                      className="min-h-20 rounded-xl border border-[#d8d1c6] bg-white px-3 py-2.5 text-[14px] font-normal transition outline-none placeholder:text-tipsy-muted focus:border-tipsy-amber-500 focus:ring-2 focus:ring-tipsy-amber-100"
                      maxLength={500}
                      onChange={(event) =>
                        setDeliveryInstructions(event.target.value)
                      }
                      placeholder="e.g. Hostel name and room number"
                      value={deliveryInstructions}
                    />
                  </label>
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#f3f6f2] px-4 py-3.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-tipsy-olive">
                    <StoreIcon className="size-4" name="check" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-tipsy-ink">
                      Delivery to {deliveryAddress || "your current location"}
                    </p>
                    <p className="mt-0.5 text-[13px] text-tipsy-muted">
                      Delivery fee: {formatPrice(deliveryFee)}
                      {deliveryQuote.distanceKm !== null
                        ? ` · approx. ${deliveryQuote.distanceKm.toFixed(1)} km × ${formatPrice(deliveryQuote.ratePerKm)}/km`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-6">
                  <button
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tipsy-amber-500 px-5 text-[15px] font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300 disabled:cursor-wait disabled:opacity-75"
                    disabled={isAdvancingToPayment}
                    type="submit"
                  >
                    {isAdvancingToPayment ? (
                      "Preparing payment…"
                    ) : (
                      <>
                        Continue to payment{" "}
                        <StoreIcon className="size-4" name="arrow-right" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : null}

            {step === "payment" ? (
              <section
                className={`${surfaceClass} checkout-step-enter w-full p-5 sm:p-6`}
              >
                <p className="text-[14px] font-semibold text-tipsy-amber-700">
                  M-Pesa payment
                </p>
                <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.035em] text-tipsy-ink">
                  Confirm payment
                </h1>
                <p className="mt-2 text-[15px] leading-5 text-tipsy-muted">
                  We’ll send an M-Pesa prompt to{" "}
                  <strong className="font-semibold text-tipsy-ink">
                    {customer.phone}
                  </strong>
                  .
                </p>
                <div className="mt-5 flex items-center gap-4 rounded-xl bg-tipsy-surface px-4 py-3">
                  <Image
                    alt="M-Pesa"
                    className="h-7 w-auto object-contain"
                    height={28}
                    src="/images/payment/mpesa.svg"
                    width={96}
                  />
                  <span className="h-6 w-px bg-[#d8d3ca]" />
                  <span className="text-[14px] font-medium text-tipsy-ink">
                    Secure M-Pesa checkout
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[#e9e5dd] px-4 py-3">
                  <div>
                    <p className="text-[13px] text-tipsy-muted">M-Pesa phone</p>
                    <p className="mt-0.5 text-[15px] font-semibold">
                      {customer.phone}
                    </p>
                  </div>
                  <button
                    className="text-[14px] font-semibold text-tipsy-ink underline decoration-tipsy-amber-500 decoration-2 underline-offset-4"
                    onClick={() => setStep("details")}
                    type="button"
                  >
                    Edit
                  </button>
                </div>
                <div className="mt-5 flex items-end justify-between border-y border-[#e2ded6] py-4">
                  <span className="text-[15px] text-tipsy-muted">
                    Amount due
                  </span>
                  <strong className="text-[26px] font-bold tracking-[-0.035em] text-tipsy-ink">
                    {formatPrice(total)}
                  </strong>
                </div>
                <button
                  className="mt-6 hidden h-12 w-full items-center justify-center gap-2 rounded-xl bg-tipsy-amber-500 px-5 text-[15px] font-semibold text-tipsy-ink transition hover:bg-tipsy-amber-300 disabled:cursor-wait disabled:opacity-70 sm:flex"
                  disabled={isSendingPayment}
                  onClick={() => void requestPayment()}
                  type="button"
                >
                  <StoreIcon className="size-4" name="bag" />
                  {isSendingPayment
                    ? "Sending prompt…"
                    : `Pay ${formatPrice(total)}`}
                </button>
              </section>
            ) : null}

            {step === "waiting" ? (
              <section
                className={`${surfaceClass} mt-5 p-6 text-center sm:p-7`}
              >
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-tipsy-surface text-tipsy-ink">
                  <span className="size-5 animate-spin rounded-full border-2 border-tipsy-line border-t-tipsy-ink" />
                </span>
                <p className="mt-4 text-sm font-semibold text-tipsy-amber-700">
                  M-Pesa payment
                </p>
                <h1 className="mt-1.5 text-[30px] font-bold tracking-[-0.05em]">
                  Waiting for confirmation
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-5 text-tipsy-muted">
                  Approve the M-Pesa prompt on your phone. This page checks the
                  verified M-Pesa result automatically and is safe to reopen.
                </p>
                {isIssueOpen ? (
                  <form
                    className="mt-6 text-left"
                    onSubmit={reportPaymentIssue}
                  >
                    <p className="mb-4 text-sm leading-5 text-tipsy-muted">
                      If you approved the prompt and received an M-Pesa message,
                      send its receipt code to support. We will review it
                      against this order.
                    </p>
                    <label className="grid gap-2 text-[13px] font-semibold">
                      M-Pesa receipt code
                      <input
                        autoCapitalize="characters"
                        className="h-11 rounded-xl border border-tipsy-line bg-white px-3.5 text-base font-normal tracking-[0.08em] uppercase transition outline-none focus:border-tipsy-amber-500 focus:ring-2 focus:ring-tipsy-amber-100"
                        maxLength={20}
                        onChange={(event) => {
                          setConfirmationCode(event.target.value.toUpperCase());
                          setConfirmationCodeError("");
                        }}
                        placeholder="e.g. QAB12C3D4E"
                        value={confirmationCode}
                      />
                      {confirmationCodeError ? (
                        <span className="text-xs font-medium text-red-700">
                          {confirmationCodeError}
                        </span>
                      ) : null}
                    </label>
                    <button
                      className="mt-4 h-11 w-full rounded-xl bg-tipsy-ink px-4 text-sm font-bold text-white transition hover:bg-tipsy-amber-700 disabled:cursor-wait disabled:opacity-70"
                      disabled={isCheckingCode}
                      type="submit"
                    >
                      {isCheckingCode ? "Sending report…" : "Report to support"}
                    </button>
                  </form>
                ) : (
                  <div className="mt-6 grid gap-3">
                    <button
                      className="text-sm font-semibold text-tipsy-muted underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 transition hover:text-tipsy-ink"
                      onClick={() => setIsIssueOpen(true)}
                      type="button"
                    >
                      Report a payment issue
                    </button>
                    <button
                      className="text-sm font-semibold text-tipsy-muted underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 transition hover:text-tipsy-ink disabled:opacity-60"
                      disabled={isCancellingPayment}
                      onClick={() => void cancelPendingPayment()}
                      type="button"
                    >
                      {isCancellingPayment
                        ? "Cancelling payment…"
                        : "Cancel payment"}
                    </button>
                  </div>
                )}
              </section>
            ) : null}

            {step === "failed" ? (
              <section
                className={`${surfaceClass} mt-5 p-6 text-center sm:p-7`}
              >
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-tipsy-surface text-tipsy-ink">
                  <StoreIcon className="size-6" name="close" />
                </span>
                <p className="mt-4 text-sm font-semibold text-tipsy-amber-700">
                  Payment not completed
                </p>
                <h1 className="mt-1.5 text-[30px] font-bold tracking-[-0.05em]">
                  {failedPaymentCopy.title}
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-5 text-tipsy-muted">
                  {failedPaymentCopy.description} Your reserved stock has been
                  released.
                </p>
                <div className="mt-6 grid gap-3">
                  <button
                    className="h-12 w-full rounded-xl bg-tipsy-amber-500 px-5 text-sm font-bold text-tipsy-ink transition hover:bg-tipsy-amber-300"
                    onClick={retryPayment}
                    type="button"
                  >
                    Retry payment
                  </button>
                  <button
                    className="h-11 text-sm font-semibold text-tipsy-muted underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 transition hover:text-tipsy-ink"
                    onClick={cancelCheckout}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </section>
            ) : null}

            {step === "complete" && checkoutSession ? (
              <section
                className={`${surfaceClass} mt-5 p-6 text-center sm:p-7`}
              >
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-tipsy-amber-500 text-tipsy-ink">
                  <StoreIcon className="size-6" name="check" />
                </span>
                <p className="mt-4 text-sm font-semibold text-tipsy-amber-700">
                  Payment successful
                </p>
                <h1 className="mt-1.5 text-[30px] font-bold tracking-[-0.05em]">
                  You’re all set
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-5 text-tipsy-muted">
                  Your payment is confirmed and your order is now being
                  prepared.
                </p>
                <div className="mt-6 rounded-xl bg-tipsy-surface p-4 text-left">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">Payment receipt</p>
                    <span className="rounded-full bg-tipsy-amber-500 px-2 py-1 text-[11px] font-bold text-tipsy-ink">
                      Paid
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-tipsy-muted">M-Pesa receipt</dt>
                      <dd className="font-bold tracking-[0.08em] text-tipsy-ink">
                        {paymentReceipt?.code ?? "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-tipsy-muted">Date & time</dt>
                      <dd className="text-right font-semibold text-tipsy-ink">
                        {paymentReceipt?.paidAt ?? "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-tipsy-muted">Paid from</dt>
                      <dd className="font-semibold text-tipsy-ink">
                        {customer.phone}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-tipsy-muted">Amount paid</dt>
                      <dd className="font-bold text-tipsy-ink">
                        {formatPrice(total)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-tipsy-muted">Order reference</dt>
                      <dd className="font-semibold text-tipsy-ink">
                        {checkoutSession.orderNumber}
                      </dd>
                    </div>
                  </dl>
                </div>
                <PostPurchaseAccount
                  accessToken={checkoutSession.accessToken}
                  displayName={customer.name}
                  onMessage={(title, description) =>
                    setToast({ title, description })
                  }
                  orderNumber={checkoutSession.orderNumber}
                  phone={customer.phone}
                  estimatedPoints={Math.floor(Math.max(0, checkoutSession.subtotal - checkoutSession.discount) / 10_000)}
                />
                <button
                  className="mt-6 h-12 w-full rounded-xl bg-tipsy-amber-500 px-5 text-sm font-bold text-tipsy-ink transition hover:bg-tipsy-amber-300"
                  onClick={() => setStep("tracking")}
                  type="button"
                >
                  Track order
                </button>
              </section>
            ) : null}

            {step === "tracking" && checkoutSession ? (
              <section className={`${surfaceClass} mt-5 p-6`}>
                <OrderTracking
                  location={deliveryAddress || deliveryLocation}
                  orderNumber={checkoutSession.orderNumber}
                  orderStatus={orderSnapshot?.status ?? "CONFIRMED"}
                />
              </section>
            ) : null}
          </section>

          <aside
            className={`${surfaceClass} p-4 sm:p-6 xl:sticky xl:top-6 xl:col-span-1 xl:flex xl:h-fit xl:flex-col`}
          >
            <div className="hidden items-center justify-between sm:flex">
              <h2 className="text-[22px] font-bold tracking-[-0.045em]">
                Order summary
              </h2>
              <span className="text-[15px] text-tipsy-muted">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            </div>
            <button
              aria-expanded={isMobileSummaryOpen}
              className="flex w-full items-center justify-between gap-3 text-left sm:hidden"
              onClick={() => setIsMobileSummaryOpen((current) => !current)}
              type="button"
            >
              <span>
                <span className="block text-[19px] font-bold tracking-[-0.04em]">
                  Order summary
                </span>
                <span className="mt-1 block text-[12px] text-tipsy-muted">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <strong className="text-[16px] whitespace-nowrap">
                  {formatPrice(total)}
                </strong>
                <StoreIcon
                  className={`size-4 transition-transform ${isMobileSummaryOpen ? "rotate-180" : ""}`}
                  name="arrow"
                />
              </span>
            </button>
            <div
              className={`${isMobileSummaryOpen ? "block" : "hidden"} sm:block`}
            >
              <div className="mt-5 grid gap-4 sm:mt-7 sm:gap-5">
                {summaryItems.map(({ product, quantity }) => (
                  <div
                    className="flex min-w-0 items-center gap-3"
                    key={product.id}
                  >
                    <div className="relative size-[62px] shrink-0 overflow-hidden rounded-xl bg-tipsy-surface sm:size-[68px]">
                      <BeverageImage
                        alt=""
                        className="object-contain p-1"
                        sizes="68px"
                        src={product.imageUrl}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[14px] font-semibold sm:text-[15px]">
                        {product.name ?? product.id}
                      </p>
                      <p className="mt-1 text-[12px] text-tipsy-muted sm:text-[13px]">
                        {quantity} × {formatPrice(product.price)}
                      </p>
                    </div>
                    <strong className="text-[14px] font-semibold whitespace-nowrap sm:text-[15px]">
                      {formatPrice(product.price * quantity)}
                    </strong>
                  </div>
                ))}
              </div>
              {items.length > SUMMARY_PAGE_SIZE ? (
                <button
                  aria-expanded={isSummaryExpanded}
                  className="mt-4 flex w-full items-center justify-between border-y border-[#e9e5dd] py-4 text-[14px] font-semibold text-tipsy-ink"
                  onClick={() => setIsSummaryExpanded((current) => !current)}
                  type="button"
                >
                  <span className="underline decoration-tipsy-amber-500 decoration-2 underline-offset-4">
                    {isSummaryExpanded
                      ? "Show fewer items"
                      : `View all ${items.length} items`}
                  </span>
                  <StoreIcon
                    className={`size-4 transition-transform ${isSummaryExpanded ? "rotate-90" : ""}`}
                    name="arrow-right"
                  />
                </button>
              ) : null}
              <dl className="mt-6 grid gap-3 text-[14px] sm:text-[15px]">
                <div className="flex justify-between text-tipsy-muted">
                  <dt>Subtotal</dt>
                  <dd>{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between text-tipsy-muted">
                  <dt>Delivery</dt>
                  <dd>{formatPrice(deliveryFee)}</dd>
                </div>
                <div className="mt-1 flex justify-between rounded-xl bg-tipsy-surface px-4 py-3 text-[21px] font-bold tracking-[-0.035em]">
                  <dt>Total</dt>
                  <dd>{formatPrice(total)}</dd>
                </div>
              </dl>
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-tipsy-surface px-4 py-3.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white">
                  <StoreIcon className="size-4" name="lock" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-tipsy-ink">
                    Secure checkout
                  </p>
                  <p className="mt-0.5 text-[13px] leading-5 text-tipsy-muted">
                    Your information is encrypted and your payments are safe
                    with M-Pesa.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
      {toast ? (
        <div
          aria-live="polite"
          className="location-saved-toast fixed top-5 left-1/2 z-[100000] flex w-[calc(100%-2rem)] max-w-sm items-center gap-3 rounded-2xl bg-tipsy-ink px-4 py-3 text-white shadow-2xl sm:w-auto"
          role="status"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tipsy-amber-500 text-tipsy-ink">
            <StoreIcon
              className="size-5"
              name={
                toast.title === "Payment wasn’t completed" ? "close" : "check"
              }
            />
          </span>
          <span>
            <span className="block text-sm font-bold">{toast.title}</span>
            {toast.description ? (
              <span className="mt-0.5 block text-xs text-white/70">
                {toast.description}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </main>
  );
}
