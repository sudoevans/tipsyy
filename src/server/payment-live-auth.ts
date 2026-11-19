import { SignJWT, jwtVerify } from "jose";

export const PAYMENT_LIVE_COOKIE = "tipsy-payment-live";
const issuer = "tipsy-payment-live";

export function paymentLivePath(orderNumber: string) {
  return `/api/v1/orders/${encodeURIComponent(orderNumber)}/live`;
}

export async function createPaymentLiveToken(orderNumber: string, secret: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer).setAudience(orderNumber).setSubject(orderNumber)
    .setIssuedAt().setExpirationTime("2m")
    .sign(new TextEncoder().encode(secret));
}

export async function verifyPaymentLiveToken(token: string, orderNumber: string, secret: string) {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ["HS256"], issuer, audience: orderNumber,
  });
  if (payload.sub !== orderNumber) throw new Error("Invalid payment subscription.");
}
