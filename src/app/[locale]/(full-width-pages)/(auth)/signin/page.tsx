import CustomerAuthForm from "@/components/auth/CustomerAuthForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | Tipsy Theoryy",
  description: "Sign in to your Tipsy Theoryy account with a phone verification code.",
};

export default function SignIn() {
  return <CustomerAuthForm mode="signin" />;
}
