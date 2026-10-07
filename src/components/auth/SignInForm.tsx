"use client";

import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useRouter } from "@/i18n/navigation";
import { FormEvent, useState } from "react";

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("Checking your credentials…");
    try {
      const response = await fetch("/api/v1/admin/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) {
        const fallback = response.status === 401
          ? "That username or password is incorrect. Check both and try again."
          : response.status === 429
            ? "Too many sign-in attempts. Wait a few minutes, then try again."
            : response.status >= 500
              ? "The admin service could not sign you in. Please try again."
              : "We could not sign you in with those details.";
        throw new Error(payload?.error?.message ?? fallback);
      }
      setMessage("Signed in successfully. Opening the dashboard…");
      router.replace("/admin");
      router.refresh();
    } catch (cause) {
      setMessage("");
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10 sm:px-0">
        <div className="mb-5 sm:mb-8">
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 sm:text-title-md dark:text-white/90">Sign In</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Enter your admin username and password to sign in.</p>
        </div>
        <form onSubmit={submit}>
          <div className="space-y-6">
            <div><Label htmlFor="admin-username">Username <span className="text-error-500">*</span></Label><Input id="admin-username" name="username" autoComplete="username" autoCapitalize="none" error={Boolean(error)} placeholder="Enter your username" required spellCheck={false} value={username} onChange={(event) => { setUsername(event.target.value); if (error) setError(""); }} /></div>
            <div><Label htmlFor="admin-password">Password <span className="text-error-500">*</span></Label><div className="relative"><Input id="admin-password" name="password" autoComplete="current-password" error={Boolean(error)} type={showPassword ? "text" : "password"} placeholder="Enter your password" required value={password} onChange={(event) => { setPassword(event.target.value); if (error) setError(""); }} /><button aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="inset-e-4 absolute top-1/2 z-30 -translate-y-1/2" type="button">{showPassword ? <EyeIcon className="fill-gray-500 dark:fill-gray-400" /> : <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />}</button></div></div>
            {error ? <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-error-700 dark:border-error-500/30 dark:bg-error-500/15 dark:text-error-400" role="alert"><p className="text-sm font-semibold">Sign-in failed</p><p className="mt-1 text-sm">{error}</p></div> : null}
            {message ? <p aria-live="polite" className="rounded-lg bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{message}</p> : null}
            <Button className="w-full" disabled={submitting} size="sm" type="submit">{submitting ? "Signing in…" : "Sign in"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
