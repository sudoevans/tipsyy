import CustomerAuthForm from "@/components/auth/CustomerAuthForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | Tipsy Theoryy",
  description: "Sign in to your Tipsy Theoryy account with a phone verification code.",
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ authError?: string }> }) {
  const query = await searchParams;
  return <CustomerAuthForm mode="signin" initialError={query.authError === "google" ? "We couldn't sign you in with Google. Please use your phone number or try again later." : ""} />;
}
