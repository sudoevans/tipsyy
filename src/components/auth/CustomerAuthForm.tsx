"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function CustomerAuthForm({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError("");
    try {
      const endpoint = stage === "phone" ? "/api/v1/auth/otp/request" : "/api/v1/auth/otp/verify";
      const body = stage === "phone"
        ? { phone, purpose: mode === "signup" ? "CREATE_ACCOUNT" : "LOGIN" }
        : { phone, code, purpose: mode === "signup" ? "CREATE_ACCOUNT" : "LOGIN", displayName: name || undefined };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Please try again.");
      if (stage === "phone") setStage("code"); else router.push("/");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  return <main className="grid min-h-dvh w-full place-items-center bg-[#faf9f6] px-4 py-8 text-[#15130f]">
    <section className="w-full max-w-md rounded-2xl border border-[#e9e5dd] bg-white p-6 sm:p-8">
      <Link className="text-[25px] font-bold tracking-[-0.075em]" href="/">tipsy<span className="text-[#ffc400]">.</span>theoryy</Link>
      <h1 className="mt-8 text-[28px] font-semibold tracking-[-0.04em]">{stage === "code" ? "Verify your phone" : mode === "signup" ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-[14px] leading-6 text-[#77736d]">{stage === "code" ? `Enter the six-digit code sent to ${phone}.` : "Use your phone number to continue securely without a password."}</p>
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        {stage === "phone" ? <>
          {mode === "signup" ? <label className="grid gap-2 text-[13px] font-semibold">Name<input className="h-12 rounded-xl border border-[#d8d1c6] px-4 text-[15px] outline-none focus:border-[#ffc400] focus:ring-2 focus:ring-[#fff0b5]" onChange={(event) => setName(event.target.value)} required value={name} /></label> : null}
          <label className="grid gap-2 text-[13px] font-semibold">Phone number<input className="h-12 rounded-xl border border-[#d8d1c6] px-4 text-[15px] outline-none focus:border-[#ffc400] focus:ring-2 focus:ring-[#fff0b5]" inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder="0712 345 678" required value={phone} /></label>
        </> : <label className="grid gap-2 text-[13px] font-semibold">Verification code<input autoFocus className="h-12 rounded-xl border border-[#d8d1c6] px-4 text-center text-[17px] tracking-[0.22em] outline-none focus:border-[#ffc400] focus:ring-2 focus:ring-[#fff0b5]" inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" required value={code} /></label>}
        {error ? <p className="text-[13px] font-medium text-red-700" role="alert">{error}</p> : null}
        <button className="h-12 rounded-xl bg-[#ffc400] px-5 text-[15px] font-semibold disabled:cursor-wait disabled:opacity-65" disabled={isBusy} type="submit">{isBusy ? "Please wait…" : stage === "phone" ? "Send verification code" : "Verify and continue"}</button>
      </form>
      {stage === "code" ? <button className="mt-4 text-sm font-semibold underline decoration-[#ffc400] decoration-2 underline-offset-4" onClick={() => { setStage("phone"); setCode(""); setError(""); }} type="button">Change phone number</button> : <>
        <div className="my-5 flex items-center gap-3 text-xs text-[#77736d]"><span className="h-px flex-1 bg-[#e9e5dd]" />or<span className="h-px flex-1 bg-[#e9e5dd]" /></div>
        <button className="flex h-12 w-full items-center justify-center rounded-xl bg-[#f5f3ee] text-[14px] font-semibold" onClick={() => window.location.assign(new URL("/api/v1/auth/google/start", window.location.origin).toString())} type="button">Continue with Google</button>
        <p className="mt-5 text-center text-[13px] text-[#77736d]">{mode === "signup" ? "Already have an account?" : "New to Tipsy Theoryy?"} <Link className="font-semibold text-[#15130f] underline decoration-[#ffc400] decoration-2 underline-offset-4" href={mode === "signup" ? "/signin" : "/signup"}>{mode === "signup" ? "Sign in" : "Create account"}</Link></p>
      </>}
    </section>
  </main>;
}
