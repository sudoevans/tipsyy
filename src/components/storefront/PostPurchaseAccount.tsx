"use client";

import { useState } from "react";

interface Props {
  accessToken: string;
  displayName: string;
  onMessage: (title: string, description?: string) => void;
  orderNumber: string;
  phone: string;
}

async function apiRequest<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: { message?: string } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Please try again.");
  return payload.data;
}

export default function PostPurchaseAccount({ accessToken, displayName, onMessage, orderNumber, phone }: Props) {
  const [state, setState] = useState<"idle" | "sending" | "verify" | "verifying" | "complete">("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const requestCode = async () => {
    setState("sending");
    setError("");
    try {
      await apiRequest("/api/v1/auth/otp/request", { phone, purpose: "CREATE_ACCOUNT" });
      setState("verify");
      onMessage("Verification code sent", "Enter the six-digit code sent to your phone.");
    } catch (requestError) {
      setState("idle");
      setError(requestError instanceof Error ? requestError.message : "The code could not be sent.");
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) { setError("Enter the six-digit code from the SMS."); return; }
    setState("verifying");
    setError("");
    try {
      await apiRequest("/api/v1/auth/otp/verify", {
        phone,
        code,
        purpose: "CREATE_ACCOUNT",
        displayName,
        orderNumber,
        orderAccessToken: accessToken,
      });
      setState("complete");
      onMessage("Account created", "This order is now saved to your account.");
    } catch (verifyError) {
      setState("verify");
      setError(verifyError instanceof Error ? verifyError.message : "The code could not be verified.");
    }
  };

  return <div className="mt-5 rounded-xl bg-tipsy-surface p-4 text-left">
    <p className="text-sm font-bold">Save this order</p>
    {state === "complete" ? <p className="mt-2 text-sm font-semibold text-tipsy-olive">Account created. You’re signed in.</p> : <>
      <p className="mt-1 text-sm leading-5 text-tipsy-muted">Create an account with the phone number used for this order.</p>
      {state === "verify" || state === "verifying" ? <div className="mt-3 flex gap-2">
        <input aria-label="Six-digit verification code" className="h-11 min-w-0 flex-1 rounded-xl border border-tipsy-line bg-white px-3 text-center tracking-[0.18em] outline-none focus:border-tipsy-amber-500" inputMode="numeric" maxLength={6} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "")); setError(""); }} placeholder="000000" value={code} />
        <button className="h-11 rounded-xl bg-tipsy-ink px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={state === "verifying"} onClick={() => void verifyCode()} type="button">{state === "verifying" ? "Checking…" : "Verify"}</button>
      </div> : <button className="mt-3 text-sm font-bold text-tipsy-ink underline decoration-tipsy-amber-500 decoration-2 underline-offset-4 disabled:opacity-60" disabled={state === "sending"} onClick={() => void requestCode()} type="button">{state === "sending" ? "Sending code…" : "Create account with this number"}</button>}
      <button className="mt-3 block text-sm font-semibold text-tipsy-muted underline underline-offset-4" onClick={() => window.location.assign(new URL("/api/v1/auth/google/start", window.location.origin).toString())} type="button">Or continue with Google</button>
      {error ? <p className="mt-2 text-xs font-medium text-red-700">{error}</p> : null}
    </>}
  </div>;
}
