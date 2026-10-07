import CustomerAuthForm from "@/components/auth/CustomerAuthForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up | TipsyAdmin",
  description: "Create a TipsyAdmin account.",
  // other metadata
};

export default function SignUp() {
  return <CustomerAuthForm mode="signup" />;
}
