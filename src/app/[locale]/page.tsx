import StorefrontHome from "@/components/storefront/StorefrontHome";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TipsyTheoryy | Drinks delivered",
  description: "Browse drinks, mixers and more for fast delivery.",
};

export default function HomePage() {
  return <StorefrontHome />;
}
